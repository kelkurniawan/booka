"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { defaultCourtSpot, needsLayoutSave, nextCourtName, type Rotation } from "@/lib/venue/geometry";
import type { Court, CourtMedia, VenueArea } from "@/types/database";

import { createCourt, deleteCourt, reorderCourts, setCourtActive } from "./actions";
import { CourtPhotos } from "./court-photos";
import { CourtProfileForm } from "./court-profile-form";
import { VenueEditor, type Layout } from "./venue-editor";

export type ManagedCourt = Pick<Court, "id" | "name" | "sport" | "environment" | "surface" | "description" | "features" | "is_active" | "pos_x" | "pos_y" | "rotation"> & {
  photos: Pick<CourtMedia, "id" | "path" | "alt_text" | "width" | "height">[];
};

const box = (a: Pick<VenueArea, "id" | "label" | "pos_x" | "pos_y" | "width" | "height">) => ({ id: a.id, label: a.label, x: a.pos_x, y: a.pos_y, w: a.width, h: a.height });

/** Tab "Lapangan dan denah" (L6): daftar, denah, profil, dan foto. */
export function CourtsManager({
  merchantId, initialCourts, areas, markers,
}: {
  merchantId: string;
  initialCourts: ManagedCourt[];
  areas: VenueArea[];
  markers: VenueArea[];
}) {
  const [courts, setCourts] = useState(initialCourts);
  const [selected, setSelected] = useState<string | null>(initialCourts[0]?.id ?? null);
  const router = useRouter();
  const [dirty, setDirty] = useState(() => needsLayoutSave(initialCourts));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [layout, setLayout] = useState<Layout>(() => ({
    // Lapangan yang belum punya posisi diberi tempat awal; tersimpan lewat "Simpan denah".
    pos: Object.fromEntries(initialCourts.map((c, i) => [c.id, c.pos_x === null || c.pos_y === null ? { ...defaultCourtSpot(i), rotation: 0 as Rotation } : { x: c.pos_x, y: c.pos_y, rotation: c.rotation }])),
    areas: areas.map(box),
    markers: markers.map(box),
  }));
  const sel = courts.find((c) => c.id === selected) ?? null;
  const patch = (id: string, p: Partial<ManagedCourt>) => setCourts((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));

  function add() {
    setError(null);
    start(async () => {
      const r = await createCourt(nextCourtName(courts.map((c) => c.name)));
      if (!r.ok) { setError(r.error); return; }
      const c: ManagedCourt = { id: r.court.id, name: r.court.name, sport: "PADEL", environment: "INDOOR", surface: null, description: null, features: [], is_active: true, pos_x: null, pos_y: null, rotation: 0, photos: [] };
      setCourts((cs) => [...cs, c]);
      setLayout((l) => ({ ...l, pos: { ...l.pos, [c.id]: { ...defaultCourtSpot(courts.length), rotation: 0 } } }));
      setDirty(true); // posisi awal baru ada di editor; publik menunggu "Simpan denah"
      setSelected(c.id);
    });
  }

  function move(i: number, d: -1 | 1) {
    const next = [...courts];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setCourts(next);
    start(async () => {
      const r = await reorderCourts(next.map((c) => c.id));
      if (r.ok) return;
      toast.error(r.error);
      if (r.code === "reorder_partial") router.refresh(); else setCourts(courts);
    });
  }

  function toggle(c: ManagedCourt) {
    start(async () => {
      const r = await setCourtActive(c.id, !c.is_active);
      if (!r.ok) { toast.error(r.error); return; }
      patch(c.id, { is_active: !c.is_active });
    });
  }

  function remove(c: ManagedCourt) {
    if (!window.confirm(`Hapus ${c.name}? Foto lapangan ikut terhapus.`)) return;
    start(async () => {
      const r = await deleteCourt(c.id);
      if (!r.ok) {
        toast.error(r.error);
        if (r.deactivated) patch(c.id, { is_active: false });
        return;
      }
      setCourts((cs) => cs.filter((x) => x.id !== c.id));
      setLayout((l) => { const pos = { ...l.pos }; delete pos[c.id]; return { ...l, pos }; });
      setSelected((s) => (s === c.id ? null : s));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="list-h" className="flex flex-col gap-2 rounded-xl border p-3" data-tour="court-list">
        <h2 id="list-h" className="text-[15px] font-semibold">Daftar lapangan</h2>
        {error ? <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p> : null}
        {courts.length === 0 ? <p className="text-muted-foreground text-sm">Belum ada lapangan. Pakai Tambah lapangan di denah.</p> : null}
        <ul className="flex flex-col gap-1">
          {courts.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
              <button type="button" aria-pressed={c.id === selected} onClick={() => setSelected(c.id)} className={`h-11 flex-1 rounded-lg border px-3 text-left ${c.id === selected ? "border-foreground font-semibold" : ""}`}>
                {c.name}{c.is_active ? "" : " (nonaktif)"}
              </button>
              <button type="button" aria-label={`Naikkan ${c.name}`} disabled={i === 0 || pending} onClick={() => move(i, -1)} className="size-11 rounded-lg border disabled:opacity-40">Naik</button>
              <button type="button" aria-label={`Turunkan ${c.name}`} disabled={i === courts.length - 1 || pending} onClick={() => move(i, 1)} className="size-11 rounded-lg border disabled:opacity-40">Turun</button>
              <button type="button" onClick={() => remove(c)} disabled={pending} className="h-11 rounded-lg border px-3 text-red-700">Hapus</button>
            </li>
          ))}
        </ul>
        <span className="text-muted-foreground text-xs">Lapangan yang punya riwayat booking dinonaktifkan, bukan dihapus.</span>
      </section>

      <div className="flex flex-wrap items-start gap-4">
          <VenueEditor courts={courts} layout={layout} onLayout={setLayout} selectedCourtId={selected} onSelectCourt={setSelected} dirty={dirty} onDirty={setDirty} onAddCourt={add} adding={pending} />
          {sel ? (
            <aside aria-labelledby="prof-h" className="flex min-w-72 flex-[1_1_300px] flex-col gap-3.5 rounded-xl border p-4">
              <h2 id="prof-h" className="text-[15px] font-semibold">Profil {sel.name}</h2>
              <CourtProfileForm key={sel.id} courtId={sel.id} value={sel} onSaved={(v) => patch(sel.id, v)} />
              <CourtPhotos merchantId={merchantId} courtId={sel.id} photos={sel.photos} onChange={(photos) => patch(sel.id, { photos })} />
              <label className="flex min-h-8 cursor-pointer items-center gap-2.5">
                <input type="checkbox" className="size-[18px]" checked={sel.is_active} disabled={pending} onChange={() => toggle(sel)} />
                Bisa dipesan online
              </label>
              <button type="button" disabled={pending} onClick={() => toggle(sel)} className="h-9 self-start rounded-lg border px-2.5 text-sm font-medium text-red-700">
                {sel.is_active ? "Nonaktifkan lapangan" : "Aktifkan lapangan"}
              </button>
              <span className="text-muted-foreground text-xs">Lapangan yang punya riwayat booking dinonaktifkan, bukan dihapus.</span>
            </aside>
          ) : null}
      </div>
    </div>
  );
}
