"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  FLOOR_COLS,
  FLOOR_ROWS,
  seatRangeLabel,
  TABLE_STATUS_LABEL,
  tableAriaLabel,
  type PickerTable,
  type TablePickerData,
  type TableStatus,
} from "@/lib/booking/reservation";
import { cn } from "@/lib/utils";

export type TablePickerMode = "auto" | "pick";

const SURFACE = { borderRadius: "var(--radius)" } as const;
// Arsir untuk meja terisi: pola, bukan hanya warna.
const HATCH = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--border) 0 4px, var(--card) 4px 8px)",
} as const;

function tableLook(status: TableStatus, selected: boolean) {
  if (status === "FREE") {
    return selected
      ? "border-primary bg-primary text-primary-foreground border-2"
      : "border-foreground bg-card text-foreground border-2";
  }
  if (status === "TAKEN") return "border-border bg-card text-muted-foreground border-2";
  return "border-muted-foreground bg-card text-muted-foreground border-2 border-dashed";
}

function Radio({
  checked,
  title,
  body,
  onSelect,
}: {
  checked: boolean;
  title: string;
  body: string;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        "bg-card relative flex min-h-11 cursor-pointer items-start gap-3 p-4 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
        checked ? "border-primary border-2" : "border-border border",
      )}
      style={SURFACE}
    >
      <input type="radio" name="cara-meja" className="sr-only" checked={checked} onChange={onSelect} />
      <span
        aria-hidden
        className={cn(
          "mt-0.5 size-5 shrink-0 rounded-full",
          checked ? "border-primary border-[6px]" : "border-muted-foreground border-2",
        )}
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground text-sm">{body}</span>
      </span>
    </label>
  );
}

function Legend() {
  const item = "flex items-center gap-2 text-sm";
  const chip = "size-4 shrink-0 rounded-sm";
  return (
    <ul className="bg-card border-border flex flex-wrap gap-x-4 gap-y-1 border p-3" style={SURFACE}>
      <li className={item}>
        <span aria-hidden className={cn(chip, "border-foreground bg-card border-2")} />
        Tersedia
      </li>
      <li className={item}>
        <span aria-hidden className={cn(chip, "border-primary bg-primary border-2")} />
        Dipilih
      </li>
      <li className={item}>
        <span aria-hidden className={cn(chip, "border-border border-2")} style={HATCH} />
        Terisi
      </li>
      <li className={item}>
        <span aria-hidden className={cn(chip, "border-muted-foreground bg-card border-2 border-dashed")} />
        Kurang kursi
      </li>
    </ul>
  );
}

