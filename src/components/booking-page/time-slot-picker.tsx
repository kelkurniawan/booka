import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { groupSlotsByPeriod, SLOT_PERIOD_LABEL } from "@/lib/booking/schedule";
import { remainingLabel } from "@/lib/booking/reservation";
import type { FreeSlot } from "@/lib/booking/slots";
import { cn } from "@/lib/utils";

/** `remaining` hanya terisi untuk layanan reservasi mode meja. */
export type PickerSlot = FreeSlot & { remaining?: number | null };

export type TimeSlotState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "empty"; nextDate: string | null }
  | { kind: "ready"; slots: PickerSlot[] };

const TANGGAL = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function TimeSlotPicker({
  state,
  selected,
  onSelect,
  onRetry,
  onPickDate,
}: {
  state: TimeSlotState;
  /** startUtc slot terpilih. */
  selected: string | null;
  onSelect: (slot: PickerSlot) => void;
  onRetry: () => void;
  onPickDate: (dateISO: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite" className="flex flex-col gap-3">
        {state.kind === "idle" ? (
          <p className="text-muted-foreground text-sm">Pilih tanggal dulu untuk melihat jam kosong.</p>
        ) : null}
        {state.kind === "loading" ? (
          <p className="text-muted-foreground text-sm">Memuat jam kosong...</p>
        ) : null}
        {state.kind === "error" ? (
          <div className="flex flex-col items-start gap-2">
            <p className="font-medium">Jam kosong gagal dimuat</p>
            <p className="text-muted-foreground text-sm">Periksa koneksi, lalu coba lagi.</p>
            <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
              Coba lagi
            </Button>
          </div>
        ) : null}
        {state.kind === "empty" ? (
          <div className="flex flex-col items-start gap-2">
            <p className="font-medium">Jam di tanggal ini sudah penuh</p>
            {state.nextDate ? (
              <>
                <p className="text-muted-foreground text-sm">
                  Hari buka berikutnya: {TANGGAL.format(new Date(`${state.nextDate}T12:00:00Z`))}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => onPickDate(state.nextDate as string)}
                >
                  Lihat {TANGGAL.format(new Date(`${state.nextDate}T12:00:00Z`))}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      {state.kind === "ready" ? (
        <>
          {groupSlotsByPeriod(state.slots).map(({ period, slots }) => (
            <fieldset key={period} className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{SLOT_PERIOD_LABEL[period]}</legend>
              <div className="grid grid-cols-3 gap-2">
                {slots.map((slot) => {
                  const checked = selected === slot.startUtc;
                  const sisa = remainingLabel(slot.remaining ?? null);
                  return (
                    <label
                      key={slot.startUtc}
                      className={cn(
                        "relative flex min-h-11 cursor-pointer flex-col items-center justify-center text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                        checked ? "border-primary bg-primary text-primary-foreground border-2 font-medium" : "border-border bg-card border",
                      )}
                      style={{ borderRadius: "var(--radius)" }}
                    >
                      <input
                        type="radio"
                        name="jam"
                        className="sr-only"
                        value={slot.startUtc}
                        checked={checked}
                        onChange={() => onSelect(slot)}
                        aria-label={sisa ? `${slot.label.replace(":", ".")}, ${sisa.toLowerCase()}` : undefined}
                      />
                      <span className="flex items-center gap-1">
                        {checked ? <Check aria-hidden className="size-3.5" /> : null}
                        {slot.label}
                      </span>
                      {sisa ? <span className="text-xs">{sisa}</span> : null}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <p className="text-muted-foreground text-xs">Waktu Indonesia Barat</p>
        </>
      ) : null}
    </div>
  );
}
