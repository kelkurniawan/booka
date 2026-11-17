export function BookingSummary({
  rows,
  total,
  onSite,
}: {
  rows: { label: string; value: string }[];
  total: string;
  /** Nominal yang dibayar langsung ke merchant saat layanan; kosong bila tidak ada. */
  onSite?: string;
}) {
  return (
    <dl
      className="bg-card border-border flex flex-col gap-2 border p-4 text-sm"
      style={{ borderRadius: "var(--radius)" }}
    >
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="text-right font-medium">{row.value}</dd>
        </div>
      ))}
      <div className="border-border flex justify-between gap-3 border-t pt-2">
        <dt className="font-medium">Dibayar sekarang</dt>
        <dd className="text-right font-medium">{total}</dd>
      </div>
      {onSite ? (
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Bayar di tempat</dt>
          <dd className="text-right font-medium">{onSite}</dd>
        </div>
      ) : null}
    </dl>
  );
}
