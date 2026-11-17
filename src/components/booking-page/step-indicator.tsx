import { cn } from "@/lib/utils";

const STEPS: readonly string[] = ["Layanan", "Jadwal", "Data diri"];

export function BookingStepIndicator({
  current,
  labels = STEPS,
}: {
  current: number;
  labels?: readonly string[];
}) {
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Langkah pemesanan">
      {labels.map((label, index) => {
        const step = index + 1;
        const active = step === current;
        return (
          <li
            key={label}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex flex-1 flex-col gap-1 border-t-2 pt-2",
              active ? "border-primary font-medium" : "border-border text-muted-foreground",
            )}
          >
            <span className="text-xs">Langkah {step}</span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
