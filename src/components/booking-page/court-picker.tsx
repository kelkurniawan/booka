import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/booking/court";
import {
  buildCourtOptions,
  buildCourtSlotRows,
  type CourtOptionInput,
  type CourtSlotDto,
} from "@/lib/booking/court-ui";
import type { CourtPriceRule } from "@/lib/booking/court";
import { publicMediaUrl } from "@/lib/media/url";
import { cn } from "@/lib/utils";

export { buildCourtSlotRows } from "@/lib/booking/court-ui";

export type CourtPickerState = "ready" | "loading" | "empty" | "error";

const radius = { borderRadius: "var(--radius)" } as const;

/**
 * Lama main, jam mulai (dengan harga dan jumlah lapangan kosong), dan kartu
 * lapangan. Tanggal dipilih di luar komponen (DateStrip). Papan L1.
 */
export function CourtPicker({
  service,
  rules,
  dateISO,
  durations,
  selectedDuration,
  onDuration,
  slots,
  selectedSlot,
  onSlot,
  courts,
  selectedCourt,
  onCourt,
  state,
  emptyHint,
  onRetry,
  onOpenVenue,
}: {
  service: { price: number; court_unit_minutes: 30 | 60 };
  rules: CourtPriceRule[];
  dateISO: string;
  durations: number[];
  selectedDuration: number;
  onDuration: (minutes: number) => void;
  slots: CourtSlotDto[];
  /** `start` (UTC ISO) jam terpilih. */
  selectedSlot: string | null;
  onSlot: (slot: CourtSlotDto) => void;
  courts: CourtOptionInput[];
  /** null = "Mana saja". */
  selectedCourt: string | null;
  onCourt: (courtId: string | null) => void;
  state: CourtPickerState;
  /** Isi keadaan kosong: kalimat saran dan tombol hari berikutnya. */
  emptyHint?: { text: string; actionLabel?: string; onAction?: () => void } | null;
  onRetry: () => void;
  /** Hanya diisi bila ada lapangan berposisi di denah. */
  onOpenVenue?: (() => void) | null;
}) {
  const rows = buildCourtSlotRows({
    slots,
    basePerHour: Number(service.price),
    rules,
    dateISO,
    durationMinutes: selectedDuration,
    unitMinutes: service.court_unit_minutes,
    selectedStart: selectedSlot,
  });
  const chosen = slots.find((s) => s.start === selectedSlot && !s.full) ?? null;
  const options = buildCourtOptions({
    courts,
    freeIds: chosen ? chosen.courts.map((c) => c.id) : null,
    selectedCourtId: selectedCourt,
  });
  const chosenRow = rows.find((r) => r.checked);

  return (
    <div className="flex flex-col gap-6">
      {durations.length > 1 ? (
        <section aria-labelledby="lama-h" className="flex flex-col gap-2">
          <h3 id="lama-h" className="text-sm font-medium">Lama main</h3>
          <div role="radiogroup" aria-labelledby="lama-h" className="grid grid-cols-3 gap-2">
            {durations.map((minutes) => {
              const on = minutes === selectedDuration;
              return (
                <button
                  key={minutes}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onDuration(minutes)}
                  className={cn(
                    "min-h-12 text-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    on ? "border-primary bg-primary text-primary-foreground border" : "border-border bg-card border",
                  )}
                  style={radius}
                >
                  {formatDuration(minutes)}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="jam-h" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="jam-h" className="text-sm font-medium">Jam mulai</h3>
          <span className="text-muted-foreground text-xs">Waktu Indonesia Barat</span>
        </div>
        <div aria-live="polite" className="flex flex-col gap-3">
          {state === "loading" ? (
            <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
              <span aria-hidden className="border-border border-t-primary size-3.5 animate-spin rounded-full border-2 motion-reduce:animate-none" />
              Memuat lapangan kosong...
            </p>
          ) : null}
          {state === "empty" ? (
            <div className="border-border flex flex-col items-start gap-2 border border-dashed p-4" style={radius}>
              <p className="font-medium">
                Semua lapangan penuh untuk {formatDuration(selectedDuration)} di tanggal ini
              </p>
              {emptyHint ? (
                <>
                  <p className="text-muted-foreground text-sm">{emptyHint.text}</p>
                  {emptyHint.actionLabel && emptyHint.onAction ? (
                    <Button type="button" variant="outline" className="min-h-11" onClick={emptyHint.onAction}>
                      {emptyHint.actionLabel}
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
          {state === "error" ? (
            <div role="alert" className="bg-muted flex flex-col items-start gap-2 p-4" style={radius}>
              <p className="font-medium">Jadwal lapangan gagal dimuat</p>
              <p className="text-muted-foreground text-sm">Periksa koneksi, lalu coba lagi.</p>
              <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
                Coba lagi
              </Button>
            </div>
          ) : null}
        </div>
        {state === "ready" ? (
          <div role="radiogroup" aria-labelledby="jam-h" className="flex flex-col gap-2">
            {rows.map((row, i) => (
              <button
                key={row.key}
                type="button"
                role="radio"
                aria-checked={row.checked}
                aria-label={row.aria}
                disabled={row.full}
                onClick={() => onSlot(slots[i])}
                className={cn(
                  "flex min-h-15 items-center gap-3.5 px-3.5 py-2 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  row.full
                    ? "text-muted-foreground border-border cursor-not-allowed border border-dashed"
                    : row.checked
                      ? "border-primary bg-card border-2"
                      : "border-border bg-card border",
                )}
                style={radius}
              >
                <span className={cn("w-[52px] text-base font-bold", row.full && "line-through")}>{row.label}</span>
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-medium">{row.price}</span>
                  <span className="text-muted-foreground text-xs">{row.note}</span>
                </span>
                {row.checked ? <Check aria-hidden className="size-4" /> : null}
                <span className="text-primary text-[13px] font-medium">{row.count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="lap-h" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="lap-h" className="text-sm font-medium">Lapangan</h3>
          <span className="text-muted-foreground text-xs">
            {chosenRow ? `Untuk ${chosenRow.label}, ${formatDuration(selectedDuration)}` : "Pilih jam dulu"}
          </span>
        </div>
        <div role="radiogroup" aria-labelledby="lap-h" className="flex flex-col gap-2">
          {options.map((c) => (
            <button
              key={c.id ?? "any"}
              type="button"
              role="radio"
              aria-checked={c.checked}
              aria-label={c.aria}
              disabled={c.busy}
              onClick={() => onCourt(c.id)}
              className={cn(
                "flex min-h-20 w-full items-center gap-3 p-2 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                c.busy
                  ? "text-muted-foreground border-border cursor-not-allowed border border-dashed"
                  : c.checked
                    ? "border-primary bg-card border-2"
                    : "border-border bg-card border",
              )}
              style={radius}
            >
              {c.photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- foto merchant dari Storage publik, ukuran tetap 64px
                <img
                  src={publicMediaUrl(c.photo.path)}
                  alt={c.photo.alt}
                  width={64}
                  height={64}
                  loading="lazy"
                  className={cn("size-16 shrink-0 object-cover", c.busy && "opacity-50")}
                  style={radius}
                />
              ) : c.isAny ? (
                <span
                  aria-hidden
                  className="border-border text-muted-foreground flex size-16 shrink-0 items-center justify-center border border-dashed text-xs font-medium"
                  style={radius}
                >
                  Acak
                </span>
              ) : null}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-medium">{c.name}</span>
                {c.tags ? <span className="text-xs font-medium">{c.tags}</span> : null}
                {c.description ? <span className="text-muted-foreground text-[13px] leading-snug">{c.description}</span> : null}
              </span>
            </button>
          ))}
        </div>
        {onOpenVenue ? (
          <button
            type="button"
            onClick={onOpenVenue}
            className="text-primary min-h-11 self-start text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Lihat denah dan foto lapangan
          </button>
        ) : null}
      </section>
    </div>
  );
}
