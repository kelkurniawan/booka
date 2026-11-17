"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { OptionCard, OptionCardGroup } from "@/components/ui/option-card";
import { Spinner } from "@/components/ui/spinner";
import { ROUTES } from "@/lib/routes";
import type { CapacitySettingsInput } from "@/lib/validations/dining";
import type { MerchantSettings, TableMode } from "@/types/database";

import { saveCapacitySettings } from "./actions";

type Settings = Pick<
  MerchantSettings,
  "table_mode" | "seats_per_slot" | "table_hold_minutes" | "auto_join_tables"
>;

const MODES: { value: TableMode; label: string; description: string }[] = [
  { value: "NONE", label: "Mati", description: "Setiap jam hanya untuk satu booking, seperti layanan biasa." },
  { value: "AREA", label: "Total kursi per jam", description: "Reservasi dibatasi jumlah kursi, tanpa denah." },
  {
    value: "TABLE",
    label: "Pakai denah meja",
    description: "Marky menghitung per meja. Pelanggan bisa memilih meja atau dipilihkan.",
  },
];

export function CapacitySettingsForm({
  settings,
  hasReservationService,
  save = saveCapacitySettings,
}: {
  settings: Settings;
  /** Ada layanan yang ditandai reservasi meja (seat_duration_minutes terisi). */
  hasReservationService: boolean;
  /** Bisa diganti (Storybook); bawaannya server action asli. */
  save?: (input: CapacitySettingsInput) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [mode, setMode] = useState<TableMode>(settings.table_mode);
  const [seats, setSeats] = useState(settings.seats_per_slot?.toString() ?? "");
  const [hold, setHold] = useState(settings.table_hold_minutes.toString());
  const [autoJoin, setAutoJoin] = useState(settings.auto_join_tables);
  const [error, setError] = useState<{ field?: "seats"; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const hasil = await save({
        tableMode: mode,
        seatsPerSlot: seats,
        tableHoldMinutes: hold,
        autoJoinTables: autoJoin,
      });
      if (hasil.ok) toast.success("Perubahan tersimpan");
      else setError({ field: hasil.error.includes("kapasitas kursi") ? "seats" : undefined, message: hasil.error });
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Kapasitas</CardTitle>
        <CardDescription>Cara Marky membatasi jumlah reservasi di satu jam.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium">Cara menghitung reservasi</legend>
            <OptionCardGroup className="lg:grid-cols-1 sm:grid-cols-1">
              {MODES.map((m) => (
                <OptionCard
                  key={m.value}
                  name="table_mode"
                  value={m.value}
                  checked={mode === m.value}
                  onSelect={(v) => setMode(v as TableMode)}
                  label={m.label}
                  description={m.description}
                />
              ))}
            </OptionCardGroup>
          </fieldset>

          {mode !== settings.table_mode ? (
            <p className="text-muted-foreground text-sm">Reservasi yang sudah ada tetap memakai cara lama.</p>
          ) : null}

          {mode === "AREA" ? (
            <Field data-invalid={error?.field === "seats"}>
              <FieldLabel htmlFor="seats_per_slot">Kapasitas per jam</FieldLabel>
              <div className="flex items-center gap-2 text-sm">
                <Input
                  id="seats_per_slot"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1000}
                  value={seats}
                  onChange={(e) => setSeats(e.target.value)}
                  aria-invalid={error?.field === "seats"}
                  className="w-28"
                />
                <span>kursi</span>
              </div>
              {error?.field === "seats" ? <FieldError>{error.message}</FieldError> : null}
            </Field>
          ) : null}

          {mode !== "NONE" ? (
            <Field>
              <FieldLabel htmlFor="table_hold_minutes">Meja ditahan jika telat</FieldLabel>
              <div className="flex items-center gap-2 text-sm">
                <Input
                  id="table_hold_minutes"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={120}
                  value={hold}
                  onChange={(e) => setHold(e.target.value)}
                  className="w-28"
                />
                <span>menit</span>
              </div>
            </Field>
          ) : null}

          {mode === "TABLE" ? (
            <div className="flex min-h-11 items-center gap-2 text-sm">
              <input
                id="auto_join_tables"
                type="checkbox"
                checked={autoJoin}
                onChange={(e) => setAutoJoin(e.target.checked)}
                className="size-4"
              />
              <label htmlFor="auto_join_tables" className="inline-flex min-h-11 flex-1 items-center">
                Gabung meja otomatis untuk rombongan
              </label>
            </div>
          ) : null}

          {mode !== "NONE" && !hasReservationService ? (
            <p className="text-muted-foreground text-sm">
              Tandai layanan sebagai reservasi meja agar kapasitas ini dipakai.{" "}
              <Link href={ROUTES.services} className="text-foreground underline underline-offset-4">
                Buka Layanan
              </Link>
            </p>
          ) : null}

          {error && !error.field ? (
            <Alert variant="destructive">
              <AlertTitle>Gagal menyimpan</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          ) : null}

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              Simpan
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
