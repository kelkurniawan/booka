"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ManageSettings } from "@/lib/booking/customer-manage";

import { updateCustomerPolicy, type BookingSettingsState } from "./booking-settings-actions";

export type SettingsAction = (prev: BookingSettingsState, formData: FormData) => Promise<BookingSettingsState>;

const INITIAL: BookingSettingsState = { status: "idle" };

/** Tombol simpan + pesan hasil, dipakai ketiga kartu pengaturan pelanggan. */
export function SaveFooter({ state, disabled }: { state: BookingSettingsState; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <>
      {state.status === "error" ? (
        <Alert>
          <AlertTitle>Gagal menyimpan</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex min-h-11 flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || disabled}>
          {pending ? <Spinner /> : null}
          Simpan perubahan
        </Button>
        {state.status === "success" ? (
          <p role="status" className="text-muted-foreground text-sm">
            Perubahan tersimpan
          </p>
        ) : null}
      </div>
    </>
  );
}

export function CustomerPolicyForm({
  settings,
  action = updateCustomerPolicy,
}: {
  settings: ManageSettings;
  action?: SettingsAction;
}) {
  const [state, formAction] = useActionState(action, INITIAL);
  const [reschedule, setReschedule] = useState(settings.allow_customer_reschedule);
  const [cancel, setCancel] = useState(settings.allow_customer_cancel);

  return (
    <Card className="max-w-lg" data-tour="settings-customer">
      <CardHeader>
        <CardTitle>Ubah jadwal &amp; batal oleh pelanggan</CardTitle>
        <CardDescription>Pelanggan mengelola booking dari tautan di pesan konfirmasi mereka.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="flex min-h-11 items-center justify-between gap-4">
              <label htmlFor="allow_customer_reschedule" className="text-sm font-medium">
                Pelanggan boleh ubah jadwal sendiri
              </label>
              <Switch
                id="allow_customer_reschedule"
                name="allow_customer_reschedule"
                checked={reschedule}
                onCheckedChange={setReschedule}
              />
            </div>
            {reschedule ? (
              <div className="flex flex-col gap-2 text-sm">
                <HoursRow label="Paling lambat" name="reschedule_min_hours" value={settings.reschedule_min_hours} />
                <div className="flex min-h-11 flex-wrap items-center gap-2">
                  <span>Maksimal</span>
                  <Input
                    name="max_reschedules"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={5}
                    defaultValue={settings.max_reschedules}
                    aria-label="Maksimal ubah jadwal"
                    className="w-20"
                  />
                  <span>kali</span>
                </div>
              </div>
            ) : (
              <HiddenKeep name="reschedule_min_hours" value={settings.reschedule_min_hours} extra={["max_reschedules", settings.max_reschedules]} />
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex min-h-11 items-center justify-between gap-4">
              <label htmlFor="allow_customer_cancel" className="text-sm font-medium">
                Pelanggan boleh batal sendiri
              </label>
              <Switch id="allow_customer_cancel" name="allow_customer_cancel" checked={cancel} onCheckedChange={setCancel} />
            </div>
            {cancel ? (
              <div className="text-sm">
                <HoursRow label="Paling lambat" name="cancel_min_hours" value={settings.cancel_min_hours} />
              </div>
            ) : (
              <HiddenKeep name="cancel_min_hours" value={settings.cancel_min_hours} />
            )}
          </div>

          <div className="flex flex-col gap-1.5 text-sm">
            <label htmlFor="policy_text" className="font-medium">
              Kebijakan yang dilihat pelanggan
            </label>
            <Textarea
              id="policy_text"
              name="policy_text"
              rows={3}
              maxLength={500}
              defaultValue={settings.policy_text ?? ""}
              placeholder="DP tidak dikembalikan jika dibatalkan, tetapi bisa dipakai untuk jadwal baru."
            />
            <p className="text-muted-foreground">Pengembalian DP tidak diproses otomatis. Uang ada di akun payment Anda.</p>
          </div>

          <SaveFooter state={state} />
        </form>
      </CardContent>
    </Card>
  );
}

function HoursRow({ label, name, value }: { label: string; name: string; value: number }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-2">
      <span>{label}</span>
      <Input
        name={name}
        type="number"
        inputMode="numeric"
        min={0}
        max={168}
        defaultValue={value}
        aria-label={`${label} (jam sebelum jadwal)`}
        className="w-20"
      />
      <span>jam sebelum jadwal</span>
    </div>
  );
}

// Input yang disembunyikan tidak ikut terkirim; kirim nilai lama supaya skema tetap lengkap.
function HiddenKeep({ name, value, extra }: { name: string; value: number; extra?: [string, number] }) {
  return (
    <>
      <input type="hidden" name={name} value={value} />
      {extra ? <input type="hidden" name={extra[0]} value={extra[1]} /> : null}
    </>
  );
}