export function TablePicker({
  data,
  state,
  mode,
  selectedTableId,
  guests,
  onModeChange,
  onSelect,
  onRetry,
}: {
  data: TablePickerData | null;
  state: "loading" | "ready" | "error";
  mode: TablePickerMode;
  selectedTableId: string | null;
  guests: number;
  onModeChange: (m: TablePickerMode) => void;
  onSelect: (tableId: string) => void;
  onRetry: () => void;
}) {
  const [areaId, setAreaId] = useState<string | null>(null);
  const [list, setList] = useState(false);

  const areas = data?.areas ?? [];
  const activeArea = areas.find((a) => a.id === areaId)?.id ?? areas[0]?.id ?? null;
  const tables = (data?.tables ?? []).filter((t) => t.areaId === activeArea);
  const selected = data?.tables.find((t) => t.id === selectedTableId && t.status === "FREE") ?? null;

  const pick = (table: PickerTable) => {
    if (table.status === "FREE") onSelect(table.id);
  };
  const label = (t: PickerTable) =>
    tableAriaLabel(
      { name: t.name, min_seats: t.minSeats, max_seats: t.maxSeats, note: t.note },
      t.status,
      t.id === selectedTableId,
    );

  const summary =
    mode === "auto"
      ? "Dipilihkan restoran"
      : selected
        ? `${selected.name}, ${seatRangeLabel(selected.minSeats, selected.maxSeats)}`
        : "Pilih satu meja";

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Cara memilih meja" className="flex flex-col gap-2">
        <Radio
          checked={mode === "auto"}
          title="Pilihkan untuk saya"
          body={`Restoran memberi meja terbaik untuk ${guests} orang.`}
          onSelect={() => onModeChange("auto")}
        />
        <Radio
          checked={mode === "pick"}
          title="Pilih meja sendiri"
          body="Lihat denah dan pilih posisi favorit."
          onSelect={() => onModeChange("pick")}
        />
      </div>

      {mode === "pick" ? (
        <>
          {state === "loading" ? (
            <p className="bg-card border-border border p-4 text-sm" style={SURFACE}>
              Memuat denah meja...
            </p>
          ) : null}
          {state === "error" ? (
            <div className="bg-card border-border flex flex-col items-start gap-2 border p-4" style={SURFACE}>
              <p className="font-medium">Denah gagal dimuat</p>
              <p className="text-muted-foreground text-sm">Periksa koneksi, lalu coba lagi.</p>
              <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
                Coba lagi
              </Button>
            </div>
          ) : null}
          {state === "ready" && data && data.tables.length === 0 ? (
            <p className="bg-card border-border border p-4 text-sm" style={SURFACE}>
              Belum ada meja yang bisa dipesan online. Pilihkan untuk saya tetap bisa dipakai.
            </p>
          ) : null}
          {state === "ready" && data && data.tables.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {areas.length >= 2 ? (
                  <div
                    role="tablist"
                    aria-label="Area"
                    className="bg-card border-border flex gap-1 border p-1"
                    style={SURFACE}
                  >
                    {areas.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        role="tab"
                        aria-selected={a.id === activeArea}
                        className={cn(
                          "min-h-11 px-4 text-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                          a.id === activeArea ? "bg-primary text-primary-foreground" : "text-foreground",
                        )}
                        style={SURFACE}
                        onClick={() => setAreaId(a.id)}
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span />
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="bg-card min-h-11"
                  aria-pressed={list}
                  onClick={() => setList((v) => !v)}
                >
                  {list ? "Lihat denah" : "Lihat daftar"}
                </Button>
              </div>

              <Legend />

              {list ? (
                <ul className="flex flex-col gap-2">
                  {tables.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        aria-pressed={t.id === selectedTableId && t.status === "FREE"}
                        aria-disabled={t.status !== "FREE"}
                        aria-label={label(t)}
                        onClick={() => pick(t)}
                        className={cn(
                          "bg-card flex min-h-13 w-full items-center gap-3 px-4 text-left text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                          t.id === selectedTableId && t.status === "FREE"
                            ? "border-primary border-2"
                            : "border-border border",
                        )}
                        style={SURFACE}
                      >
                        <span className="font-bold">{t.name}</span>
                        <span className="flex flex-col">
                          <span>{seatRangeLabel(t.minSeats, t.maxSeats)}</span>
                          {t.note ? <span className="text-muted-foreground">{t.note}</span> : null}
                        </span>
                        <span className="ml-auto">
                          {t.id === selectedTableId && t.status === "FREE" ? "Dipilih" : TABLE_STATUS_LABEL[t.status]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div
                  className="bg-card border-border relative w-full border"
                  style={{ ...SURFACE, aspectRatio: `${FLOOR_COLS} / ${FLOOR_ROWS}` }}
                >
                  {tables.map((t) => {
                    const on = t.id === selectedTableId && t.status === "FREE";
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={on}
                        aria-disabled={t.status !== "FREE"}
                        aria-label={label(t)}
                        onClick={() => pick(t)}
                        className={cn(
                          "absolute flex flex-col items-center justify-center text-xs focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                          t.shape === "ROUND" ? "rounded-full" : "rounded-md",
                          tableLook(t.status, on),
                        )}
                        style={{
                          left: `${(t.x / FLOOR_COLS) * 100}%`,
                          top: `${(t.y / FLOOR_ROWS) * 100}%`,
                          width: `${(t.w / FLOOR_COLS) * 100}%`,
                          height: `${(t.h / FLOOR_ROWS) * 100}%`,
                          ...(t.status === "TAKEN" ? HATCH : null),
                        }}
                      >
                        <span className="font-bold">{t.name}</span>
                        <span>{t.maxSeats}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : null}
        </>
      ) : null}

      <p
        aria-live="polite"
        className="bg-card border-border border p-3 text-sm font-medium"
        style={SURFACE}
      >
        {summary}
      </p>
    </div>
  );
}
