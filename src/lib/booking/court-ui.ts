// Logika murni tampilan sewa lapangan (jadwal L1, denah L1b, rincian harga L2).
// Tanpa JSX dan tanpa impor Next supaya bisa diuji di `npm run test:unit`.

import type { CourtEnvironment, CourtProfile, VenueAreaView } from "@/types/database";
import { formatRupiah } from "@/lib/format";

import { voucherIneligibleReason, type VoucherTerms } from "./voucher";
import { courtPrice, type CourtPriceRule, type CourtPriceSegment } from "./court";

/** Satu jam mulai dari GET /api/slots untuk layanan sewa. */
export type CourtSlotDto = {
  time: string;
  start: string;
  full: boolean;
  freeCount: number;
  price: number;
  courts: { id: string; name: string }[];
};

/** Data lapangan untuk halaman publik: profil, denah, dan aturan jam ramai per layanan sewa. */
export type CourtVenueData = {
  courts: CourtProfile[];
  areas: VenueAreaView[];
  markers: VenueAreaView[];
  rulesByService: Record<string, CourtPriceRule[]>;
};

export const NO_COURT_VENUE: CourtVenueData = { courts: [], areas: [], markers: [], rulesByService: {} };

const rp = (n: number): string => formatRupiah(n).replace(/\s/g, "");
const dot = (hhmm: string): string => hhmm.replace(":", ".");

export const ENVIRONMENT_LABEL: Record<CourtEnvironment, string> = {
  INDOOR: "Indoor",
  OUTDOOR: "Outdoor",
  OUTDOOR_BERATAP: "Outdoor beratap",
};

export type CourtSlotRow = {
  key: string;
  label: string;
  price: string;
  note: string;
  count: string;
  full: boolean;
  checked: boolean;
  aria: string;
};

/** Harga dan catatan memakai courtPrice, sama dengan yang ditagih server. */
export function buildCourtSlotRows(params: {
  slots: CourtSlotDto[];
  basePerHour: number;
  rules: CourtPriceRule[];
  dateISO: string;
  durationMinutes: number;
  unitMinutes: 30 | 60;
  selectedStart: string | null;
}): CourtSlotRow[] {
  const { slots, basePerHour, rules, dateISO, durationMinutes, unitMinutes, selectedStart } = params;
  return slots.map((s) => {
    const label = dot(s.time);
    if (s.full) {
      return {
        key: s.start, label, price: "Penuh", note: "Semua lapangan terisi", count: "",
        full: true, checked: false, aria: `${label}, penuh`,
      };
    }
    const { total, segments } = courtPrice({ basePerHour, rules, dateISO, startHHMM: s.time, durationMinutes, unitMinutes });
    const price = rp(effectiveCourtTotal(total, s.price));
    const firstPeak = segments.findIndex((g) => g.peak);
    const allPeak = segments.every((g) => g.peak);
    let note = "Harga biasa";
    if (allPeak) note = "Jam ramai";
    else if (firstPeak >= 0) {
      note = segments[0].peak
        ? `Jam ramai sampai ${dot(segments.find((g) => !g.peak)!.fromHHMM)}`
        : `Sebagian masuk jam ramai mulai ${dot(segments[firstPeak].fromHHMM)}`;
    }
    return {
      key: s.start, label, price, note, count: `${s.freeCount} kosong`, full: false,
      checked: selectedStart === s.start,
      aria: `${label}, ${price}, ${s.freeCount} lapangan kosong`,
    };
  });
}

export type CourtOptionInput = {
  id: string;
  name: string;
  tags: string;
  description: string | null;
  photo: { path: string; alt: string } | null;
};

export type CourtOptionRow = Omit<CourtOptionInput, "id"> & {
  /** null = "Mana saja". */
  id: string | null;
  isAny: boolean;
  busy: boolean;
  checked: boolean;
  aria: string;
};

const ANY_NOTE = "Kami pilihkan lapangan yang kosong.";

/** `freeIds` null = belum ada jam dipilih, jadi belum ada yang terisi. */
export function buildCourtOptions(params: {
  courts: CourtOptionInput[];
  freeIds: string[] | null;
  selectedCourtId: string | null;
}): CourtOptionRow[] {
  const { courts, freeIds, selectedCourtId } = params;
  const any: CourtOptionRow = {
    id: null, name: "Mana saja", tags: "", description: ANY_NOTE, photo: null,
    isAny: true, busy: false, checked: selectedCourtId === null, aria: `Mana saja, ${ANY_NOTE}`,
  };
  const rest = courts.map((c): CourtOptionRow => {
    const busy = freeIds !== null && !freeIds.includes(c.id);
    const lead = busy ? "terisi di jam ini, " : c.tags ? `${c.tags}, ` : "";
    return {
      ...c,
      tags: busy ? "Terisi di jam ini" : c.tags,
      isAny: false, busy, checked: selectedCourtId === c.id,
      aria: `${c.name}, ${lead}${c.description ?? ""}`.replace(/, $/, ""),
    };
  });
  return [any, ...rest];
}

