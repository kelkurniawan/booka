import Link from "next/link";

import { formatRupiah } from "@/lib/format";
import { ROUTES } from "@/lib/routes";

export function OnSiteCard({ totals }: { totals: { count: number; total: number; paid: number } }) {
  return (
    <section aria-labelledby="today-onsite" className="space-y-1 rounded-xl border p-4">
      <h2 id="today-onsite" className="text-sm font-medium">
        Ditagih di tempat hari ini
      </h2>
      {totals.count === 0 ? (
        <p className="text-muted-foreground text-sm">Tidak ada tagihan di tempat hari ini.</p>
      ) : (
        <>
          <p className="text-2xl font-semibold tabular-nums">{formatRupiah(totals.total)}</p>
          <p className="text-muted-foreground text-sm">
            {totals.count} booking, {formatRupiah(totals.paid)} sudah ditandai lunas
          </p>
        </>
      )}
    </section>
  );
}

export function WeekSummary({
  summary,
}: {
  summary: { bookings: number; online_revenue: number; on_site_revenue: number; no_show: number; attendance_marked: number };
}) {
  const noShowPct =
    summary.attendance_marked > 0 ? ` (${Math.round((summary.no_show / summary.attendance_marked) * 100)}%)` : "";
  const items = [
    { label: "Booking", value: String(summary.bookings) },
    { label: "Masuk via QRIS", value: formatRupiah(summary.online_revenue) },
    { label: "Dibayar di tempat", value: formatRupiah(summary.on_site_revenue) },
    { label: "Tidak datang", value: `${summary.no_show}${noShowPct}` },
  ];
  return (
    <section aria-labelledby="today-week" className="space-y-3 rounded-xl border p-4">
      <h2 id="today-week" className="text-sm font-medium">
        7 hari terakhir
      </h2>
      <dl className="grid grid-cols-2 gap-3">
        {items.map((i) => (
          <div key={i.label}>
            <dt className="text-muted-foreground text-sm">{i.label}</dt>
            <dd className="font-semibold tabular-nums">{i.value}</dd>
          </div>
        ))}
      </dl>
      <Link href={ROUTES.analytics} className="inline-block text-sm underline underline-offset-4">
        Buka analitik
      </Link>
    </section>
  );
}
