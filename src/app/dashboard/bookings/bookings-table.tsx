import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { dayLabel, groupByJakartaDay, paymentSummary } from "@/lib/booking/dashboard";
import { seatText } from "@/lib/booking/reservation";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { type BookingListItem, getDisplayStatus, STATUS_META } from "./booking-state";

/** Label + gaya badge: kehadiran dan pelunasan di tempat mengalahkan status dasar. */
function statusBadge(b: BookingListItem, nowMs: number): { label: string; filled: boolean } {
  if (b.attended_at) return { label: "Hadir", filled: true };
  if (b.no_show_at) return { label: "Tidak datang", filled: false };
  if (b.paid_on_site_at) return { label: "Lunas di tempat", filled: true };
  return { label: STATUS_META[getDisplayStatus(b, nowMs)].label, filled: false };
}

function StatusBadge({ booking, nowMs }: { booking: BookingListItem; nowMs: number }) {
  const { label, filled } = statusBadge(booking, nowMs);
  return <Badge variant={filled ? "default" : "outline"}>{label}</Badge>;
}

/**
 * Daftar booking per hari WIB: tabel mulai `md`, item bertumpuk di bawahnya.
 * Tampilan murni -- `nowMs` dan `todayISO` dihitung di server (lihat komentar
 * nowMs di getDisplayStatus). Baris adalah tautan ke `hrefFor(id)`.
 */
export function BookingsTable({
  rows,
  nowMs,
  todayISO,
  selectedId,
  hrefFor,
}: {
  rows: BookingListItem[];
  nowMs: number;
  todayISO: string;
  selectedId: string | null;
  hrefFor: (id: string) => string;
}) {
  const groups = groupByJakartaDay(rows);

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Waktu</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Pelanggan</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Layanan</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Pembayaran</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.dateISO} className="border-t">
              <tr className="bg-muted/30">
                <th colSpan={5} scope="colgroup" className="px-4 py-2 text-left text-xs font-medium">
                  {dayLabel(group.dateISO, todayISO)}
                </th>
              </tr>
              {group.rows.map((b) => {
                const pay = paymentSummary(b);
                const selected = b.id === selectedId;
                return (
                  <tr key={b.id} aria-current={selected ? "true" : undefined} className={cn("border-t align-top", selected && "bg-muted")}>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatTime(b.start_datetime)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={hrefFor(b.id)}
                        scroll={false}
                        className="inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline"
                      >
                        {b.customer_name}
                      </Link>
                      <p className="text-muted-foreground -mt-2.5">{b.customer_whatsapp}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{b.service_name}</p>
                      {b.staff_name ? <p className="text-muted-foreground">{b.staff_name}</p> : null}
                      {seatText(b) ? <p className="text-muted-foreground">{seatText(b)}</p> : null}
                      {b.source === "MANUAL" ? <p className="text-muted-foreground">Manual</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <p>{pay.main}</p>
                      {pay.sub ? <p className="text-muted-foreground">{pay.sub}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge booking={b} nowMs={nowMs} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      <div className="space-y-4 md:hidden">
        {groups.map((group) => (
          <section key={group.dateISO} aria-label={dayLabel(group.dateISO, todayISO)}>
            <h2 className="text-muted-foreground mb-1.5 text-xs font-medium">{dayLabel(group.dateISO, todayISO)}</h2>
            <ul className="divide-y rounded-xl border">
              {group.rows.map((b) => (
                <li key={b.id}>
                  <Link
                    href={hrefFor(b.id)}
                    scroll={false}
                    aria-current={b.id === selectedId ? "true" : undefined}
                    className={cn("flex min-h-14 items-center gap-3 px-4 py-2.5", b.id === selectedId && "bg-muted")}
                  >
                    <span className="font-medium tabular-nums">{formatTime(b.start_datetime)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{b.customer_name}</span>
                      <span className="text-muted-foreground block truncate text-sm">{b.service_name}</span>
                      {seatText(b) ? <span className="text-muted-foreground block truncate text-sm">{seatText(b)}</span> : null}
                    </span>
                    <StatusBadge booking={b} nowMs={nowMs} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
