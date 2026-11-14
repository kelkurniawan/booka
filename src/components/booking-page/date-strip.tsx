import { Check } from "lucide-react";

import { monthLabel, type DateStripDay } from "@/lib/booking/schedule";
import { cn } from "@/lib/utils";

const HARI = new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" });

function parts(dateISO: string) {
  const d = new Date(`${dateISO}T12:00:00Z`);
  return { weekday: HARI.format(d), day: d.getUTCDate() };
}

export function DateStrip({
  days,
  selected,
  onSelect,
}: {
  days: DateStripDay[];
  selected: string | null;
  onSelect: (dateISO: string) => void;
}) {
  if (days.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{monthLabel(selected ?? days[0].dateISO)}</h3>
      <div
        role="radiogroup"
        aria-label="Pilih tanggal"
        className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 py-1"
      >
        {days.map((day) => {
          const { weekday, day: tgl } = parts(day.dateISO);
          const checked = selected === day.dateISO;
          return (
            <label
              key={day.dateISO}
              className={cn(
                "relative flex min-h-16 w-14 shrink-0 snap-start cursor-pointer flex-col items-center justify-center gap-0.5 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                checked ? "border-primary bg-primary text-primary-foreground border-2" : "border-border bg-card border",
                !day.open && "text-muted-foreground cursor-not-allowed opacity-60",
              )}
              style={{ borderRadius: "var(--radius)" }}
            >
              <input
                type="radio"
                name="tanggal"
                className="sr-only"
                value={day.dateISO}
                checked={checked}
                disabled={!day.open}
                onChange={() => onSelect(day.dateISO)}
              />
              <span className="text-xs">{weekday}</span>
              <span className="font-medium">{tgl}</span>
              {day.open ? (
                checked ? <Check aria-hidden className="size-3" /> : null
              ) : (
                <span className="text-xs">Tutup</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