/** "16.30 sampai 18.00" untuk jam mulai dan lama main. */
export function courtRangeLabel(startHHMM: string, durationMinutes: number): string {
  const end = Number(startHHMM.slice(0, 2)) * 60 + Number(startHHMM.slice(3, 5)) + durationMinutes;
  const hhmm = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
  return `${dot(startHHMM)} sampai ${dot(hhmm)}`;
}

/**
 * Baris rincian L2. Nominal per baris dibulatkan; selisih pembulatan masuk
 * baris terakhir supaya jumlah baris sama dengan `total` (hasil courtPrice).
 */
export function buildPriceRows(params: {
  segments: CourtPriceSegment[];
  total: number;
  voucher: { code: string; discount: number } | null;
}): {
  rows: { label: string; amount: string }[];
  voucherRow: { label: string; amount: string } | null;
  total: string;
  totalNumber: number;
} {
  const { segments, total, voucher } = params;
  const amounts = segments.map((g) => Math.round((g.pricePerHour * g.minutes) / 60));
  if (amounts.length > 0) amounts[amounts.length - 1] += total - amounts.reduce((a, b) => a + b, 0);
  const discount = voucher?.discount ?? 0;
  return {
    rows: segments.map((g, i) => ({
      label: `${dot(g.fromHHMM)} sampai ${dot(g.toHHMM)}, ${g.peak ? "jam ramai" : "harga biasa"}`,
      amount: rp(amounts[i]),
    })),
    voucherRow: voucher && discount > 0 ? { label: `Voucher ${voucher.code}`, amount: `-${rp(discount)}` } : null,
    total: rp(total - discount),
    totalNumber: total - discount,
  };
}

// --- Denah (L1b) -----------------------------------------------------------

/** Ukuran lapangan di kanvas editor (piksel), sama dengan papan L1b. */
const COURT_W = 86;
const COURT_H = 210;
const PAD = 12;

export type CourtStatus = "Kosong" | "Dipilih" | "Terisi";

export function courtStatus(courtId: string, busyIds: string[], selectedId: string | null): CourtStatus {
  if (busyIds.includes(courtId)) return "Terisi";
  return selectedId === courtId ? "Dipilih" : "Kosong";
}

/** "Lapangan 2" jadi "L2"; nama tanpa angka di akhir jadi tiga huruf pertama. */
export function courtShort(name: string): string {
  const n = name.trim().match(/(\d+)$/);
  return n ? `L${n[1]}` : name.trim().slice(0, 3);
}

export function venueAria(name: string, status: CourtStatus, firstFeature: string | undefined): string {
  const s = status === "Terisi" ? "terisi di jam ini" : status === "Dipilih" ? "dipilih" : "kosong";
  return [name, s, firstFeature].filter(Boolean).join(", ");
}

