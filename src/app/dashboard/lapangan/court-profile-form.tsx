"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { COURT_ENVIRONMENTS, COURT_SPORTS } from "@/lib/validations/court";
import type { Court } from "@/types/database";

import { saveCourtProfile } from "./actions";

export const SPORT_LABEL: Record<Court["sport"], string> = {
  PADEL: "Padel", FUTSAL: "Futsal", MINI_SOCCER: "Mini soccer", BADMINTON: "Badminton", TENIS: "Tenis",
};
const ENV_LABEL: Record<Court["environment"], string> = { INDOOR: "Indoor", OUTDOOR: "Outdoor", OUTDOOR_BERATAP: "Outdoor beratap" };
const field = "h-9 w-full rounded-lg border bg-background px-2.5 text-sm";

export type ProfileValues = Pick<Court, "name" | "sport" | "environment" | "surface" | "description" | "features">;

/** Profil lapangan (L6): nama, olahraga, tempat, permukaan, deskripsi, ciri maksimal 5. */
export function CourtProfileForm({ courtId, value, onSaved }: { courtId: string; value: ProfileValues; onSaved: (v: ProfileValues) => void }) {
  const [v, setV] = useState({ ...value, surface: value.surface ?? "", description: value.description ?? "", features: value.features.join("\n") });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV({ ...v, [k]: x });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await saveCourtProfile(courtId, { ...v, features: v.features.split("\n") });
      if (!r.ok) { setError(r.error); return; }
      onSaved({
        name: v.name.trim(), sport: v.sport, environment: v.environment,
        surface: v.surface.trim() || null, description: v.description.trim() || null,
        features: v.features.split("\n").map((f) => f.trim()).filter(Boolean),
      });
      toast.success("Profil lapangan tersimpan");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5" data-tour="court-profile">
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="nm" className="font-medium">Nama</label>
        <input id="nm" className={field} maxLength={40} value={v.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="flex gap-2.5">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="jenis" className="font-medium">Olahraga</label>
          <select id="jenis" className={field} value={v.sport} onChange={(e) => set("sport", e.target.value as Court["sport"])}>
            {COURT_SPORTS.map((s) => <option key={s} value={s}>{SPORT_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="tempat" className="font-medium">Tempat</label>
          <select id="tempat" className={field} value={v.environment} onChange={(e) => set("environment", e.target.value as Court["environment"])}>
            {COURT_ENVIRONMENTS.map((s) => <option key={s} value={s}>{ENV_LABEL[s]}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="perm" className="font-medium">Permukaan</label>
        <input id="perm" className={field} maxLength={60} value={v.surface} onChange={(e) => set("surface", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="desk" className="font-medium">Deskripsi</label>
        <textarea id="desk" maxLength={280} value={v.description} onChange={(e) => set("description", e.target.value)} className="min-h-21 rounded-lg border px-2.5 py-2 text-sm leading-snug" />
        <span className="text-muted-foreground self-end text-xs">{v.description.length} / 280</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ciri" className="font-medium">Ciri, satu per baris, maksimal 5</label>
        <textarea id="ciri" value={v.features} onChange={(e) => set("features", e.target.value)} className="min-h-16 rounded-lg border px-2.5 py-2 text-sm" />
      </div>
      <Button type="submit" className="h-11 self-start" disabled={pending}>{pending ? "Menyimpan..." : "Simpan profil"}</Button>
    </form>
  );
}
