import { findBusinessType } from "@/lib/business/catalog";
import type { createClient } from "@/lib/supabase/server";
import type { CompleteOnboardingValues } from "@/lib/validations/onboarding";

import type { OnboardingState } from "./actions";
import { hoursToRows } from "./wizard-state";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Satu RPC `complete_onboarding` (satu transaksi): identitas, profil, layanan,
 * jam kerja, dan untuk layanan sewa lapangan juga dua lapangan contoh beserta
 * tautannya. Kegagalan di mana pun membatalkan semuanya, jadi tidak pernah ada
 * layanan sewa tanpa lapangan. Mengembalikan null bila sukses, atau state galat
 * yang sudah dipetakan (tidak ada teks mentah Postgres yang lolos).
 */
export async function saveOnboarding(
  supabase: Supabase,
  data: CompleteOnboardingValues,
): Promise<OnboardingState | null> {
  // Sport diambil dari katalog server, bukan dari payload klien.
  const court = data.court;
  const sport = court && data.business_type_slug
    ? (findBusinessType(data.business_type_slug)?.sport ?? null)
    : null;

  const { error } = await supabase.rpc("complete_onboarding", {
    p_full_name: data.full_name,
    p_username: data.username,
    p_whatsapp_number: data.whatsapp_number,
    p_business_category: data.business_category,
    p_business_type_slug: data.business_type_slug,
    p_service_name: data.service.name,
    p_service_duration_minutes: data.service.duration_minutes,
    p_service_price: data.service.price,
    p_availability: hoursToRows({
      days: data.hours.days,
      startTime: data.hours.start_time,
      endTime: data.hours.end_time,
    }),
    ...(court && sport
      ? {
          p_court_sport: sport,
          p_court_unit: court.unitMinutes,
          p_court_min: court.minMinutes,
          p_court_max: court.maxMinutes,
        }
      : {}),
  });

  if (error) {
    // 23505 unique_violation -- dua merchant mengirim username sama bersamaan;
    // validasi optimistis di form bisa kalah cepat dari constraint.
    if (error.code === "23505") {
      return {
        status: "error",
        message: "Username baru saja diambil orang lain. Coba yang lain.",
        fieldErrors: { username: "Username sudah dipakai" },
      };
    }
    // 23514 check_violation dipakai trigger reject_reserved_username.
    if (error.code === "23514") {
      return {
        status: "error",
        message: "Username tidak dapat digunakan.",
        fieldErrors: { username: "Username ini dipakai sistem" },
      };
    }
    // 23P01 exclusion_violation -- jam kerja tumpang tindih.
    if (error.code === "23P01") {
      return {
        status: "error",
        message: "Jam kerja yang dipilih tumpang tindih. Periksa kembali.",
        fieldErrors: { hours: "Jam kerja tumpang tindih" },
      };
    }
    // 22023 data sewa tidak valid (CHECK services_court_* lewat save_court_service).
    if (error.code === "22023") {
      return {
        status: "error",
        message: "Pengaturan sewa lapangan tidak valid. Periksa kembali.",
        fieldErrors: { service: "Pengaturan sewa tidak valid" },
      };
    }
    // 42501 sesi/kepemilikan ditolak di dalam RPC.
    if (error.code === "42501") {
      return { status: "error", message: "Sesi berakhir. Muat ulang halaman lalu masuk lagi." };
    }
    console.error("[onboarding] complete_onboarding gagal", error);
    return { status: "error", message: "Gagal menyimpan data. Coba lagi." };
  }
  return null;
}
