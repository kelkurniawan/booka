"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  FLOOR_COLS,
  FLOOR_ROWS,
  moveTableByKey,
  seatRangeLabel,
  TABLE_MAX_CELLS,
  TABLE_MIN_CELLS,
} from "@/lib/booking/reservation";
import type { DiningLayoutInput } from "@/lib/validations/dining";
import { cn } from "@/lib/utils";
import type { DiningArea, DiningTable } from "@/types/database";

type Area = Pick<DiningArea, "id" | "name" | "sort_order">;
type Table = Omit<DiningTable, "merchant_id" | "created_at" | "updated_at">;
type SaveResult = { ok: true } | { ok: false; error: string };
type Dialogs = { kind: "add" | "rename" | "delete" } | null;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

function fit(t: Table): Table {
  const grid_w = clamp(t.grid_w, TABLE_MIN_CELLS, TABLE_MAX_CELLS);
  const grid_h = clamp(t.grid_h, TABLE_MIN_CELLS, TABLE_MAX_CELLS);
  const max_seats = clamp(t.max_seats, 1, 50);
  return {
    ...t,
    grid_w,
    grid_h,
    grid_x: clamp(t.grid_x, 0, FLOOR_COLS - grid_w),
    grid_y: clamp(t.grid_y, 0, FLOOR_ROWS - grid_h),
    max_seats,
    min_seats: clamp(t.min_seats, 1, max_seats),
  };
}

/** Posisi kosong pertama untuk meja 3x3, memindai baris demi baris. */
function firstFreeSpot(tables: Table[]): { x: number; y: number } {
  const n = TABLE_MIN_CELLS;
  for (let y = 0; y <= FLOOR_ROWS - n; y++) {
    for (let x = 0; x <= FLOOR_COLS - n; x++) {
      const hit = tables.some(
        (t) => x < t.grid_x + t.grid_w && t.grid_x < x + n && y < t.grid_y + t.grid_h && t.grid_y < y + n,
      );
      if (!hit) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        className="min-h-11 min-w-11"
        aria-label={`Kurangi ${label}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        -
      </Button>
      <span className="min-w-8 text-center font-medium tabular-nums" aria-live="polite">
        {value}
      </span>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 min-w-11"
        aria-label={`Tambah ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </Button>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        className="min-h-11"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && e.target.value !== "") onChange(n);
        }}
      />
    </div>
  );
}

