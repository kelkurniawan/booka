import { formatRupiah } from "@/lib/format";
import type { PaymentMode } from "@/types/database";

/** Kartu "Pembayaran" papan L2: DP sekarang dan sisa di tempat. */
export function CourtPaymentCard({
  mode,
  depositType,
  depositValue,
  dueNow,
  dueOnSite,
}: {
  /** Mode efektif (sudah memperhitungkan pengaturan bayar di tempat), bukan kolom mentah. */
  mode: PaymentMode;
  depositType: "PERCENT" | "FIXED" | null;
  depositValue: number | null;
  dueNow: number;
  dueOnSite: number;
}) {
  if (dueNow <= 0 && dueOnSite <= 0) return null;
  const nowLabel =
    mode === "DEPOSIT" && depositType === "PERCENT"
      ? `DP sekarang lewat QRIS (${Number(depositValue)}%)`
      : mode === "DEPOSIT"
        ? "DP sekarang lewat QRIS"
        : "Bayar sekarang lewat QRIS";
  return (
    <section aria-labelledby="bayar-h" className="flex flex-col gap-2">
      <h3 id="bayar-h" className="text-base font-medium">Pembayaran</h3>
      <div className="bg-card border-border flex flex-col gap-1.5 border p-3.5 text-sm" style={{ borderRadius: "var(--radius)" }}>
        {dueNow > 0 ? (
          <div className="flex justify-between gap-3">
            <span>{nowLabel}</span>
            <strong>{formatRupiah(dueNow)}</strong>
          </div>
        ) : null}
        {dueOnSite > 0 ? (
          <div className="text-muted-foreground flex justify-between gap-3">
            <span>Sisa dibayar di tempat</span>
            <span>{formatRupiah(dueOnSite)}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
