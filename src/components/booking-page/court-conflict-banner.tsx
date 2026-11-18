import { Button } from "@/components/ui/button";

/** Lapangan diambil orang lain saat submit (BK070). Papan L2, keadaan "taken". */
export function CourtConflictBanner({
  takenName,
  alt,
  onUseAlt,
  onPickOtherTime,
}: {
  takenName: string;
  alt: { id: string; name: string } | null;
  onUseAlt: (courtId: string) => void;
  onPickOtherTime: () => void;
}) {
  return (
    <div
      role="alert"
      className="bg-muted border-border flex flex-col gap-2 border-2 p-3"
      style={{ borderRadius: "var(--radius)" }}
    >
      <strong>
        {alt
          ? `${takenName} baru saja dipesan orang lain`
          : `${takenName} baru saja dipesan orang lain dan tidak ada lapangan lain yang kosong`}
      </strong>
      {alt ? (
        <span className="text-sm">{alt.name} masih kosong di jam yang sama dengan harga yang sama.</span>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {alt ? (
          <Button type="button" className="min-h-11" onClick={() => onUseAlt(alt.id)}>
            Pakai {alt.name}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" className="min-h-11" onClick={onPickOtherTime}>
          Pilih jam lain
        </Button>
      </div>
    </div>
  );
}