type Placed = { id: string; pos_x: number | null; pos_y: number | null };
type Box = { id: string; label: string; pos_x: number; pos_y: number; width: number; height: number };
export type VenueItem = {
  id: string;
  kind: "court" | "area" | "marker";
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Mengubah koordinat kanvas jadi persen supaya denah muat di lebar apa pun. */
export function venueLayout(input: {
  courts: (Placed & { name: string; rotation: number })[];
  areas: Box[];
  markers: Box[];
}): { aspect: number; items: VenueItem[] } {
  const raw: (Omit<VenueItem, "left" | "top" | "width" | "height"> & { x: number; y: number; w: number; h: number })[] = [
    ...input.areas.map((a) => ({ id: a.id, kind: "area" as const, label: a.label, x: a.pos_x, y: a.pos_y, w: a.width, h: a.height })),
    ...input.markers.map((m) => ({ id: m.id, kind: "marker" as const, label: m.label, x: m.pos_x, y: m.pos_y, w: m.width, h: m.height })),
    ...input.courts.flatMap((c) =>
      c.pos_x === null || c.pos_y === null
        ? []
        : [{ id: c.id, kind: "court" as const, label: c.name, x: c.pos_x, y: c.pos_y, w: c.rotation === 90 ? COURT_H : COURT_W, h: c.rotation === 90 ? COURT_W : COURT_H }],
    ),
  ];
  if (!raw.some((r) => r.kind === "court")) return { aspect: 1, items: [] };
  const minX = Math.min(...raw.map((r) => r.x)) - PAD;
  const minY = Math.min(...raw.map((r) => r.y)) - PAD;
  const W = Math.max(...raw.map((r) => r.x + r.w)) + PAD - minX;
  const H = Math.max(...raw.map((r) => r.y + r.h)) + PAD - minY;
  return {
    aspect: W / H,
    items: raw.map((r) => ({
      id: r.id, kind: r.kind, label: r.label,
      left: ((r.x - minX) / W) * 100, top: ((r.y - minY) / H) * 100,
      width: (r.w / W) * 100, height: (r.h / H) * 100,
    })),
  };
}

/** "Rp150.000 per jam, jam ramai Rp250.000" untuk kartu layanan di langkah Jadwal. */
export function courtRateSummary(basePerHour: number, rules: CourtPriceRule[]): string {
  const base = `${rp(basePerHour)} per jam`;
  if (rules.length === 0) return base;
  const prices = rules.map((r) => r.pricePerHour);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  return `${base}, jam ramai ${lo === hi ? rp(lo) : `${rp(lo)} sampai ${rp(hi)}`}`;
}

/**
 * Jam kosong untuk pemilih jam dashboard dari respons /api/slots layanan sewa.
 * `courtId` null = "Mana saja": cukup satu lapangan kosong. Jam penuh dibuang.
 */
export function courtSlotsToFree(
  slots: CourtSlotDto[],
  durationMinutes: number,
  courtId: string | null,
): { startUtc: string; endUtc: string; label: string }[] {
  return slots
    .filter((s) => !s.full && (courtId === null || s.courts.some((c) => c.id === courtId)))
    .map((s) => ({
      startUtc: s.start,
      endUtc: new Date(Date.parse(s.start) + durationMinutes * 60_000).toISOString(),
      label: s.time,
    }));
}

/**
 * Harga dari server (/api/slots) menang bila ada dan berbeda dari hitungan
 * klien, supaya yang tampil selalu sama dengan yang ditagih. Server 0 atau
 * bukan angka berarti tidak ada harga untuk dibandingkan.
 */
export function effectiveCourtTotal(clientTotal: number, serverPrice: number): number {
  return Number.isFinite(serverPrice) && serverPrice > 0 ? serverPrice : clientTotal;
}

/** Dua baris bar bawah langkah Jadwal (papan L1). `courtName` null = "Mana saja". */
export function courtSummaryLines(
  sel: { dateLabel: string; time: string; durationLabel: string; total: number; courtName: string | null } | null,
): { top: string; main: string } {
  if (!sel) return { top: "Belum ada jam dipilih", main: "Pilih jam dulu" };
  return {
    top: `${sel.dateLabel}, ${dot(sel.time)} WIB, ${sel.durationLabel}`,
    main: `${rp(sel.total)}, ${sel.courtName ?? "Mana saja"}`,
  };
}

/** Voucher terpasang diperiksa ulang terhadap total sewa; alasan dipetakan ke pesan netral. */
export function reconcileCourtVoucher(
  voucher: VoucherTerms,
  service: { id: string; price: number },
  total: number,
  serviceNames: Record<string, string>,
): { keep: boolean; notice: string | null } {
  const reason = voucherIneligibleReason(voucher, { id: service.id, price: total }, serviceNames);
  return reason ? { keep: false, notice: `Voucher ${voucher.code} dilepas. ${reason}.` } : { keep: true, notice: null };
}

/** Lapangan lain yang masih kosong di jam yang sama setelah BK070; null bila tidak ada. */
export function pickConflictAlt(
  freshSlot: CourtSlotDto | undefined,
  takenCourtId: string | null,
): { id: string; name: string } | null {
  return freshSlot?.courts.find((c) => c.id !== takenCourtId) ?? null;
}

/** Cabang UI setelah POST /api/bookings gagal untuk layanan sewa. */
export function courtSubmitErrorAction(
  code: string | undefined,
  isCourt: boolean,
): "conflict" | "reload-schedule" | "toast" {
  if (!isCourt) return "toast";
  if (code === "BK070") return "conflict";
  if (code === "BK071" || code === "BK072") return "reload-schedule";
  return "toast";
}
