import type { BookingStatus } from "@/types/database";

/** Jendela bayar setelah pelanggan menekan "Bayar sekarang" pada permintaan yang disetujui. */
const PAY_WINDOW_MS = 15 * 60 * 1000;

/**
 * Menentukan apa yang boleh dilakukan rute bayar terhadap sebuah booking.
 * Permintaan yang disetujui adalah PENDING tanpa payment_url (charge belum dibuat).
 */
export function payDecision(
  row: { status: BookingStatus; expires_at: string; payment_url: string | null },
  nowMs: number,
): "CHARGE" | "ALREADY_CHARGED" | "NOT_PAYABLE" {
  if (row.status !== "PENDING" || Date.parse(row.expires_at) <= nowMs) return "NOT_PAYABLE";
  return row.payment_url ? "ALREADY_CHARGED" : "CHARGE";
}

/** min(expiresAt, sekarang + 15 menit): hanya memendekkan, tidak pernah memperpanjang. */
export function paymentHoldUntil(expiresAt: string, nowMs: number): string {
  return new Date(Math.min(Date.parse(expiresAt), nowMs + PAY_WINDOW_MS)).toISOString();
}
