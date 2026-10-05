"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { OptionCard, OptionCardGroup } from "@/components/ui/option-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ID_PROVINCE_LABELS, TEAM_SIZE_LABELS } from "@/lib/business/labels";
import { ID_PROVINCE_VALUES, TEAM_SIZE_VALUES } from "@/lib/validations/onboarding";
import type { IdProvince, TeamSize } from "@/types/database";

import { skipOptionalProfile } from "../actions";

/** Provinsi terurut abjad -- ID_PROVINCE_VALUES sendiri urut kepulauan, bukan abjad. */
const PROVINCES_SORTED = [...ID_PROVINCE_VALUES].sort((a, b) =>
  ID_PROVINCE_LABELS[a].localeCompare(ID_PROVINCE_LABELS[b], "id"),
);

/**
 * Bonus A: ukuran tim + provinsi. Dipakai wizard (setelah layar sukses) DAN
 * `ProfileNudge` di dashboard lewat komponen yang persis sama -- lihat spec
 * bagian 8.5.
 *
 * "Lewati" di sini SENGAJA sama menonjol dengan "Lanjut" (dua tombol
 * berdampingan, gaya sama) dan langsung memanggil `skipOptionalProfile()`
 * sendiri -- TIDAK menurunkan merchant ke langkah `kebutuhan`. Itu bukan
 * "melewati sebagian", itu keluar sepenuhnya dari blok opsional (spec 5.3).
 */
export function StepProfil({
  teamSize,
  province,
  onChange,
  onNext,
}: {
  teamSize: TeamSize | null;
  province: IdProvince | null;
  onChange: (next: { teamSize: TeamSize | null; province: IdProvince | null }) => void;
  onNext: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [skipping, startSkipping] = useTransition();

  function lewati() {
    setError(null);
    startSkipping(async () => {
      // Berhasil berarti skipOptionalProfile() redirect ke dashboard dan baris
      // di bawah tidak pernah tercapai -- sama seperti pola di step-sukses.tsx.
      const hasil = await skipOptionalProfile();
      setError(hasil.message ?? "Gagal menyimpan. Coba lagi.");
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <OptionCardGroup aria-label="Ukuran tim">
        {TEAM_SIZE_VALUES.map((value) => (
          <OptionCard
            key={value}
            name="team_size"
            value={value}
            checked={teamSize === value}
            onSelect={() => onChange({ teamSize: value, province })}
            label={TEAM_SIZE_LABELS[value]}
          />
        ))}
      </OptionCardGroup>

      <Field>
        <FieldLabel htmlFor="profil_province">Provinsi</FieldLabel>
        <Select
          value={province ?? undefined}
          onValueChange={(value) => onChange({ teamSize, province: value as IdProvince })}
        >
          <SelectTrigger id="profil_province" className="min-h-11 w-full">
            <SelectValue placeholder="Pilih provinsi" />
          </SelectTrigger>
          <SelectContent>
            {PROVINCES_SORTED.map((value) => (
              <SelectItem key={value} value={value}>
                {ID_PROVINCE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onNext}
            disabled={skipping}
            className="min-h-11 w-full"
          >
            Lanjut
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={lewati}
            disabled={skipping}
            className="min-h-11 w-full"
          >
            {skipping ? <Spinner /> : null}
            Lewati
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
