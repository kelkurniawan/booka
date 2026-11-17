"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ROUTES } from "@/lib/routes";
import type { MerchantSettings } from "@/types/database";

import { updateBookingSettings, type BookingSettingsState } from "./booking-settings-actions";

type Settings = Pick<
  MerchantSettings,
  "allow_pay_on_site" | "auto_confirm_on_site" | "max_active_per_phone" | "deposit_after_no_show"
>;

const INITIAL: BookingSettingsState = { status: "idle" };

export function BookingSettingsForm({
  settings,
  onSiteServices,
  action = updateBookingSettings,
}: {
  settings: Settings;
  onSiteServices: { id: string; name: string }[];
  /** Bisa diganti (Storybook); bawaannya server action asli. */
  action?: (prev: BookingSettingsState, formData: FormData) => Promise<BookingSettingsState>;
}) {
  const [state, formAction] = useActionState(action, INITIAL);
  const [allow, setAllow] = useState(settings.allow_pay_on_site);
  const [limited, setLimited] = useState(settings.max_active_per_phone !== null);

  useEffect(() => {
    if (state.status === "success") toast.success("Perubahan tersimpan");
  }, [state]);

  return (
    <Card className="max-w-lg" data-tour="settings-booking">
      <CardHeader>
        <CardTitle>Booking tanpa bayar</CardTitle>
        <CardDescription>Atur layanan yang boleh dibayar di tempat dan cara menjaga dari no-show.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-4">
              <label htmlFor="allow_pay_on_site" className="flex flex-col gap-0.5 text-sm">
                <span className="font-medium">Izinkan booking tanpa bayar di muka</span>
                <span className="text-muted-foreground">
                  Pelanggan memesan dulu dan membayar di tempat. Berlaku untuk layanan yang cara bayarnya &quot;Bayar
                  di tempat&quot;.
                </span>
              </label>
              <Switch id="allow_pay_on_site" name="allow_pay_on_site" checked={allow} onCheckedChange={setAllow} />
            </div>
            {allow ? (
              <p className="text-muted-foreground text-sm">
                {onSiteServices.length > 0
                  ? `Dipakai oleh ${onSiteServices.length} layanan: ${onSiteServices.map((s) => s.name).join(", ")}. `
                  : "Belum ada layanan yang memakainya. "}
                <Link href={ROUTES.services} className="text-foreground underline underline-offset-4">
                  Atur per layanan
                </Link>
              </p>
            ) : onSiteServices.length > 0 ? (
              <Alert>
                <AlertDescription>
                  Mati: {onSiteServices.length} layanan yang memakai &quot;Bayar di tempat&quot; otomatis meminta bayar
                  penuh saat booking sampai fitur ini dinyalakan lagi. Booking yang sudah ada tidak berubah.
                </AlertDescription>
              </Alert>
            ) : null}
          </div>

          <div className="flex items-start justify-between gap-4">
            <label htmlFor="auto_confirm_on_site" className="flex flex-col gap-0.5 text-sm">
              <span className="font-medium">Konfirmasi otomatis</span>
              <span className="text-muted-foreground">
                Jika dimatikan, setiap booking menunggu persetujuan Anda.
              </span>
            </label>
            <Switch
              id="auto_confirm_on_site"
              name="auto_confirm_on_site"
              defaultChecked={settings.auto_confirm_on_site}
            />
          </div>

          <div className="flex min-h-11 flex-wrap items-center gap-2 text-sm">
            <input
              id="limit_toggle"
              type="checkbox"
              checked={limited}
              onChange={(e) => setLimited(e.target.checked)}
              className="size-4"
            />
            {/* Label setinggi 44px jadi area sentuh kotak centang. */}
            <label htmlFor="limit_toggle" className="inline-flex min-h-11 items-center">
              Satu nomor WhatsApp maksimal
            </label>
            <Input
              name="max_active_per_phone"
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              defaultValue={settings.max_active_per_phone ?? 2}
              disabled={!limited}
              aria-label="Batas booking aktif per nomor"
              className="w-20"
            />
            <span>booking aktif</span>
          </div>

          <div className="flex min-h-11 items-center gap-2 text-sm">
            <input
              id="deposit_after_no_show"
              name="deposit_after_no_show"
              type="checkbox"
              defaultChecked={settings.deposit_after_no_show}
              className="size-4"
            />
            <label htmlFor="deposit_after_no_show" className="flex min-h-11 flex-1 items-center">
              Nomor yang pernah tidak datang wajib bayar di muka di booking berikutnya
            </label>
          </div>

          {state.status === "error" ? (
            <Alert variant="destructive">
              <AlertTitle>Gagal menyimpan</AlertTitle>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}

          <div>
            <SubmitButton />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Spinner /> : null}
      Simpan perubahan
    </Button>
  );
}
