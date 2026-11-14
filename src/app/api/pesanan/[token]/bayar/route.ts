import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { paymentHoldUntil, payDecision } from "@/lib/booking/pay-request";
import { chargeBooking, chargeFailureMessage, findChargeProvider } from "@/lib/payments/charge-booking";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/pesanan/[token]/bayar
 *
 * Pelanggan membayar permintaan (REQUESTED) yang sudah disetujui merchant.
 * Charge QRIS sengaja dibuat di sini, bukan saat merchant menyetujui: QR
 * punya masa berlaku pendek, sedangkan pelanggan baru membuka halaman
 * pesanan beberapa jam kemudian (Keputusan 3). Saat disetujui, booking
 * menjadi PENDING tanpa payment_url dengan tenggat lebih panjang; di sini
 * tenggat dipendekkan jadi 15 menit sejak pelanggan menekan bayar.
 *
 * Tanpa sesi: token akses 48 hex adalah kuncinya. /api/* TIDAK dicakup
 * matcher proxy, jadi semua verifikasi dilakukan di sini, dan query admin
 * difilter access_token lalu merchant_id. Token tidak pernah dikembalikan.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) {
    return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("bookings")
    .select("id, merchant_id, status, expires_at, payment_url, amount_due_now")
    .eq("access_token", token)
    .maybeSingle();
  if (error) {
    console.error("[api/pesanan/bayar] gagal memuat booking", { error });
    return NextResponse.json({ error: "Gagal memuat pesanan" }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });

  const nowMs = Date.now();
  const decision = payDecision(row, nowMs);
  if (decision === "NOT_PAYABLE") {
    return NextResponse.json(
      { error: "Booking ini tidak sedang menunggu pembayaran." },
      { status: 409 },
    );
  }
  if (decision === "ALREADY_CHARGED") return NextResponse.json({ ok: true });

  let provider;
  try {
    provider = await findChargeProvider(admin, row.merchant_id);
  } catch (providerError) {
    console.error("[api/pesanan/bayar] gagal memuat koneksi payment", { error: providerError });
    return NextResponse.json({ error: "Gagal memuat data pembayaran merchant" }, { status: 500 });
  }
  if (!provider) {
    return NextResponse.json({ error: "Merchant belum mengaktifkan pembayaran" }, { status: 409 });
  }

  // Klaim atomik: hanya satu pemanggil yang lolos filter payment_url is null.
  const { data: claimed, error: claimError } = await admin
    .from("bookings")
    .update({ expires_at: paymentHoldUntil(row.expires_at, nowMs) })
    .eq("id", row.id)
    .eq("merchant_id", row.merchant_id)
    .eq("status", "PENDING")
    .is("payment_url", null)
    .select("id");
  if (claimError) {
    console.error("[api/pesanan/bayar] gagal mengklaim booking", { bookingId: row.id, error: claimError });
    return NextResponse.json({ error: "Gagal memproses pembayaran" }, { status: 500 });
  }
  if (!claimed?.length) return NextResponse.json({ ok: true });

  try {
    await chargeBooking(admin, {
      bookingId: row.id,
      merchantId: row.merchant_id,
      amount: Math.round(Number(row.amount_due_now)),
      provider,
    });
  } catch (chargeError) {
    // Booking TIDAK dibatalkan: tetap PENDING sampai tenggat 15 menit, jadi
    // pelanggan boleh mencoba lagi (klaim di atas hanya memendekkan tenggat).
    console.error("[api/pesanan/bayar] gagal membuat charge QRIS", {
      bookingId: row.id,
      merchantId: row.merchant_id,
      provider,
      error: chargeError,
    });
    return NextResponse.json({ error: chargeFailureMessage(chargeError) }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
