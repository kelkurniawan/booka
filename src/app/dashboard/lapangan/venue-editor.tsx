"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ENVIRONMENT_LABEL } from "@/lib/booking/court-ui";
import { canvasSize, clampBox, courtSize, nudge, rotateAria, rotateCourt, type Rotation } from "@/lib/venue/geometry";
import type { Court } from "@/types/database";

import { saveVenueLayout } from "./actions";

export type Placed = { x: number; y: number; rotation: Rotation };
export type VenueBox = { id: string; label: string; x: number; y: number; w: number; h: number };
export type Layout = { pos: Record<string, Placed>; areas: VenueBox[]; markers: VenueBox[] };
type Sel = { kind: "court" | "area" | "marker"; id: string };
type Item = Sel & { x: number; y: number; w: number; h: number; label: string; rotation?: Rotation };

const tool = "h-11 rounded-lg border bg-background px-2.5 text-sm";

/**
 * Denah tempat (L6). Satuan kanvas dan ukuran lapangan (86 x 210) sama dengan
 * peta publik. Seret dengan pointer, atau fokus lalu pakai panah (Shift = 50).
 */
export function VenueEditor({
  courts, layout, onLayout, selectedCourtId, onSelectCourt,
}: {
  courts: Pick<Court, "id" | "name" | "environment">[];
  layout: Layout;
  onLayout: (l: Layout) => void;
  selectedCourtId: string | null;
  onSelectCourt: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sel: Sel; dx: number; dy: number } | null>(null);
  const [other, setOther] = useState<Sel | null>(null); // area atau penanda terpilih
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();

  const items: Item[] = [
    ...layout.areas.map((a) => ({ ...a, kind: "area" as const })),
    ...layout.markers.map((m) => ({ ...m, kind: "marker" as const })),
    ...courts.flatMap((c) => {
      const p = layout.pos[c.id];
      return p ? [{ kind: "court" as const, id: c.id, label: c.name, x: p.x, y: p.y, ...courtSize(p.rotation), rotation: p.rotation }] : [];
    }),
  ];
  const canvas = canvasSize(items);
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;
  const selectedCourt = courts.find((c) => c.id === selectedCourtId);

  function move(sel: Sel, x: number, y: number) {
    setDirty(true);
    if (sel.kind === "court") {
      onLayout({ ...layout, pos: { ...layout.pos, [sel.id]: { ...layout.pos[sel.id], x, y } } });
    } else {
      const key = sel.kind === "area" ? "areas" : "markers";
      onLayout({ ...layout, [key]: layout[key].map((b) => (b.id === sel.id ? { ...b, x, y } : b)) });
    }
  }

  function select(it: Item) {
    if (it.kind === "court") { setOther(null); onSelectCourt(it.id); } else setOther({ kind: it.kind, id: it.id });
  }

  function onPointerDown(e: React.PointerEvent, it: Item) {
    select(it);
    const box = canvasRef.current!.getBoundingClientRect();
    const k = canvas.w / box.width;
    drag.current = { sel: it, dx: (e.clientX - box.left) * k - it.x, dy: (e.clientY - box.top) * k - it.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent, it: Item) {
    const d = drag.current;
    if (!d || d.sel.id !== it.id) return;
    const box = canvasRef.current!.getBoundingClientRect();
    const k = canvas.w / box.width;
    const p = clampBox({ x: (e.clientX - box.left) * k - d.dx, y: (e.clientY - box.top) * k - d.dy, w: it.w, h: it.h }, canvas);
    move(it, p.x, p.y);
  }
  function onKeyDown(e: React.KeyboardEvent, it: Item) {
    const p = nudge(it, e.key, e.shiftKey, canvas);
    if (!p) return;
    e.preventDefault();
    move(it, p.x, p.y);
  }

  function rotate() {
    if (!selectedCourtId) return;
    const cur = layout.pos[selectedCourtId];
    if (!cur) return;
    setDirty(true);
    onLayout({ ...layout, pos: { ...layout.pos, [selectedCourtId]: rotateCourt(cur, cur.rotation, canvas) } });
  }

  function add(kind: "area" | "marker") {
    const label = kind === "area" ? "Area baru" : "Penanda baru";
    const b: VenueBox = { id: crypto.randomUUID(), label, x: 24, y: 24, w: kind === "area" ? 200 : 120, h: kind === "area" ? 150 : 40 };
    const key = kind === "area" ? "areas" : "markers";
    if (layout[key].length >= (kind === "area" ? 20 : 50)) return setError(kind === "area" ? "Maksimal 20 area" : "Maksimal 50 penanda");
    onLayout({ ...layout, [key]: [...layout[key], b] });
    setOther({ kind, id: b.id });
    setDirty(true);
  }

  const otherBox = other && (other.kind === "area" ? layout.areas : layout.markers).find((b) => b.id === other.id);
  function patchOther(patch: Partial<VenueBox> | null) {
    if (!other) return;
    const key = other.kind === "area" ? "areas" : "markers";
    onLayout({ ...layout, [key]: patch ? layout[key].map((b) => (b.id === other.id ? { ...b, ...patch } : b)) : layout[key].filter((b) => b.id !== other.id) });
    if (!patch) setOther(null);
    setDirty(true);
  }

  function save() {
    setError(null);
    start(async () => {
      const r = await saveVenueLayout({
        courts: courts.flatMap((c) => (layout.pos[c.id] ? [{ id: c.id, pos_x: layout.pos[c.id].x, pos_y: layout.pos[c.id].y, rotation: layout.pos[c.id].rotation }] : [])),
        areas: layout.areas.map((a, i) => ({ id: a.id, label: a.label, pos_x: a.x, pos_y: a.y, width: a.w, height: a.h, sort_order: i })),
        markers: layout.markers.map((a, i) => ({ id: a.id, label: a.label, pos_x: a.x, pos_y: a.y, width: a.w, height: a.h, sort_order: i })),
      });
      if (!r.ok) { setError(r.error); return; }
      setDirty(false);
      toast.success("Denah tersimpan");
    });
  }

  return (
    <section aria-labelledby="map-h" className="min-w-0 flex-[999_1_460px] overflow-hidden rounded-xl border" data-tour="court-venue">
      <div className="flex flex-wrap items-center gap-2 border-b p-2.5">
        <h2 id="map-h" className="mr-2 text-[15px] font-semibold">Denah tempat</h2>
        <button type="button" className={tool} onClick={() => add("area")}>Tambah area</button>
        <button type="button" className={tool} onClick={() => add("marker")}>Tambah penanda</button>
        <span className="flex-1" />
        <button type="button" className={tool} disabled={!selectedCourt} aria-label={selectedCourt ? rotateAria(selectedCourt.name) : "Putar lapangan"} onClick={rotate}>Putar</button>
        <Button type="button" className="h-11" disabled={!dirty || pending} onClick={save}>{pending ? "Menyimpan..." : "Simpan denah"}</Button>
      </div>
      {error ? <p role="alert" className="m-2.5 rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p> : null}
      <div className="overflow-auto bg-muted/40">
        <div
          ref={canvasRef}
          role="group"
          aria-label="Denah, pilih lapangan untuk mengubah profilnya"
          className="relative w-full min-w-[480px]"
          style={{ aspectRatio: `${canvas.w} / ${canvas.h}` }}
        >
          {items.map((it) => {
            const on = (it.kind === "court" && it.id === selectedCourtId) || (other?.id === it.id);
            const label =
              it.kind === "court"
                ? `${it.label}, ${ENVIRONMENT_LABEL[courts.find((c) => c.id === it.id)!.environment]}${it.rotation === 90 ? ", diputar" : ""}`
                : `${it.kind === "area" ? "Area" : "Penanda"} ${it.label}`;
            return (
              <button
                key={`${it.kind}-${it.id}`}
                type="button"
                aria-pressed={on}
                aria-label={label}
                onPointerDown={(e) => onPointerDown(e, it)}
                onPointerMove={(e) => onPointerMove(e, it)}
                onPointerUp={() => (drag.current = null)}
                onKeyDown={(e) => onKeyDown(e, it)}
                onClick={() => select(it)}
                className={`absolute flex touch-none items-center justify-center overflow-hidden rounded p-0 text-[13px] font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                  it.kind === "court"
                    ? on ? "border-primary bg-primary text-primary-foreground cursor-grab border-2 ring-4 ring-border" : "border-primary bg-card text-foreground cursor-grab border-2"
                    : `cursor-grab border border-dashed bg-card/60 text-xs font-medium text-muted-foreground ${on ? "ring-2 ring-primary" : ""}`
                }`}
                style={{ left: pct(it.x, canvas.w), top: pct(it.y, canvas.h), width: pct(it.w, canvas.w), height: pct(it.h, canvas.h) }}
              >
                <span className="px-2 py-1">{it.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      {otherBox && other ? (
        <div className="flex flex-wrap items-end gap-2 border-t p-2.5">
          <div className="flex flex-col gap-1">
            <label htmlFor="lbl" className="text-xs">Label {other.kind === "area" ? "area" : "penanda"}</label>
            <input id="lbl" maxLength={40} value={otherBox.label} onChange={(e) => patchOther({ label: e.target.value })} className="h-11 rounded-lg border px-2.5 text-sm" />
          </div>
          <button type="button" className={`${tool} text-red-700`} onClick={() => patchOther(null)}>Hapus</button>
        </div>
      ) : null}
      <p className="text-muted-foreground border-t p-2.5 text-[13px]">
        Seret lapangan untuk memindahkan, atau pilih lalu geser dengan tombol panah. Ukuran mengikuti jenis olahraga: padel 10 x 20 meter.
      </p>
    </section>
  );
}
