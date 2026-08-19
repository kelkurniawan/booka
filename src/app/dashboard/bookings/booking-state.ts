/**
 * Tipe & konstanta bersama untuk /dashboard/bookings, dipisah dari
 * actions.ts karena file bertanda "use server" hanya boleh mengekspor async
 * function -- setiap export lain, termasuk konstanta biasa, membuat Next.js
 * melempar "A 'use server' file can only export async functions" (lihat
 * catatan yang sama di service-state.ts).
 */

import type { Booking, BookingStatus } from "@/types/database";

/**
 * Baris booking yang aman ditampilkan di dashboard merchant: TANPA
 * access_token (rahasia, dipakai /pesanan/[token] -- jangan pernah SELECT di
 * halaman ini), TANPA payment_url (payload QRIS mentah, tidak berguna bagi
 * merchant), TANPA merchant_id (tidak pernah dirender), dan TANPA updated_at
 * (kolom housekeeping trigger, tidak dipakai UI mana pun di sini -- kalau
 * suatu saat dibutuhkan, tambahkan ke sini DAN ke BOOKING_LIST_COLUMNS_ARRAY
 * di bawah sekaligus).
 */
export type BookingListItem = Omit<
  Booking,
  "merchant_id" | "access_token" | "payment_url" | "updated_at"
>;

/**
 * Kolom yang benar-benar di-SELECT untuk BookingListItem di page.tsx --
 * SENGAJA bukan "*", supaya access_token tidak pernah ikut terbaca ke
 * memori Server Component ini, apalagi diteruskan ke client component.
 *
 * HARUS berupa string literal, bukan hasil `Array.prototype.join` (tipe
 * baliknya melebar jadi `string` biasa, bukan literal) -- supabase-js
 * menurunkan tipe baris hasil query dari TIPE LITERAL teks `.select()` di
 * page.tsx, jadi begitu literalnya hilang, tipe hasil query jadi generik dan
 * `as BookingListItem[]` di page.tsx berhenti benar-benar diperiksa
 * compiler.
 */
export const BOOKING_LIST_COLUMNS =
  "id, service_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status, payment_provider, payment_reference, paid_at, cancelled_at, cancel_reason, expires_at, created_at";

/**
 * Representasi array bertipe dari BOOKING_LIST_COLUMNS di atas -- typo atau
 * nama kolom yang sudah tidak ada di BookingListItem (mis. karena field-nya
 * baru saja di-Omit, seperti updated_at) langsung jadi error compile-time
 * di sini, bukan diam-diam lolos seperti pada string mentah.
 *
 * Isinya WAJIB sama persis dengan BOOKING_LIST_COLUMNS (string literal di
 * atas tidak bisa diturunkan otomatis dari array ini tanpa kehilangan sifat
 * literal-nya -- lihat komentar di atas) -- kesamaan keduanya, DUA ARAH
 * (tidak ada kolom yang cuma ada di satu sisi), diverifikasi test di
 * booking-state.test.ts, dijalankan tiap `npm run check`.
 */
export const BOOKING_LIST_COLUMN_LIST: readonly (keyof BookingListItem)[] = [
  "id",
  "service_id",
  "service_name",
  "service_price",
  "duration_minutes",
  "start_datetime",
  "end_datetime",
  "customer_name",
  "customer_whatsapp",
  "status",
  "payment_provider",
  "payment_reference",
  "paid_at",
  "cancelled_at",
  "cancel_reason",
  "expires_at",
  "created_at",
];

export type CancelBookingResult = { ok: boolean; message?: string };

/**
 * Status yang ditampilkan ke merchant -- PENDING yang expires_at-nya sudah
 * lewat ditampilkan "Kedaluwarsa", bukan "Menunggu pembayaran": cron baru
 * membatalkannya beberapa saat kemudian (lihat src/app/api/cron/cancel-unpaid),
 * dan merchant tidak boleh mengira slot itu masih hidup di antara waktu itu.
 */
export type DisplayStatus = BookingStatus | "EXPIRED";

export function getDisplayStatus(
  booking: Pick<BookingListItem, "status" | "expires_at">,
): DisplayStatus {
  if (booking.status === "PENDING" && new Date(booking.expires_at).getTime() < Date.now()) {
    return "EXPIRED";
  }
  return booking.status;
}

/** Satu sumber kebenaran label + varian Badge per status tampilan, dipakai
 * bookings-table.tsx dan booking-detail-dialog.tsx supaya keduanya tidak
 * bisa diam-diam berbeda. */
export const STATUS_META: Record<
  DisplayStatus,
  { label: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }
> = {
  PENDING: { label: "Menunggu pembayaran", badgeVariant: "secondary" },
  PAID: { label: "Dibayar", badgeVariant: "default" },
  CANCELLED: { label: "Dibatalkan", badgeVariant: "outline" },
  EXPIRED: { label: "Kedaluwarsa", badgeVariant: "destructive" },
};

export const PROVIDER_LABELS: Record<string, string> = {
  MIDTRANS: "Midtrans",
  XENDIT: "Xendit",
};

/** Pesan cancel_reason yang ditulis saat merchant membatalkan booking secara
 * manual lewat cancelBooking -- dibedakan dari pesan cron
 * ("DP tidak dibayar dalam batas waktu") supaya merchant tahu ini keputusan
 * mereka sendiri, bukan otomatis. */
export const MERCHANT_CANCEL_REASON = "Dibatalkan oleh merchant";
