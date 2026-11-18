// Logika murni jadwal lapangan harian (papan L3 dan L4). Tanpa JSX supaya bisa diuji.
import type { BookingStatus } from "@/types/database";

export type ScheduleBooking = {
  id: string;
  courtId: string;
  customerName: string;
  startISO: string;
  endISO: string;
  status: BookingStatus;
  amountDueOnSite: number;
  paidOnSiteAt: string | null;
};

/** Empat gaya blok di legenda L3. */
export type BlockKind = "paid" | "dp" | "onsite" | "pending" | "request";

export const BLOCK_LABEL: Record<BlockKind, string> = {
  paid: "Lunas",
  dp: "DP dibayar, sisa di tempat",
  onsite: "Bayar di tempat",
  pending: "Menunggu bayar QRIS",
  request: "Permintaan, perlu jawaban",
};

/** Null untuk CANCELLED: tidak digambar. */
export function blockKind(b: Pick<ScheduleBooking, "status" | "amountDueOnSite" | "paidOnSiteAt">): BlockKind | null {
  const owes = b.amountDueOnSite > 0 && !b.paidOnSiteAt;
  switch (b.status) {
    case "PAID":
      return owes ? "dp" : "paid";
    case "CONFIRMED":
      return owes ? "onsite" : "paid";
    case "PENDING":
      return "pending";
    case "REQUESTED":
      return "request";
    default:
      return null;
  }
}

/** PENDING dan REQUESTED yang lewat batas tidak lagi menahan jam (cron baru membatalkannya kemudian). */
export function holdsSlot(b: { status: BookingStatus; expiresAt: string | null }, nowMs: number): boolean {
  if (b.status === "CANCELLED") return false;
  if ((b.status === "PENDING" || b.status === "REQUESTED") && b.expiresAt && Date.parse(b.expiresAt) < nowMs) return false;
  return true;
}

export type ScheduleBlock = {
  bookingId: string;
  rowStart: number;
  rowSpan: number;
  status: BlockKind;
  statusLabel: string;
  label: string;
  time: string;
  aria: string;
};

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}.${String(m % 60).padStart(2, "0")}`;
const fmtColon = (m: number) => fmt(m).replace(".", ":");
// WIB tanpa DST: offset tetap +7.
const jakartaMinutes = (iso: string) => {
  const d = new Date(Date.parse(iso) + 7 * 3_600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

export function buildScheduleGrid(params: {
  courts: { id: string; name: string; note: string }[];
  bookings: ScheduleBooking[];
  startHour: number;
  endHour: number;
  rowMinutes: 30 | 60;
  /** Menit sejak 00:00 yang termasuk jam ramai (opsional). */
  peak?: (minuteOfDay: number) => boolean;
}) {
  const { courts, bookings, startHour, endHour, rowMinutes, peak } = params;
  const gridStart = startHour * 60;
  const gridEnd = endHour * 60;

  const hours: { label: string; time: string; peak: boolean }[] = [];
  for (let m = gridStart; m < gridEnd; m += rowMinutes) {
    hours.push({ label: fmt(m), time: fmtColon(m), peak: peak?.(m) ?? false });
  }

  const counts = { total: 0, unpaid: 0 };
  const columns = courts.map((court) => {
    const blocks: ScheduleBlock[] = [];
    for (const b of bookings) {
      if (b.courtId !== court.id) continue;
      const kind = blockKind(b);
      if (!kind) continue;
      const s = Math.max(jakartaMinutes(b.startISO), gridStart);
      const e = Math.min(jakartaMinutes(b.endISO), gridEnd);
      if (e <= s) continue;
      const rowStart = Math.floor((s - gridStart) / rowMinutes);
      const rowSpan = Math.ceil((e - gridStart) / rowMinutes) - rowStart;
      const time = `${fmt(s)} sampai ${fmt(e)}`;
      blocks.push({
        bookingId: b.id,
        rowStart,
        rowSpan,
        status: kind,
        statusLabel: BLOCK_LABEL[kind],
        label: b.customerName,
        time,
        aria: `${b.customerName}, ${court.name}, ${time}, ${BLOCK_LABEL[kind]}`,
      });
      counts.total += 1;
      if (kind === "dp" || kind === "onsite" || kind === "pending") counts.unpaid += 1;
    }
    blocks.sort((a, b) => a.rowStart - b.rowStart);
    return { court, blocks };
  });

  return { hours, columns, counts };
}

/** Teks ringkas di bawah judul: L3 menyebut jumlah lapangan, L4 tidak. */
export function countsText(counts: { total: number; unpaid: number }, courtCount?: number): string {
  if (counts.total === 0) return "Belum ada booking di tanggal ini";
  const where = courtCount ? ` di ${courtCount} lapangan` : "";
  return `${counts.total} booking${where}, ${counts.unpaid} belum lunas`;
}

export function shiftDateISO(dateISO: string, days: number): string {
  return new Date(Date.parse(`${dateISO}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Rentang jam grid dari jam buka hari itu (dibulatkan ke jam penuh); hari tutup jatuh ke bawaan 07 sampai 22. */
export function gridHours(windows: { start_time: string; end_time: string }[]): { startHour: number; endHour: number } {
  if (windows.length === 0) return { startHour: 7, endHour: 22 };
  return {
    startHour: Math.floor(Math.min(...windows.map((w) => toMin(w.start_time))) / 60),
    endHour: Math.min(24, Math.ceil(Math.max(...windows.map((w) => toMin(w.end_time))) / 60)),
  };
}

/** Penanda jam ramai: menit termasuk salah satu aturan hari itu. */
export function peakMatcher(rules: { start: string; end: string }[]): (minuteOfDay: number) => boolean {
  return (m) => rules.some((r) => toMin(r.start) <= m && m < toMin(r.end));
}
