import Link from "next/link";

import { formatLongDate } from "@/lib/format";
import { ROUTES } from "@/lib/routes";

import type { ReminderView } from "./booking-status-view";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Jumat, 20 November" (tanpa tahun). */
const hari = (value: string | Date) => formatLongDate(value).replace(/ \d{4}$/, "");

export function ReminderSummary({ token, startISO, reminders }: { token: string; startISO: string; reminders: ReminderView }) {
  const { channelsOffered: offered, offsets } = reminders;
  const rows = [
    offered.whatsapp ? { label: "WhatsApp", on: reminders.whatsapp } : null,
    offered.email ? { label: "Email", on: reminders.email } : null,
    offered.push ? { label: "Notifikasi HP", on: reminders.push } : null,
  ].filter((row) => row !== null);

  const days = [
    offsets.dayBefore ? hari(new Date(Date.parse(startISO) - DAY_MS)) : null,
    offsets.sameDay ? hari(startISO) : null,
  ].filter((day) => day !== null);
  const anyChannel = rows.some((row) => row.on);
  // offsets sudah dipangkas ke yang masih terjangkau (reachableOffsets).
  const schedule =
    days.length === 0
      ? "Pengingat tidak dikirim untuk booking ini."
      : anyChannel
        ? `Dikirim ${days.join(" dan ")}, sekitar pukul 08.00 WIB.`
        : "Tidak ada pengingat yang akan dikirim.";

  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-[var(--radius)] border p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">Pengingat</h2>
        <Link
          href={ROUTES.bookingReminders(token)}
          className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
        >
          Atur
        </Link>
      </div>
      <dl className="flex flex-col gap-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="font-medium">{row.on ? "Aktif" : "Mati"}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground text-sm text-pretty">{schedule}</p>
    </section>
  );
}
