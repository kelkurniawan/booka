import { ON_SITE_METHOD_LABEL } from "@/lib/booking/payment-mode";
import { formatDateTime } from "@/lib/format";
import type { NotificationKind } from "@/types/database";

import type { BookingListItem } from "./booking-state";
import { notificationLabel } from "./notification-history";

export type TimelineNotification = {
  kind: NotificationKind;
  channel: string;
  status: string;
  created_at: string;
};

type Entry = { at: string; text: string };

/** Peristiwa dari kolom booking digabung dengan pesan terkirim, urut waktu. */
function buildEntries(b: BookingListItem, notifications: TimelineNotification[]): Entry[] {
  const entries: Entry[] = [
    { at: b.created_at, text: b.source === "MANUAL" ? "Dicatat manual" : "Dibuat lewat halaman booking" },
  ];
  if (b.paid_at) entries.push({ at: b.paid_at, text: b.amount_due_now > 0 && b.amount_due_on_site > 0 ? "DP dibayar" : "Dibayar online" });
  if (b.paid_on_site_at) {
    const method = b.paid_on_site_method ? `, ${ON_SITE_METHOD_LABEL[b.paid_on_site_method]}` : "";
    entries.push({ at: b.paid_on_site_at, text: `Lunas di tempat${method}` });
  }
  if (b.attended_at) entries.push({ at: b.attended_at, text: "Ditandai hadir" });
  if (b.no_show_at) entries.push({ at: b.no_show_at, text: "Ditandai tidak datang" });
  if (b.cancelled_at) entries.push({ at: b.cancelled_at, text: `Dibatalkan${b.cancel_reason ? `: ${b.cancel_reason}` : ""}` });
  for (const n of notifications) {
    entries.push({
      at: n.created_at,
      text: notificationLabel(n.kind, n.channel as "EMAIL" | "WHATSAPP", n.status as "SENT" | "PENDING" | "FAILED" | "SKIPPED"),
    });
  }
  return entries.sort((a, c) => Date.parse(a.at) - Date.parse(c.at));
}

/** Riwayat booking. `notifications` null berarti riwayat pesan gagal dimuat. */
export function BookingTimeline({
  booking,
  notifications,
}: {
  booking: BookingListItem;
  notifications: TimelineNotification[] | null;
}) {
  const entries = buildEntries(booking, notifications ?? []);
  return (
    <section aria-labelledby="booking-timeline-title" className="flex flex-col gap-2">
      <h3 id="booking-timeline-title" className="text-sm font-semibold">
        Riwayat
      </h3>
      <ol className="flex flex-col gap-2.5 border-l pl-3 text-sm">
        {entries.map((e, i) => (
          <li key={i}>
            <p>{e.text}</p>
            <p className="text-muted-foreground text-xs">{formatDateTime(e.at)}</p>
          </li>
        ))}
      </ol>
      {notifications === null ? <p className="text-muted-foreground text-sm">Riwayat pesan gagal dimuat.</p> : null}
    </section>
  );
}
