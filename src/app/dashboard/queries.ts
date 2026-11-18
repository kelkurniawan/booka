import "server-only";

import { cache } from "react";

import { getSessionUser } from "@/lib/auth/session";
import type { OnboardingFacts } from "@/lib/guide/guide";
import { createClient } from "@/lib/supabase/server";
import type { GuidePageKey, ManualStepKey } from "@/types/database";

/**
 * Query yang dibutuhkan LEBIH DARI SATU komponen async di halaman Ringkasan
 * (mis. kuota dan progres panduan). Dibungkus `cache()` dari React supaya
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

/** True bila merchant punya layanan sewa lapangan atau lapangan (menampilkan menu Jadwal lapangan). */
export const hasCourts = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return false;
  const [services, courts] = await Promise.all([
    supabase.from("services").select("id", { count: "exact", head: true }).eq("merchant_id", user.id).not("court_unit_minutes", "is", null),
    supabase.from("courts").select("id", { count: "exact", head: true }).eq("merchant_id", user.id),
  ]);
  if (services.error || courts.error) {
    console.error("hasCourts gagal", { merchantId: user.id, error: services.error ?? courts.error });
    return false;
  }
  return (services.count ?? 0) > 0 || (courts.count ?? 0) > 0;
});

export type OnboardingState = {
  facts: OnboardingFacts;
  stepsCompleted: ManualStepKey[];
  toursSeen: GuidePageKey[];
  checklistDismissedAt: string | null;
};

/**
 * Fakta kesiapan + progres panduan dalam satu RPC. `null` bila gagal: layout
 * menganggap semua halaman sudah dilihat dan checklist menampilkan pesan netral.
 */
export const getOnboardingState = cache(async (): Promise<OnboardingState | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("onboarding_state");
  const row = data?.[0];
  if (error || !row) {
    const user = await getSessionUser(); // cache(): tanpa round-trip tambahan
    console.error("onboarding_state gagal", { merchantId: user?.id, error });
    return null;
  }
  return {
    facts: {
      hasService: row.has_service,
      hasHours: row.has_hours,
      hasActivePayment: row.has_active_payment,
      needsOnlinePayment: row.needs_online_payment,
      pageCustomized: row.page_customized,
      hasOnlineBooking: row.has_online_booking,
    },
    stepsCompleted: row.steps_completed,
    toursSeen: row.tours_seen,
    checklistDismissedAt: row.checklist_dismissed_at,
  };
});

/**
 * Jumlah booking yang perlu tindakan (badge navigasi). `null` bila RPC gagal:
 * badge disembunyikan, halaman tetap jalan.
 */
export const getTabCounts = cache(
  async (): Promise<{ action: number; upcoming: number } | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("dashboard_tab_counts");
    if (error || !data?.[0]) {
      const user = await getSessionUser(); // cache(): tanpa round-trip tambahan
      console.error("dashboard_tab_counts gagal", { merchantId: user?.id, error });
      return null;
    }
    return { action: data[0].action_count, upcoming: data[0].upcoming_count };
  },
);
