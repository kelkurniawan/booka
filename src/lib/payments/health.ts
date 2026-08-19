import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import type { PaymentProvider } from "@/types/database";

import type { ChargeRejectedError } from "./errors";

/**
 * Batas panjang pesan yang disimpan ke `payment_connections.last_charge_error`
 * -- lihat brief bagian 3. Cukup untuk pesan provider yang sudah dirangkai
 * adapter (satu-dua kalimat), tidak dimaksudkan menampung body respons.
 */
const MAX_ERROR_MESSAGE_LENGTH = 300;

/**
 * Catat charge QRIS SUKSES ke kolom kesehatan `payment_connections`, dan
 * bersihkan jejak penolakan sebelumnya -- kalau charge terakhir sukses,
 * peringatan "pembayaran sedang gagal" di /dashboard/payments
 * (provider-card.tsx) harus hilang lagi.
 *
 * Dipanggil dari POST /api/bookings SETELAH charge sukses (bukan di dalam
 * try/catch charge-nya sendiri) -- lihat pemanggilnya untuk urutan lengkap.
 *
 * `admin` WAJIB instance `createAdminClient()` yang SAMA yang sudah dipakai
 * route pemanggil (bukan dibuat baru di sini) -- AGENTS.md: setiap query
 * lewat klien admin wajib memfilter `merchant_id` eksplisit, dan di sini
 * filternya `merchant_id` + `provider` (kombinasi unik
 * `payment_connections_unique_provider`).
 *
 * Kegagalan menulis TIDAK PERNAH dilempar ulang -- pemanggil wajib tetap
 * membalas status HTTP yang sama ke pelanggan terlepas dari berhasil
 * tidaknya pencatatan kesehatan ini (brief bagian 3: "penulisan ini tidak
 * boleh menggagalkan request").
 */
export async function recordChargeSuccess(
  admin: ReturnType<typeof createAdminClient>,
  merchantId: string,
  provider: PaymentProvider,
): Promise<void> {
  const { error } = await admin
    .from("payment_connections")
    .update({
      last_charge_success_at: new Date().toISOString(),
      last_charge_error: null,
      last_charge_error_at: null,
    })
    .eq("merchant_id", merchantId)
    .eq("provider", provider);

  if (error) {
    console.error("[payments/health] gagal mencatat charge sukses ke payment_connections", {
      merchantId,
      provider,
      error,
    });
  }
}

/**
 * Catat penolakan DEFINITIF gateway (`ChargeRejectedError`) ke kolom
 * kesehatan `payment_connections`.
 *
 * HANYA boleh dipanggil untuk `ChargeRejectedError` -- pemanggil bertanggung
 * jawab TIDAK memanggil ini untuk kegagalan jaringan/timeout (`Error`
 * biasa), karena gangguan sesaat bukan salah konfigurasi merchant yang
 * perlu diperingatkan (brief bagian 3).
 *
 * Yang disimpan ke `last_charge_error` HANYA `error.providerMessage` --
 * pesan yang SUDAH dirangkai adapter sendiri dari field pesan gateway
 * (mis. `status_message`), TIDAK PERNAH body respons mentah, header, atau
 * kredensial (lihat ChargeRejectedError di ./errors.ts) -- dipotong ke
 * `MAX_ERROR_MESSAGE_LENGTH` karakter sebagai jaga-jaga tambahan.
 *
 * Sama seperti recordChargeSuccess: `admin` harus instance yang sudah ada
 * di route pemanggil, dan kegagalan menulis di sini TIDAK PERNAH dilempar
 * ulang.
 */
export async function recordChargeRejection(
  admin: ReturnType<typeof createAdminClient>,
  merchantId: string,
  rejection: ChargeRejectedError,
): Promise<void> {
  const { error } = await admin
    .from("payment_connections")
    .update({
      last_charge_error: rejection.providerMessage.slice(0, MAX_ERROR_MESSAGE_LENGTH),
      last_charge_error_at: new Date().toISOString(),
    })
    .eq("merchant_id", merchantId)
    .eq("provider", rejection.provider);

  if (error) {
    console.error("[payments/health] gagal mencatat penolakan charge ke payment_connections", {
      merchantId,
      provider: rejection.provider,
      error,
    });
  }
}
