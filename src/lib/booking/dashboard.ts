// Modul murni dashboard booking: tab, pengelompokan hari WIB, garis "Sekarang",
// aturan kehadiran, total bayar di tempat, dan tautan WhatsApp. Tanpa React
// dan tanpa akses data, supaya bisa diuji langsung.

import type { BookingListItem } from "@/app/dashboard/bookings/booking-state";
import { ON_SITE_METHOD_LABEL } from "@/lib/booking/payment-mode";
import {
  formatDateTime,
  formatRupiah,
  formatTime,
  MONTHS_ID_SHORT,
  WEEKDAYS_ID,
} from "@/lib/format";
import { jakartaDateISO } from "@/lib/booking/slots";

export type BookingTab = "ACTION" | "UPCOMING" | "HISTORY" | "CANCELLED";

export const BOOKING_TABS: readonly { tab: BookingTab; param: string; label: string }[] = [
  { tab: "ACTION", param: "tindakan", label: "Perlu tindakan" },
  { tab: "UPCOMING", param: "mendatang", label: "Akan datang" },
  { tab: "HISTORY", param: "riwayat", label: "Riwayat" },
  { tab: "CANCELLED", param: "batal", label: "Dibatalkan" },
];

/** Param tak dikenal atau kosong -> "UPCOMING". */
export function parseTab(param: string | undefined): BookingTab {
  return BOOKING_TABS.find((t) => t.param === param)?.tab ?? "UPCOMING";
}

export function tabParam(tab: BookingTab): string {
  return BOOKING_TABS.find((t) => t.tab === tab)!.param;
}

export type ActionKind = "REQUEST" | "UNPAID" | "ATTENDANCE" | "ON_SITE_UNPAID";

