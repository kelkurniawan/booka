import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, SubscriptionTier } from "@/types/database";

import type { StaffSchedule } from "./slots";

export type PublicStaff = StaffSchedule & { name: string };

/**
 * Staf aktif merchant beserta jam kerjanya, dibaca sebagai `anon`.
 *
 * Mengembalikan daftar KOSONG untuk paket selain Studio -- aturan yang sama
 * dengan create_booking, yang mengabaikan staf merchant yang turun paket.
 * Dengan begitu halaman publik, /api/slots, dan database tidak pernah
 * berbeda pendapat soal apakah merchant ini memakai staf.
 */
export async function loadPublicStaff(
  supabase: SupabaseClient<Database>,
  merchantId: string,
  tier: SubscriptionTier,
): Promise<PublicStaff[]> {
  if (tier !== "STUDIO") return [];

  const [staffResult, hoursResult] = await Promise.all([
    supabase
      .from("staff")
      .select("id, name")
      .eq("merchant_id", merchantId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("staff_availability")
      .select("staff_id, day_of_week, start_time, end_time")
      .eq("merchant_id", merchantId),
  ]);

  if (staffResult.error) throw staffResult.error;
  if (hoursResult.error) throw hoursResult.error;

  return (staffResult.data ?? []).map((member) => ({
    id: member.id,
    name: member.name,
    availability: (hoursResult.data ?? [])
      .filter((row) => row.staff_id === member.id)
      .map(({ day_of_week, start_time, end_time }) => ({ day_of_week, start_time, end_time })),
  }));
}
