import type { CourtPriceSegment } from "@/lib/booking/court";
import { buildPriceRows } from "@/lib/booking/court-ui";

/**
 * Rincian sewa lapangan (papan L2). Baris dihitung dari segmen courtPrice,
 * angka yang sama dengan yang ditagih server.
 */
export function CourtPriceBreakdown({
  title,
  when,
  courtLine,
  segments,
  total,
  voucher,
  onChange,
}: {
  title: string;
  when: string;
  courtLine: string;
  segments: CourtPriceSegment[];
  total: number;
  voucher: { code: string; discount: number } | null;
  /** Kembali ke langkah Jadwal. */
  onChange: () => void;
}) {
  const r = buildPriceRows({ segments, total, voucher });
  return (
    <section
      aria-labelledby="ring-h"
      className="bg-card border-border flex flex-col gap-3 border p-4"
      style={{ borderRadius: "var(--radius)" }}
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <h3 id="ring-h" className="text-base font-medium">{title}</h3>
          <span className="text-muted-foreground text-sm">{when}</span>
          <span className="text-sm font-medium">{courtLine}</span>
        </div>
        <button
          type="button"
          onClick={onChange}
          className="text-primary min-h-11 px-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Ubah
        </button>
      </div>
      <dl className="border-border flex flex-col gap-2 border-t pt-3 text-sm">
        {r.rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd>{row.amount}</dd>
          </div>
        ))}
        {r.voucherRow ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{r.voucherRow.label}</dt>
            <dd>{r.voucherRow.amount}</dd>
          </div>
        ) : null}
        <div className="border-border flex justify-between gap-3 border-t pt-2 text-base font-bold">
          <dt>Total sewa</dt>
          <dd>{r.total}</dd>
        </div>
      </dl>
    </section>
  );
}
