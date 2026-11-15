"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatDateTime, MONTHS_ID_SHORT, toJakartaWallClock, WEEKDAYS_ID } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { reminderPrefsSchema } from "@/lib/validations/reminder-prefs";

import type { ReminderView } from "../booking-status-view";
import { IOS_INSTALL_HINT, subscribePush, unsubscribePush, usePushSupport } from "../push-client";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Jum 20 Nov" */
function hariSingkat(ms: number): string {
  const p = toJakartaWallClock(new Date(ms));
  return `${WEEKDAYS_ID[p.weekday].slice(0, 3)} ${p.day} ${MONTHS_ID_SHORT[p.month]}`;
}

function SwitchRow({ id, label, hint, checked, onChange, disabled, children }: {
  id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void;
  disabled?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <Label htmlFor={id} className="flex flex-1 flex-col items-start gap-0.5">
          <span className="font-medium">{label}</span>
          <span className="text-muted-foreground text-sm font-normal">{hint}</span>
        </Label>
        <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
      </div>
      {children}
    </div>
  );
}

export function ReminderForm({ token, vapidPublicKey, serviceName, startISO, phoneLast4, offered, initial }: {
  token: string;
  vapidPublicKey: string | undefined;
  serviceName: string;
  startISO: string;
  phoneLast4: string;
  offered: ReminderView["channelsOffered"];
  initial: { whatsapp: boolean; email: string | null; dayBefore: boolean; sameDay: boolean; push: boolean };
}) {
  const router = useRouter();
  const support = usePushSupport();
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp);
  const [emailOn, setEmailOn] = useState(!!initial.email);
  const [email, setEmail] = useState(initial.email ?? "");
  const [dayBefore, setDayBefore] = useState(initial.dayBefore);
  const [sameDay, setSameDay] = useState(initial.sameDay);
  const [push, setPush] = useState(initial.push);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const showPush = offered.push && !!vapidPublicKey;
  const emailValid = reminderPrefsSchema.shape.email.safeParse(email.trim()).success && email.trim() !== "";
  const channels =
    (offered.whatsapp && whatsapp ? 1 : 0) + (offered.email && emailOn && emailValid ? 1 : 0) + (showPush && push ? 1 : 0);
  const offsets = (dayBefore ? 1 : 0) + (sameDay ? 1 : 0);
  const summary = channels > 0 && offsets > 0 ? `${offsets * channels} pengingat lewat ${channels} kanal.` : "Tidak ada pengingat yang akan dikirim.";

  async function togglePush(next: boolean) {
    if (!vapidPublicKey || pushBusy) return;
    setPushBusy(true);
    setPushMsg(next ? "Mengaktifkan notifikasi..." : "Mematikan notifikasi...");
    const result = next ? await subscribePush(token, vapidPublicKey) : await unsubscribePush(token);
    if (result.ok) {
      setPush(next);
      setPushMsg(next ? "Notifikasi di HP ini aktif." : "Notifikasi di HP ini dimatikan.");
    } else {
      setPushMsg(result.message);
    }
    setPushBusy(false);
  }

  async function save() {
    if (busy) return;
    setError(null);
    if (offered.email && emailOn && !emailValid) {
      setEmailError("Alamat email tidak valid.");
      return;
    }
    setEmailError(null);
    setBusy(true);
    try {
      const response = await fetch(ROUTES.bookingRemindersApi(token), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsapp,
          email: emailOn ? email.trim() : null,
          day_before: dayBefore,
          same_day: sameDay,
        }),
      });
      if (response.ok) {
        router.push(ROUTES.bookingStatus(token));
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      setError(
        body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : "Gagal menyimpan. Coba lagi.",
      );
    } catch {
      setError("Gagal menyimpan, periksa koneksi lalu coba lagi.");
    }
    setBusy(false);
  }

  const pushDisabled = pushBusy || support === "unsupported" || support === "ios-needs-install" || support === "denied";
  const pushHint =
    support === "ios-needs-install" ? IOS_INSTALL_HINT
    : support === "unsupported" ? "Browser ini tidak mendukung notifikasi."
    : support === "denied" ? "Izin notifikasi ditolak. Ubah di pengaturan browser."
    : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link
          href={ROUTES.bookingStatus(token)}
          aria-label="Kembali ke booking Anda"
          className="-ml-3 inline-flex size-11 items-center justify-center"
        >
          <ChevronLeft aria-hidden className="size-5" />
        </Link>
        <p className="text-muted-foreground text-sm">{`${serviceName}, ${formatDateTime(startISO)}`}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Pengingat</h1>
      </header>

      <section className="flex flex-col gap-1">
        <h2 className="font-medium">Kirim lewat</h2>
        {showPush ? (
          <SwitchRow
            id="rem-push"
            label="Notifikasi di HP ini"
            hint="Muncul di layar kunci. Tanpa aplikasi."
            checked={push}
            onChange={(v) => void togglePush(v)}
            disabled={pushDisabled}
          >
            {pushHint ? <p className="text-muted-foreground text-sm text-pretty">{pushHint}</p> : null}
            <p role="status" className="text-sm">{pushMsg}</p>
          </SwitchRow>
        ) : null}
        {offered.whatsapp ? (
          <SwitchRow id="rem-wa" label="WhatsApp" hint={`Ke nomor berakhiran ${phoneLast4}`} checked={whatsapp} onChange={setWhatsapp} />
        ) : null}
        {offered.email ? (
          <SwitchRow id="rem-email" label="Email" hint="Dengan file kalender (.ics)." checked={emailOn} onChange={setEmailOn}>
            {emailOn ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor="rem-email-input">Alamat email</Label>
                <Input
                  id="rem-email-input"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  className="min-h-11"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby={emailError ? "rem-email-error" : undefined}
                />
                {emailError ? <p id="rem-email-error" className="text-destructive text-sm">{emailError}</p> : null}
              </div>
            ) : null}
          </SwitchRow>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Kapan</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={dayBefore ? "default" : "outline"} aria-pressed={dayBefore} className="min-h-11" onClick={() => setDayBefore(!dayBefore)}>
            {`H-1 (${hariSingkat(Date.parse(startISO) - DAY_MS)})`}
          </Button>
          <Button type="button" variant={sameDay ? "default" : "outline"} aria-pressed={sameDay} className="min-h-11" onClick={() => setSameDay(!sameDay)}>
            Pagi hari jadwal
          </Button>
        </div>
        <p aria-live="polite" className="text-muted-foreground text-sm">{summary}</p>
      </section>

      <div className="flex flex-col gap-2">
        {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}
        <Button type="button" className="min-h-11 w-full" disabled={busy} onClick={() => void save()}>
          {busy ? "Menyimpan..." : "Simpan pengingat"}
        </Button>
        <p className="text-muted-foreground text-sm text-pretty">
          Bisa dimatikan kapan saja dari halaman ini atau tautan detail di setiap pesan.
        </p>
      </div>
    </div>
  );
}
