"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import type { ReminderView } from "./booking-status-view";
import { IOS_INSTALL_HINT, subscribePush, usePushSupport } from "./push-client";

const dismissKey = (bookingId: string) => `marky-push-dismissed-${bookingId}`;

function wasDismissed(bookingId: string): boolean {
  try {
    return localStorage.getItem(dismissKey(bookingId)) === "1";
  } catch {
    return false;
  }
}

const offsetText = (o: ReminderView["offsets"]) =>
  o.dayBefore && o.sameDay ? "H-1 dan pagi hari jadwal" : o.sameDay ? "pagi hari jadwal" : "H-1";

/** Ajakan aktifkan notifikasi HP di P1; hilang bila tak didukung, ditolak, atau ditutup. */
export function PushPrompt({ token, bookingId, vapidPublicKey, offsets }: {
  token: string; bookingId: string; vapidPublicKey: string; offsets: ReminderView["offsets"];
}) {
  const router = useRouter();
  const support = usePushSupport();
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (support === null || support === "unsupported" || support === "denied" || closed || wasDismissed(bookingId)) return null;

  function dismiss() {
    try {
      localStorage.setItem(dismissKey(bookingId), "1");
    } catch {
      // penyimpanan diblokir: cukup tutup untuk sesi ini
    }
    setClosed(true);
  }

  async function enable() {
    setBusy(true);
    setError(null);
    const result = await subscribePush(token, vapidPublicKey);
    if (result.ok) router.refresh();
    else setError(result.message);
    setBusy(false);
  }

  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-[var(--radius)] border p-4">
      <h2 className="font-medium">Mau diingatkan di HP ini?</h2>
      <p className="text-muted-foreground text-sm text-pretty">
        {`Notifikasi muncul ${offsetText(offsets)}, tanpa perlu buka WhatsApp.`}
      </p>
      {support === "ios-needs-install" ? (
        <p className="text-sm text-pretty">{IOS_INSTALL_HINT}</p>
      ) : null}
      {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={dismiss}>Nanti saja</Button>
        {support === "available" ? (
          <Button type="button" className="min-h-11 flex-1" disabled={busy} onClick={() => void enable()}>Aktifkan</Button>
        ) : null}
      </div>
    </section>
  );
}
