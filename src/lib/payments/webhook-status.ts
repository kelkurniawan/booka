import "server-only";

import type { BookingStatus, PaymentProvider } from "@/types/database";

export type ProviderWebhookOutcome = "PAID" | "IGNORE";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Ambil order id / reference id provider dari body webhook, dipakai
 * mencocokkan ke `bookings.payment_reference` (lihat POST /api/bookings —
 * `payment_reference` diisi dari `charge.orderId`, yang untuk kedua
 * provider sama dengan `bookings.id`).
 *
 * Midtrans: `order_id` di top-level body.
 * Xendit: webhook QR Code API v2 membungkus payload asli di field `data`
 * (bentuk `{ event, data: { reference_id, status, ... } }`) — `reference_id`
 * top-level tetap dicoba lebih dulu untuk kompatibilitas kalau providernya
 * suatu saat mengirim bentuk flat.
 */
export function extractProviderOrderId(
  provider: PaymentProvider,
  body: Record<string, unknown>,
): string | null {
  if (provider === "MIDTRANS") {
    const orderId = asString(body.order_id);
    return orderId || null;
  }

  const referenceId = asString(body.reference_id) || asString(asRecord(body.data)?.reference_id);
  return referenceId || null;
}

/**
 * Petakan payload webhook provider ke keputusan "bayar lunas atau tidak".
 * Status selain yang eksplisit di-map di bawah (expire/cancel/deny/pending
 * Midtrans, PENDING/FAILED Xendit, dst.) sengaja diabaikan (`IGNORE`) —
 * booking yang kedaluwarsa ditangani cron pembatalan (Task 10), bukan
 * webhook ini.
 */
export function mapProviderStatus(
  provider: PaymentProvider,
  body: Record<string, unknown>,
): ProviderWebhookOutcome {
  if (provider === "MIDTRANS") {
    const status = asString(body.transaction_status);
    const fraudStatus = asString(body.fraud_status);

    if (status === "settlement") return "PAID";
    if (status === "capture" && fraudStatus === "accept") return "PAID";
    return "IGNORE";
  }

  const data = asRecord(body.data);
  const status = asString(data?.status) || asString(body.status);
  return status === "SUCCEEDED" || status === "COMPLETED" ? "PAID" : "IGNORE";
}

/**
 * Keputusan idempotensi: booking hanya boleh bertransisi PENDING -> PAID.
 *
 *  - Sudah PAID: webhook duplikat (gateway memang bisa mengirim event yang
 *    sama lebih dari sekali) — no-op, bukan diproses ulang.
 *  - CANCELLED: booking ini sudah dianggap batal (kemungkinan besar direap
 *    cron kedaluwarsa Task 10) dan slotnya bisa saja sudah direbut booking
 *    lain. Pembayaran yang datang telat SENGAJA TIDAK di-flip balik ke PAID
 *    di sini — itu bisa menyebabkan dua booking valid pada slot yang sama.
 *    Kasus ini perlu penanganan manual oleh merchant (refund/hubungi
 *    pelanggan), bukan otomatis lewat webhook.
 */
export function shouldMarkPaid(currentStatus: BookingStatus): boolean {
  return currentStatus === "PENDING";
}