/** Untuk baris yang SUDAH berada di tab ACTION. */
export function actionKind(b: Pick<BookingListItem, "status" | "attended_at" | "no_show_at">): ActionKind {
  if (b.status === "REQUESTED") return "REQUEST";
  if (b.status === "PENDING") return "UNPAID";
  // Sudah lewat mulai: belum ditandai hadir/tidak datang -> tandai dulu.
  if (!b.attended_at && !b.no_show_at) return "ATTENDANCE";
  // Sisanya sudah ditandai tetapi masih ada tagihan di tempat.
  return "ON_SITE_UNPAID";
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Hari ini, Sabtu 14 Nov", "Besok, Minggu 15 Nov", "Kemarin, Jumat 13 Nov", "Senin 16 Nov", beda tahun: "Senin 4 Jan 2027". */
export function dayLabel(dateISO: string, todayISO: string): string {
  const date = new Date(`${dateISO}T00:00:00Z`);
  const diffDays = Math.round((date.getTime() - Date.parse(`${todayISO}T00:00:00Z`)) / DAY_MS);
  const dayName = `${WEEKDAYS_ID[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS_ID_SHORT[date.getUTCMonth()]}`;
  if (diffDays === 0) return `Hari ini, ${dayName}`;
  if (diffDays === 1) return `Besok, ${dayName}`;
  if (diffDays === -1) return `Kemarin, ${dayName}`;
  const sameYear = dateISO.slice(0, 4) === todayISO.slice(0, 4);
  return sameYear ? dayName : `${dayName} ${date.getUTCFullYear()}`;
}

/** Kelompok berurutan per tanggal WIB; urutan baris dipertahankan. */
export function groupByJakartaDay<T extends { start_datetime: string }>(
  rows: T[],
): { dateISO: string; rows: T[] }[] {
  const groups: { dateISO: string; rows: T[] }[] = [];
  for (const row of rows) {
    const dateISO = jakartaDateISO(new Date(row.start_datetime));
    const last = groups[groups.length - 1];
    if (last && last.dateISO === dateISO) last.rows.push(row);
    else groups.push({ dateISO, rows: [row] });
  }
  return groups;
}

/** Indeks tempat garis "Sekarang" disisipkan (sebelum baris pertama yang mulai >= now); null bila semua baris di satu sisi. */
export function nowLineIndex(rows: { start_datetime: string }[], nowMs: number): number | null {
  const index = rows.findIndex((r) => Date.parse(r.start_datetime) >= nowMs);
  // -1: semua sudah lewat. 0: semua belum mulai. Keduanya tanpa garis.
  return index <= 0 ? null : index;
}

/** Aturan F2 Keputusan 11: hadir mulai 1 jam sebelum mulai, tidak datang mulai jam mulai. */
export function attendanceWindow(startISO: string, nowMs: number): { canAttend: boolean; canNoShow: boolean } {
  const start = Date.parse(startISO);
  return {
    canAttend: nowMs >= start - 60 * 60 * 1000,
    canNoShow: nowMs >= start,
  };
}

/** Total tagihan bayar di tempat yang belum dibatalkan sebagai tidak datang. */
export function onSiteTotals(
  rows: Pick<BookingListItem, "amount_due_on_site" | "paid_on_site_at" | "no_show_at">[],
): { count: number; total: number; paid: number } {
  let count = 0;
  let total = 0;
  let paid = 0;
  for (const r of rows) {
    if (r.no_show_at || r.amount_due_on_site <= 0) continue;
    count += 1;
    total += r.amount_due_on_site;
    if (r.paid_on_site_at) paid += r.amount_due_on_site;
  }
  return { count, total, paid };
}

/** Tautan wa.me; nomor dibersihkan jadi digit saja. */
export function whatsappLink(e164: string, text?: string): string {
  const digits = e164.replace(/\D/g, "");
  const query = text === undefined ? "" : `?text=${encodeURIComponent(text)}`;
  return `https://wa.me/${digits}${query}`;
}

export function unpaidReminderLink(
  b: Pick<BookingListItem, "customer_whatsapp" | "customer_name" | "service_name" | "start_datetime" | "expires_at">,
): string {
  const text = `Halo ${b.customer_name}, booking ${b.service_name} untuk ${formatDateTime(b.start_datetime)} menunggu pembayaran sampai pukul ${formatTime(b.expires_at)} WIB. Abaikan pesan ini bila sudah membayar.`;
  return whatsappLink(b.customer_whatsapp, text);
}

export function rescheduleNoticeLink(
  b: Pick<BookingListItem, "customer_whatsapp" | "customer_name" | "service_name">,
  newStartISO: string,
): string {
  const text = `Halo ${b.customer_name}, jadwal ${b.service_name} Anda sudah kami ubah ke ${formatDateTime(newStartISO)}. Terima kasih.`;
  return whatsappLink(b.customer_whatsapp, text);
}

/** Ringkasan pembayaran satu baris: teks utama + keterangan sisa/pelunasan. */
export function paymentSummary(b: BookingListItem): { main: string; sub: string | null } {
  const onSiteToo = b.amount_due_on_site > 0;
  const main =
    b.amount_due_now <= 0
      ? "Bayar di tempat"
      : b.status === "PAID"
        ? `${onSiteToo ? "DP" : "Lunas"} ${formatRupiah(b.amount_due_now)}${onSiteToo ? " lunas" : ""}`
        : `${b.status === "REQUESTED" ? "Bayar online" : "Belum bayar"} ${formatRupiah(b.amount_due_now)}`;
  if (b.amount_due_on_site <= 0) return { main, sub: null };
  if (b.paid_on_site_at) {
    const method = b.paid_on_site_method ? ON_SITE_METHOD_LABEL[b.paid_on_site_method].toLowerCase() : "";
    return { main, sub: `Lunas ${formatRupiah(b.amount_due_on_site)} ${method}`.trim() };
  }
  return { main, sub: `Sisa ${formatRupiah(b.amount_due_on_site)} di tempat` };
}
