import { requireMerchant } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { ProfileNudgeDialog } from "./profile-nudge-dialog";

/**
 * Tawaran kuesioner opsional bagi merchant yang belum pernah menjawab atau
 * melewatinya. Terpisah dari `SetupAlerts` DENGAN SENGAJA -- `SetupAlerts`
 * mengurus kesiapan halaman booking menerima pesanan, kartu ini mengurus
 * pengenalan usaha. Jangan digabungkan.
 *
 * Mencakup dua populasi:
 * 1. Merchant yang baris `merchant_profiles`-nya ada tapi blok opsionalnya
 *    belum pernah dijawab maupun dilewati (`optional_answered_at` dan
 *    `optional_skipped_at` keduanya null).
 * 2. Merchant lama dari SEBELUM kuesioner ada, yang tidak punya baris sama
 *    sekali -- baris itu sebelumnya hanya pernah dibuat lewat RPC
 *    `complete_onboarding`.
 *
 * `business_category` NULLABLE sejak migration
 * 20260830171027_nullable_business_category.sql: dismissal ("Nanti saja")
 * kini dicatat sebagai baris dengan `business_category = NULL` (bukan
 * sentinel `LAINNYA`), supaya analitik demografi usaha bisa membedakan
 * "menolak menjawab" dari kategori LAINNYA yang sungguh dipilih -- lihat
 * header migration itu. `missingProfile` yang dikirim ke `ProfileNudgeDialog`
 * karena itu bukan lagi "baris tidak ada" semata, tapi "kategori belum
 * terisi" -- baris tidak ada ATAU baris ada dengan `business_category` NULL.
 * `ProfileNudgeDialog` menangani populasi itu lewat layar kategori tambahan
 * + `saveProfileFromDashboard`.
 */
export async function ProfileNudge() {
  const { user } = await requireMerchant();
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("merchant_profiles")
    .select("business_category, optional_answered_at, optional_skipped_at")
    .eq("merchant_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[dashboard/profile-nudge] gagal memuat profil", {
      merchantId: user.id,
      error,
    });
    return null;
  }

  const sudahDitawari =
    profile !== null &&
    (profile.optional_answered_at !== null || profile.optional_skipped_at !== null);

  if (sudahDitawari) return null;

  const missingProfile = profile === null || profile.business_category === null;

  return <ProfileNudgeDialog missingProfile={missingProfile} />;
}