export function FloorPlanEditor({
  initialAreas,
  initialTables,
  save,
}: {
  initialAreas: Area[];
  initialTables: Table[];
  save: (input: DiningLayoutInput) => Promise<SaveResult>;
}) {
  const [areas, setAreas] = useState(initialAreas);
  const [tables, setTables] = useState(initialTables);
  const [areaId, setAreaId] = useState<string | null>(initialAreas[0]?.id ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [list, setList] = useState(false);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [areaName, setAreaName] = useState("");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [pending, startTransition] = useTransition();
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; px: number; py: number; gx: number; gy: number } | null>(null);

  const area = areas.find((a) => a.id === areaId) ?? areas[0] ?? null;
  const inArea = tables.filter((t) => t.area_id === area?.id);
  const selected = tables.find((t) => t.id === selectedId) ?? null;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = (next: Table[]) => {
    setTables(next);
    setDirty(true);
  };
  const patch = (id: string, change: Partial<Table>) =>
    edit(tables.map((t) => (t.id === id ? fit({ ...t, ...change }) : t)));
  const say = (t: Table) => setAnnounce(`Meja ${t.name} di kolom ${t.grid_x + 1}, baris ${t.grid_y + 1}`);

  function addTable(shape: Table["shape"]) {
    if (!area) return;
    const letter = (area.name.trim()[0] ?? "M").toUpperCase();
    const used = new Set(tables.map((t) => t.name.toLowerCase()));
    let n = inArea.length + 1;
    while (used.has(`${letter}${n}`.toLowerCase())) n++;
    const spot = firstFreeSpot(inArea);
    const t: Table = {
      id: crypto.randomUUID(),
      area_id: area.id,
      name: `${letter}${n}`,
      min_seats: 2,
      max_seats: 4,
      shape,
      grid_x: spot.x,
      grid_y: spot.y,
      grid_w: TABLE_MIN_CELLS,
      grid_h: TABLE_MIN_CELLS,
      note: null,
      bookable_online: true,
      joinable_with: [],
      sort_order: tables.length,
    };
    edit([...tables, t]);
    setSelectedId(t.id);
  }

  function removeTable(id: string) {
    edit(
      tables
        .filter((t) => t.id !== id)
        .map((t) => ({ ...t, joinable_with: t.joinable_with.filter((j) => j !== id) })),
    );
    setSelectedId(null);
  }

  function submitDialog(e: React.FormEvent) {
    e.preventDefault();
    if (!dialog) return;
    const name = areaName.trim();
    if (dialog.kind === "add" && name) {
      const a: Area = { id: crypto.randomUUID(), name, sort_order: areas.length };
      setAreas([...areas, a]);
      setAreaId(a.id);
    } else if (dialog.kind === "rename" && area && name) {
      setAreas(areas.map((a) => (a.id === area.id ? { ...a, name } : a)));
    } else if (dialog.kind === "delete" && area) {
      const gone = new Set(tables.filter((t) => t.area_id === area.id).map((t) => t.id));
      const rest = areas.filter((a) => a.id !== area.id);
      setAreas(rest);
      setAreaId(rest[0]?.id ?? null);
      setTables(tables.filter((t) => !gone.has(t.id)));
      if (selectedId && gone.has(selectedId)) setSelectedId(null);
    } else return;
    setDirty(true);
    setDialog(null);
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>, t: Table) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: t.id, px: e.clientX, py: e.clientY, gx: t.grid_x, gy: t.grid_y };
    setSelectedId(t.id);
  }
  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    const box = canvas.current?.getBoundingClientRect();
    if (!d || !box) return;
    const dx = Math.round(((e.clientX - d.px) / box.width) * FLOOR_COLS);
    const dy = Math.round(((e.clientY - d.py) / box.height) * FLOOR_ROWS);
    const t = tables.find((x) => x.id === d.id);
    if (!t) return;
    const grid_x = clamp(d.gx + dx, 0, FLOOR_COLS - t.grid_w);
    const grid_y = clamp(d.gy + dy, 0, FLOOR_ROWS - t.grid_h);
    if (grid_x !== t.grid_x || grid_y !== t.grid_y) patch(t.id, { grid_x, grid_y });
  }
  function onKeyDown(e: React.KeyboardEvent, t: Table) {
    const moved = moveTableByKey(t, e.key);
    if (!moved) return;
    e.preventDefault();
    patch(t.id, { grid_x: moved.grid_x, grid_y: moved.grid_y });
    say(moved);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await save({
        areas: areas.map((a, i) => ({ ...a, sort_order: i })),
        tables: tables.map((t, i) => ({
          id: t.id,
          area_id: t.area_id,
          name: t.name,
          min_seats: t.min_seats,
          max_seats: t.max_seats,
          shape: t.shape,
          grid_x: t.grid_x,
          grid_y: t.grid_y,
          grid_w: t.grid_w,
          grid_h: t.grid_h,
          note: t.note?.trim() ? t.note.trim() : null,
          bookable_online: t.bookable_online,
          joinable_with: t.joinable_with,
          sort_order: i,
        })),
      });
      if (result.ok) setDirty(false);
      else setError(result.error);
    });
  }

  const seatTotal = inArea.reduce((sum, t) => sum + t.max_seats, 0);
  const label = (t: Table) =>
    `Meja ${t.name}, ${seatRangeLabel(t.min_seats, t.max_seats)}, kolom ${t.grid_x + 1}, baris ${t.grid_y + 1}`;
  const others = selected ? tables.filter((t) => t.area_id === selected.area_id && t.id !== selected.id) : [];

  return (
    <section aria-label="Editor denah" className="flex flex-col gap-4">
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Area" className="border-border flex flex-wrap gap-1 rounded-md border p-1">
          {areas.map((a) => {
            const on = a.id === area?.id;
            return (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={on}
                className={cn(
                  "min-h-11 rounded-md px-4 text-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  on ? "bg-primary text-primary-foreground" : "text-foreground",
                )}
                onClick={() => {
                  setAreaId(a.id);
                  setSelectedId(null);
                }}
              >
                {`${a.name}, ${tables.filter((t) => t.area_id === a.id).length} meja`}
              </button>
            );
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={areas.length >= 10}
          onClick={() => {
            setAreaName("");
            setDialog({ kind: "add" });
          }}
        >
          Tambah area
        </Button>
        {area ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setAreaName(area.name);
                setDialog({ kind: "rename" });
              }}
            >
              Ganti nama area
            </Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setDialog({ kind: "delete" })}>
              Hapus area
            </Button>
          </>
        ) : null}
      </div>

      {area ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className="min-h-11" disabled={tables.length >= 100} onClick={() => addTable("ROUND")}>
              Tambah meja bulat
            </Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={tables.length >= 100} onClick={() => addTable("RECT")}>
              Tambah meja kotak
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              aria-pressed={list}
              onClick={() => setList((v) => !v)}
            >
              {list ? "Lihat denah" : "Lihat daftar"}
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
            <div className="flex flex-col gap-2">
              {list ? (
                inArea.length === 0 ? (
                  <p className="text-muted-foreground border-border rounded-md border p-4 text-sm">Belum ada meja di area ini.</p>
                ) : (
                  <div className="border-border overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-muted-foreground border-border border-b text-left">
                          <th scope="col" className="p-3 font-medium">Nama</th>
                          <th scope="col" className="p-3 font-medium">Area</th>
                          <th scope="col" className="p-3 font-medium">Kursi</th>
                          <th scope="col" className="p-3 font-medium">Online</th>
                          <th scope="col" className="p-3"><span className="sr-only">Aksi</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {inArea.map((t) => (
                          <tr key={t.id} className={cn("border-border border-b last:border-0", t.id === selectedId && "bg-muted")}>
                            <th scope="row" className="p-3 text-left font-bold">{t.name}</th>
                            <td className="p-3">{area.name}</td>
                            <td className="p-3">{seatRangeLabel(t.min_seats, t.max_seats)}</td>
                            <td className="p-3">{t.bookable_online ? "Ya" : "Tidak"}</td>
                            <td className="p-3 text-right">
                              <Button
                                type="button"
                                variant="outline"
                                className="min-h-11"
                                aria-label={`Ubah meja ${t.name}`}
                                onClick={() => setSelectedId(t.id)}
                              >
                                Ubah
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div
                  ref={canvas}
                  className="border-border bg-card relative w-full rounded-md border"
                  style={{
                    aspectRatio: `${FLOOR_COLS} / ${FLOOR_ROWS}`,
                    backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
                    backgroundSize: `${100 / FLOOR_COLS}% ${100 / FLOOR_ROWS}%`,
                  }}
                >
                  {inArea.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={t.id === selectedId}
                      aria-label={label(t)}
                      onClick={() => setSelectedId(t.id)}
                      onKeyDown={(e) => onKeyDown(e, t)}
                      onPointerDown={(e) => onPointerDown(e, t)}
                      onPointerMove={onPointerMove}
                      onPointerUp={() => {
                        drag.current = null;
                      }}
                      className={cn(
                        "absolute flex touch-none flex-col items-center justify-center border-2 text-xs select-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        t.shape === "ROUND" ? "rounded-full" : "rounded-md",
                        t.id === selectedId
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-foreground bg-card text-foreground",
                        !t.bookable_online && "border-dashed",
                      )}
                      style={{
                        left: `${(t.grid_x / FLOOR_COLS) * 100}%`,
                        top: `${(t.grid_y / FLOOR_ROWS) * 100}%`,
                        width: `${(t.grid_w / FLOOR_COLS) * 100}%`,
                        height: `${(t.grid_h / FLOOR_ROWS) * 100}%`,
                      }}
                    >
                      <span className="font-bold">{t.name}</span>
                      <span>{t.max_seats}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-muted-foreground text-sm">Seret meja, atau pilih lalu geser dengan tombol panah.</p>
              <p aria-live="polite" className="sr-only">{announce}</p>
            </div>

            <div className="border-border flex flex-col gap-4 rounded-md border p-4">
              {selected ? (
                <>
                  <h3 className="font-heading text-base font-medium">{`Meja ${selected.name}`}</h3>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="meja-nama">Nama atau nomor</Label>
                    <Input
                      id="meja-nama"
                      className="min-h-11"
                      maxLength={20}
                      value={selected.name}
                      onChange={(e) => patch(selected.id, { name: e.target.value })}
                    />
                  </div>
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-sm font-medium">Jumlah tamu</legend>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm">Minimum</span>
                      <Stepper label="minimum" value={selected.min_seats} min={1} max={selected.max_seats} onChange={(v) => patch(selected.id, { min_seats: v })} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm">Maksimum</span>
                      <Stepper label="maksimum" value={selected.max_seats} min={selected.min_seats} max={50} onChange={(v) => patch(selected.id, { max_seats: v })} />
                    </div>
                  </fieldset>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField id="meja-kolom" label="Kolom" min={1} max={FLOOR_COLS} value={selected.grid_x + 1} onChange={(v) => patch(selected.id, { grid_x: v - 1 })} />
                    <NumberField id="meja-baris" label="Baris" min={1} max={FLOOR_ROWS} value={selected.grid_y + 1} onChange={(v) => patch(selected.id, { grid_y: v - 1 })} />
                    <NumberField id="meja-lebar" label="Lebar (sel)" min={TABLE_MIN_CELLS} max={TABLE_MAX_CELLS} value={selected.grid_w} onChange={(v) => patch(selected.id, { grid_w: v })} />
                    <NumberField id="meja-tinggi" label="Tinggi (sel)" min={TABLE_MIN_CELLS} max={TABLE_MAX_CELLS} value={selected.grid_h} onChange={(v) => patch(selected.id, { grid_h: v })} />
                  </div>
                  <fieldset className="flex gap-2">
                    <legend className="mb-1 text-sm font-medium">Bentuk</legend>
                    {(["ROUND", "RECT"] as const).map((s) => (
                      <Button
                        key={s}
                        type="button"
                        variant="outline"
                        className="min-h-11 flex-1"
                        aria-pressed={selected.shape === s}
                        data-active={selected.shape === s}
                        onClick={() => patch(selected.id, { shape: s })}
                      >
                        {s === "ROUND" ? "Bulat" : "Kotak"}
                      </Button>
                    ))}
                  </fieldset>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="meja-catatan">Catatan untuk pelanggan</Label>
                    <Input
                      id="meja-catatan"
                      className="min-h-11"
                      maxLength={60}
                      value={selected.note ?? ""}
                      onChange={(e) => patch(selected.id, { note: e.target.value || null })}
                    />
                  </div>
                  <div className="flex min-h-11 items-center justify-between gap-3">
                    <Label htmlFor="meja-online">Bisa dipesan online</Label>
                    <Switch
                      id="meja-online"
                      checked={selected.bookable_online}
                      onCheckedChange={(v) => patch(selected.id, { bookable_online: v })}
                    />
                  </div>
                  <fieldset className="flex flex-col gap-1">
                    <legend className="mb-1 text-sm font-medium">Boleh digabung dengan</legend>
                    {others.length === 0 ? (
                      <p className="text-muted-foreground text-sm">Belum ada meja lain di area ini.</p>
                    ) : (
                      others.map((o) => {
                        const on = selected.joinable_with.includes(o.id);
                        return (
                          <label key={o.id} className="flex min-h-11 items-center gap-3 text-sm">
                            <input
                              type="checkbox"
                              className="size-5"
                              checked={on}
                              disabled={!on && selected.joinable_with.length >= 8}
                              onChange={() =>
                                patch(selected.id, {
                                  joinable_with: on
                                    ? selected.joinable_with.filter((j) => j !== o.id)
                                    : [...selected.joinable_with, o.id],
                                })
                              }
                            />
                            {`Meja ${o.name}`}
                          </label>
                        );
                      })
                    )}
                  </fieldset>
                  <Button
                    type="button"
                    variant="destructive"
                    className="min-h-11"
                    onClick={() => removeTable(selected.id)}
                  >
                    Hapus meja
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">Pilih meja untuk mengubah detailnya.</p>
              )}
            </div>
          </div>

          <p className="text-sm font-medium">{`${inArea.length} meja, ${seatTotal} kursi di area ${area.name}`}</p>
        </>
      ) : (
        <p className="text-muted-foreground border-border rounded-md border p-4 text-sm">
          Belum ada area. Tambahkan area pertama, misalnya Dalam atau Teras.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" className="min-h-11" disabled={pending || !dirty} onClick={submit}>
          {pending ? <Spinner /> : null}
          Simpan denah
        </Button>
        {dirty ? <span className="text-muted-foreground text-sm">Ada perubahan yang belum disimpan.</span> : null}
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <form onSubmit={submitDialog} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>
                {dialog?.kind === "add" ? "Tambah area" : dialog?.kind === "rename" ? "Ganti nama area" : "Hapus area"}
              </DialogTitle>
              <DialogDescription>
                {dialog?.kind === "delete"
                  ? `Area ${area?.name ?? ""} dan semua mejanya dihapus saat Anda menyimpan denah.`
                  : "Nama area maksimal 30 karakter."}
              </DialogDescription>
            </DialogHeader>
            {dialog?.kind !== "delete" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="area-nama">Nama area</Label>
                <Input
                  id="area-nama"
                  className="min-h-11"
                  maxLength={30}
                  value={areaName}
                  onChange={(e) => setAreaName(e.target.value)}
                />
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setDialog(null)}>
                Batal
              </Button>
              <Button
                type="submit"
                variant={dialog?.kind === "delete" ? "destructive" : "default"}
                className="min-h-11"
                disabled={dialog?.kind !== "delete" && !areaName.trim()}
              >
                {dialog?.kind === "delete" ? "Hapus area" : "Simpan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
