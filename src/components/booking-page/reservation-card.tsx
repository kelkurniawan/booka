import { Button } from "@/components/ui/button";

/** Kartu pembuka layanan reservasi (R1). */
export function ReservationCard({
  title,
  partyLabel,
  holdText,
  paymentLabel,
  onStart,
}: {
  title: string;
  partyLabel: string | null;
  holdText: string | null;
  paymentLabel: string;
  onStart: () => void;
}) {
  return (
    <div
      className="bg-card border-border flex flex-col gap-3 border p-4"
      style={{ borderRadius: "var(--radius)" }}
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-medium text-balance">{title}</h3>
        {partyLabel ? <p className="text-muted-foreground text-sm">{partyLabel}</p> : null}
        <p className="text-sm">{paymentLabel}</p>
        {holdText ? <p className="text-muted-foreground text-sm">{holdText}</p> : null}
      </div>
      <Button type="button" className="min-h-11 w-full" onClick={onStart}>
        Pilih tanggal dan jam
      </Button>
    </div>
  );
}
