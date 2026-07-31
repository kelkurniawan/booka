import "server-only";

import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PaymentEnvironment, PaymentProvider } from "@/types/database";

export type MerchantCredential = {
  environment: PaymentEnvironment;
  /** Server Key / access token, plaintext — SUDAH didekripsi. Jangan pernah dikirim ke browser. */
  credential: string;
};

/**
 * Membaca kredensial (Server Key / access token) milik merchant untuk satu
 * provider, sudah didekripsi.
 *
 * `merchantId` WAJIB berasal dari `getUser()` di pemanggil — jangan pernah
 * dari input form/query param (lihat AGENTS.md). Fungsi ini sendiri tidak
 * menambah jaring pengaman lagi di sisi TypeScript untuk itu; yang menutup
 * celahnya adalah RPC `get_payment_credential` (SECURITY DEFINER) yang
 * memverifikasi kepemilikan connection_id lewat merchant_id + provider
 * sendiri di sisi database — lihat
 * supabase/migrations/20260730000600_payment_credential_rpc.sql.
 *
 * Mengembalikan `null` kalau merchant belum menghubungkan provider ini atau
 * koneksinya tidak berstatus ACTIVE (EXPIRED/REVOKED tidak boleh dipakai
 * charge lagi).
 */
export async function loadMerchantCredential(
  merchantId: string,
  provider: PaymentProvider,
): Promise<MerchantCredential | null> {
  const admin = createAdminClient();

  const { data: connection } = await admin
    .from("payment_connections")
    .select("environment, status")
    .eq("merchant_id", merchantId)
    .eq("provider", provider)
    .maybeSingle();

  if (!connection || connection.status !== "ACTIVE") return null;

  const { data: rows, error } = await admin.rpc("get_payment_credential", {
    p_merchant_id: merchantId,
    p_provider: provider,
  });

  const row = rows?.[0];
  if (error || !row) return null;

  const credential = decryptSecret(row.access_token_encrypted, {
    merchantId,
    provider,
    field: "access_token",
  });

  return { environment: connection.environment, credential };
}

/**
 * Menyimpan (atau menimpa) kredensial merchant untuk satu provider.
 *
 * Baris `public.payment_connections` untuk merchant+provider ini WAJIB
 * sudah ada sebelum memanggil fungsi ini — RPC `upsert_payment_credential`
 * menolak (P0003) kalau belum. Pemanggil (server action manual key /
 * OAuth callback) bertanggung jawab membuat/memastikan baris koneksinya
 * lebih dulu.
 *
 * `accessToken`/`refreshToken` di sini PLAINTEXT — dienkripsi di dalam
 * fungsi ini sebelum dikirim ke database, jadi pemanggil tidak perlu (dan
 * tidak boleh) mengenkripsi sendiri.
 */
export async function storeMerchantCredential(params: {
  merchantId: string;
  provider: PaymentProvider;
  accessToken: string;
  refreshToken?: string | null;
}): Promise<void> {
  const admin = createAdminClient();

  const accessTokenEncrypted = encryptSecret(params.accessToken, {
    merchantId: params.merchantId,
    provider: params.provider,
    field: "access_token",
  });

  const refreshTokenEncrypted = params.refreshToken
    ? encryptSecret(params.refreshToken, {
        merchantId: params.merchantId,
        provider: params.provider,
        field: "refresh_token",
      })
    : null;

  const { error } = await admin.rpc("upsert_payment_credential", {
    p_merchant_id: params.merchantId,
    p_provider: params.provider,
    p_access_token_encrypted: accessTokenEncrypted,
    p_refresh_token_encrypted: refreshTokenEncrypted,
  });

  if (error) {
    throw new Error("Gagal menyimpan kredensial payment gateway.");
  }
}
