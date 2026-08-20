import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Query yang dibutuhkan LEBIH DARI SATU komponen async di halaman Ringkasan
 * (`OverviewStats`, `SetupAlerts`). Dibungkus `cache()` dari React supaya
 * dalam SATU render pass, pemanggilan kedua dst mengembalikan promise yang
 * sama alih-alih menembak ulang ke Supabase -- pola yang sama dengan
 * `getSessionUser()`/`requireMerchant()` di `lib/auth/session.ts`. Tanpa ini,
 * memecah page.tsx jadi beberapa komponen Suspense justru menggandakan
 * query yang sama (N+1 tersembunyi) dan membuat halaman LEBIH lambat, bukan
 * lebih cepat.
 *
 * PENTING: `cache()` HANYA berlaku dalam satu render pass RSC -- lihat
 * catatan yang sama di lib/auth/session.ts.
 */

export type QuotaUsage = { used: number; limit: number | null };

/**
 * Dipakai OverviewStats (kartu "Transaksi bulan ini") DAN SetupAlerts (alert
 * kuota habis). Angka diambil dari fungsi yang sama dengan yang dipakai
 * trigger penegak batas, supaya yang ditampilkan di sini persis sama dengan
 * yang benar-benar diberlakukan saat booking masuk.
 */
export const getQuotaUsage = cache(async (): Promise<QuotaUsage> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_quota_usage");
  const row = data?.[0];
  return { used: row?.used ?? 0, limit: row?.quota ?? null };
});

/** Dipakai OverviewStats (kartu "Layanan aktif") DAN SetupAlerts (langkah setup). */
export const getServiceCount = cache(async (merchantId: string): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("services")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId);
  return count ?? 0;
});

export type ActivePaymentConnection = { provider: string; status: string };

/** Dipakai OverviewStats (kartu "Pembayaran") DAN SetupAlerts (langkah setup). */
export const getActivePaymentConnections = cache(
  async (merchantId: string): Promise<ActivePaymentConnection[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("payment_connections")
      .select("provider, status")
      .eq("merchant_id", merchantId)
      .eq("status", "ACTIVE");
    return data ?? [];
  },
);
