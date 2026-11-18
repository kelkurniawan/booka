import Link from "next/link";

import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";

import { BLOCK_LABEL, type BlockKind, type buildScheduleGrid } from "./schedule-grid";

const KIND_CLASS: Record<BlockKind, string> = {
  paid: "bg-foreground text-background border border-foreground",
  onsite: "bg-foreground text-background border border-foreground",
  dp: "bg-muted text-foreground border border-border",
  pending: "bg-background text-foreground border-2 border-foreground",
  request: "bg-background text-muted-foreground border-2 border-dashed border-muted-foreground",
};

/** Legenda status papan L3: empat gaya blok. */
export function ScheduleLegend() {
  const items: { kind: BlockKind; swatch: string }[] = [
    { kind: "paid", swatch: "bg-foreground" },
    { kind: "dp", swatch: "bg-muted border" },
    { kind: "pending", swatch: "border-2 border-foreground" },
    { kind: "request", swatch: "border-2 border-dashed border-muted-foreground" },
  ];
  const text: Record<string, string> = {
    paid: "Lunas atau terkonfirmasi",
    dp: BLOCK_LABEL.dp,
    pending: "Menunggu bayar",
    request: BLOCK_LABEL.request,
  };
  return (
    <ul aria-label="Arti tanda" data-tour="court-legend" className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {items.map((i) => (
        <li key={i.kind} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("size-3.5 rounded", i.swatch)} />
          {text[i.kind]}
        </li>
      ))}
    </ul>
  );
}

/**
 * Grid jadwal harian (L3 desktop, L4 HP). Murni server component: blok dan sel
 * kosong adalah tautan, jadi tidak butuh state klien. Tinggi per jam lewat
 * variabel CSS --hr (72px di HP, 44px mulai md).
 */
export function ScheduleView({
  grid,
  rowMinutes,
  dateISO,
  selectedId,
}: {
  grid: ReturnType<typeof buildScheduleGrid>;
  rowMinutes: 30 | 60;
  dateISO: string;
  selectedId: string | null;
}) {
  const rowH = `calc(var(--hr) * ${rowMinutes / 60})`;
  const cols = grid.columns.length;
  const href = (b?: string) => `${ROUTES.courts}?date=${dateISO}${b ? `&b=${b}` : ""}`;
  return (
    <div
      data-tour="court-grid"
      className="max-h-[70vh] min-w-0 overflow-auto rounded-xl border [--hr:72px] md:[--hr:44px]"
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: `56px repeat(${cols}, minmax(132px, 1fr))`, minWidth: `${56 + cols * 132}px` }}
      >
        <div className="bg-background sticky left-0 z-20 border-r">
          <div className="bg-background sticky top-0 z-30 h-12 border-b" />
          {grid.hours.map((h, i) => (
            <div
              key={h.time}
              style={{ height: rowH }}
              className={cn("flex flex-col border-b px-2 py-1 text-xs tabular-nums", h.peak && "bg-muted/50")}
            >
              <span>{h.label}</span>
              {h.peak && !grid.hours[i - 1]?.peak ? <span className="text-muted-foreground text-[11px]">Jam ramai</span> : null}
            </div>
          ))}
        </div>
        {grid.columns.map(({ court, blocks }) => (
          <div key={court.id} className="relative border-r">
            <div className="bg-background sticky top-0 z-10 flex h-12 flex-col justify-center border-b px-2.5">
              <span className="truncate font-semibold">{court.name}</span>
              <span className="text-muted-foreground truncate text-xs">{court.note}</span>
            </div>
            {grid.hours.map((h) => (
              <Link
                key={h.time}
                href={`${ROUTES.newBooking}?court=${court.id}&date=${dateISO}&time=${h.time}`}
                aria-label={`Tambah booking ${court.name} jam ${h.label}`}
                style={{ height: rowH }}
                className="hover:bg-muted/40 focus-visible:ring-ring/50 block border-b outline-none focus-visible:ring-2"
              />
            ))}
            {blocks.map((b) => (
              <Link
                key={b.bookingId}
                href={href(b.bookingId)}
                scroll={false}
                aria-label={b.aria}
                aria-current={selectedId === b.bookingId ? "true" : undefined}
                style={{
                  top: `calc(48px + var(--hr) * ${(b.rowStart * rowMinutes) / 60} + 2px)`,
                  height: `calc(var(--hr) * ${(b.rowSpan * rowMinutes) / 60} - 4px)`,
                }}
                className={cn(
                  "focus-visible:ring-ring absolute right-1 left-1 z-[5] flex flex-col gap-0.5 overflow-hidden rounded-lg p-1.5 text-left text-[13px] outline-none focus-visible:ring-2",
                  KIND_CLASS[b.status],
                  selectedId === b.bookingId && "ring-muted-foreground ring-[3px]",
                )}
              >
                <span className="truncate font-semibold">{b.label}</span>
                <span className="text-xs">{b.time}</span>
                <span className="text-xs md:hidden">{b.statusLabelShort}</span>
                <span className="hidden text-xs md:inline">{b.statusLabel}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
