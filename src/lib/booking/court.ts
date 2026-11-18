import type { DayOfWeek } from "@/types/database";

import { isoDayOfWeek, jakartaWallClockToUtc, type AvailabilityWindow } from "./slots";

export type CourtPriceRule = { dayOfWeek: DayOfWeek; start: string; end: string; pricePerHour: number };
export type CourtPriceSegment = { fromHHMM: string; toHHMM: string; pricePerHour: number; minutes: number; peak: boolean };

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Cermin `court_price` di SQL: tiap unit memakai aturan yang mencakup jam
 * mulai unit itu, di luar aturan memakai harga dasar. Total dibulatkan sekali
 * di akhir; SQL wajib memakai round() pada total yang sama (setengah naik).
 */
export function courtPrice(params: {
  basePerHour: number;
  rules: CourtPriceRule[];
  dateISO: string;
  startHHMM: string;
  durationMinutes: number;
  unitMinutes: 30 | 60;
}): { total: number; segments: CourtPriceSegment[] } {
  const { basePerHour, rules, dateISO, startHHMM, durationMinutes, unitMinutes } = params;
  const dow = isoDayOfWeek(dateISO);
  const from = toMin(startHHMM);
  const segments: CourtPriceSegment[] = [];
  let raw = 0;
  for (let t = from; t < from + durationMinutes; t += unitMinutes) {
    const rule = rules.find((r) => r.dayOfWeek === dow && toMin(r.start) <= t && t < toMin(r.end));
    const pricePerHour = rule ? rule.pricePerHour : basePerHour;
    const peak = !!rule;
    raw += (pricePerHour * unitMinutes) / 60;
    const last = segments[segments.length - 1];
    if (last && last.pricePerHour === pricePerHour && last.peak === peak) {
      last.minutes += unitMinutes;
      last.toHHMM = toHHMM(t + unitMinutes);
    } else {
      segments.push({ fromHHMM: toHHMM(t), toHHMM: toHHMM(t + unitMinutes), pricePerHour, minutes: unitMinutes, peak });
    }
  }
  return { total: Math.round(raw), segments };
}

/** Harga terendah per jam untuk label "mulai Rp...". */
export function startingPrice(basePerHour: number, rules: CourtPriceRule[]): number {
  return Math.min(basePerHour, ...rules.map((r) => r.pricePerHour));
}

export function durationOptions(params: { minMinutes: number; maxMinutes: number; unitMinutes: number }): number[] {
  if (params.unitMinutes <= 0) return [];
  const out: number[] = [];
  for (let m = params.minMinutes; m <= params.maxMinutes; m += params.unitMinutes) out.push(m);
  return out;
}

export function formatDuration(minutes: number): string {
  return `${(minutes / 60).toString().replace(".", ",")} jam`;
}

type CourtRef = { id: string; name: string; sortOrder: number };
type Ordered = { name: string; sortOrder: number };
const byOrder = (a: Ordered, b: Ordered) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

export function computeCourtSlots(params: {
  dateISO: string;
  availability: AvailabilityWindow[];
  courts: CourtRef[];
  booked: { courtId: string; start_datetime: string; end_datetime: string }[];
  unitMinutes: 30 | 60;
  durationMinutes: number;
  now: Date;
}): { time: string; start: string; free: { courtId: string; name: string }[]; full: boolean }[] {
  const { dateISO, availability, courts, unitMinutes, durationMinutes, now } = params;
  const dow = isoDayOfWeek(dateISO);
  const sorted = [...courts].sort(byOrder);
  const booked = params.booked.map((b) => ({
    courtId: b.courtId,
    start: new Date(b.start_datetime).getTime(),
    end: new Date(b.end_datetime).getTime(),
  }));
  const out: { time: string; start: string; free: { courtId: string; name: string }[]; full: boolean }[] = [];

  for (const w of availability) {
    if (w.day_of_week !== dow) continue;
    for (let m = toMin(w.start_time); m + durationMinutes <= toMin(w.end_time); m += unitMinutes) {
      const time = toHHMM(m);
      const s = jakartaWallClockToUtc(dateISO, time).getTime();
      if (s <= now.getTime()) continue;
      const e = s + durationMinutes * 60_000;
      // Setengah terbuka '[)' seperti constraint SQL: bersentuhan bukan irisan.
      const free = sorted
        .filter((c) => !booked.some((b) => b.courtId === c.id && s < b.end && e > b.start))
        .map((c) => ({ courtId: c.id, name: c.name }));
      out.push({ time, start: new Date(s).toISOString(), free, full: free.length === 0 });
    }
  }
  return out;
}

/** Null bila lapangan yang diminta tidak kosong; tanpa permintaan ("Mana saja") urut sort_order lalu nama. */
export function pickCourt(free: { courtId: string; name: string; sortOrder: number }[], requested: string | null): string | null {
  if (requested) return free.some((f) => f.courtId === requested) ? requested : null;
  return [...free].sort(byOrder)[0]?.courtId ?? null;
}
