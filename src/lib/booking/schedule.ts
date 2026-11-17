import type { DayOfWeek } from "@/types/database";
import { isoDayOfWeek, type FreeSlot } from "./slots";

export type DateStripDay = { dateISO: string; open: boolean };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Strip tanggal `count` hari dimulai dari `todayISO`. Hari tutup tetap ada
 * (open: false) supaya pelanggan melihat kalender utuh, tidak lompat-lompat.
 * Maju per 24 jam dari tengah hari UTC: WIB tanpa DST, jadi aman.
 */
export function buildDateStrip(
  openDays: ReadonlySet<DayOfWeek>,
  todayISO: string,
  count = 14,
): DateStripDay[] {
  const startMs = Date.parse(`${todayISO}T12:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const dateISO = new Date(startMs + i * DAY_MS).toISOString().slice(0, 10);
    return { dateISO, open: openDays.has(isoDayOfWeek(dateISO)) };
  });
}

/** Hari buka pertama setelah `afterISO`, atau null bila tidak ada di strip. */
export function nextOpenDate(strip: DateStripDay[], afterISO: string): string | null {
  return strip.find((day) => day.open && day.dateISO > afterISO)?.dateISO ?? null;
}

export type SlotPeriod = "PAGI" | "SIANG" | "SORE" | "MALAM";

export const SLOT_PERIOD_LABEL: Record<SlotPeriod, string> = {
  PAGI: "Pagi",
  SIANG: "Siang",
  SORE: "Sore",
  MALAM: "Malam",
};

/** Batas atas (exclusive) tiap periode dalam menit sejak 00:00 Jakarta. */
const PERIOD_UPPER_MINUTES: [SlotPeriod, number][] = [
  ["PAGI", 11 * 60],
  ["SIANG", 15 * 60],
  ["SORE", 18 * 60],
];

function periodOf(label: string): SlotPeriod {
  const [h, m] = label.split(":").map(Number);
  const minutes = h * 60 + m;
  for (const [period, upper] of PERIOD_UPPER_MINUTES) {
    if (minutes < upper) return period;
  }
  return "MALAM";
}

/** Mengelompokkan slot per periode, urut, dan membuang periode yang kosong. */
export function groupSlotsByPeriod(
  slots: FreeSlot[],
): { period: SlotPeriod; slots: FreeSlot[] }[] {
  const order: SlotPeriod[] = ["PAGI", "SIANG", "SORE", "MALAM"];
  const buckets = new Map<SlotPeriod, FreeSlot[]>();
  for (const slot of slots) {
    const period = periodOf(slot.label);
    const bucket = buckets.get(period) ?? [];
    bucket.push(slot);
    buckets.set(period, bucket);
  }
  return order
    .filter((period) => buckets.has(period))
    .map((period) => ({ period, slots: buckets.get(period) ?? [] }));
}

/** Nama bulan dan tahun dalam Bahasa Indonesia, mis. "November 2026". */
export function monthLabel(dateISO: string): string {
  return new Date(`${dateISO}T12:00:00Z`).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
