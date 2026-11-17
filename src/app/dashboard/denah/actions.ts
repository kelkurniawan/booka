"use server";

import { revalidatePath } from "next/cache";

import { requireMerchant } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { capacitySettingsSchema, type CapacitySettingsInput } from "@/lib/validations/dining";

export async function saveCapacitySettings(
  input: CapacitySettingsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = capacitySettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;

  const { user, merchant } = await requireMerchant();
  const supabase = await createClient();

  // seats_per_slot hanya bermakna di mode AREA; mode lain mengosongkannya.
  const { data, error } = await supabase
    .from("merchant_settings")
    .update({
      table_mode: v.tableMode,
      seats_per_slot: v.tableMode === "AREA" ? v.seatsPerSlot : null,
      table_hold_minutes: v.tableHoldMinutes,
      auto_join_tables: v.tableMode === "TABLE" ? v.autoJoinTables : false,
    })
    .eq("merchant_id", user.id)
    .select("merchant_id");

  if (error || !data?.length) return { ok: false, error: "Gagal menyimpan pengaturan. Coba lagi." };

  revalidatePath(ROUTES.floorPlan);
  revalidatePath(ROUTES.merchantPage(merchant.username));
  return { ok: true };
}
