"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { REMINDER_TIERS } from "@/lib/notify/reminder-plan";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { MerchantSettings, SubscriptionTier } from "@/types/database";

import { updateReminderSettings, type BookingSettingsState } from "./booking-settings-actions";
import { SaveFooter, type SettingsAction } from "./customer-policy-form";

type Settings = Pick<
  MerchantSettings,
  "reminder_whatsapp" | "reminder_email" | "reminder_push" | "reminder_day_before" | "reminder_same_day"
>;

const INITIAL: BookingSettingsState = { status: "idle" };

const CHANNELS = [
  { name: "reminder_whatsapp", label: "WhatsApp", hint: "Paling sering dibaca." },
  { name: "reminder_email", label: "Email", hint: "Dengan file kalender .ics." },
  {
    name: "reminder_push",
    label: "Notifikasi HP",
    hint: "Gratis, tanpa aplikasi. Di iPhone pelanggan perlu menambah halaman ke Layar Utama.",
  },
] as const;

export function ReminderSettingsForm({
  settings,
  tier,
  action = updateReminderSettings,
}: {
  settings: Settings;
  tier: SubscriptionTier;
  action?: SettingsAction;
}) {
  const [state, formAction] = useActionState(action, INITIAL);
  const [dayBefore, setDayBefore] = useState(settings.reminder_day_before);
  const [sameDay, setSameDay] = useState(settings.reminder_same_day);
  const allowed = REMINDER_TIERS.includes(tier);

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Pengingat untuk pelanggan</CardTitle>
        <CardDescription>
          Kanal yang Anda nyalakan bisa dipilih pelanggan. Pelanggan tetap bisa mematikannya sendiri.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-5">
          {!allowed ? (
            <p className="text-muted-foreground text-sm">
              Pengingat untuk pelanggan tersedia di paket Pro dan Studio.{" "}
              <Link href={ROUTES.billing} className="text-foreground underline underline-offset-4">
                Lihat paket
              </Link>
            </p>
          ) : null}

          {CHANNELS.map((c) => (
            <div key={c.name} className="flex min-h-11 items-start justify-between gap-4">
              <label htmlFor={c.name} className="flex flex-col gap-0.5 text-sm">
                <span className="font-medium">{c.label}</span>
                <span className="text-muted-foreground">{c.hint}</span>
              </label>
              <Switch id={c.name} name={c.name} defaultChecked={settings[c.name]} disabled={!allowed} />
            </div>
          ))}

          <fieldset className="flex flex-col gap-2" disabled={!allowed}>
            <legend className="text-sm font-medium">Jadwal bawaan</legend>
            <div className="flex flex-wrap gap-2">
              <Toggle name="reminder_day_before" label="H-1 sekitar pukul 08.00" on={dayBefore} onChange={setDayBefore} />
              <Toggle name="reminder_same_day" label="Pagi hari jadwal" on={sameDay} onChange={setSameDay} />
            </div>
          </fieldset>

          <SaveFooter state={state} disabled={!allowed} />
        </form>
      </CardContent>
    </Card>
  );
}

function Toggle({ name, label, on, onChange }: { name: string; label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <>
      {on ? <input type="hidden" name={name} value="on" /> : null}
      <button
        type="button"
        aria-pressed={on}
        onClick={() => onChange(!on)}
        className={cn(
          "min-h-11 rounded-md border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50",
          on ? "border-foreground bg-foreground text-background" : "bg-background",
        )}
      >
        {label}
      </button>
    </>
  );
}
