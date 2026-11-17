"use server";

import { revalidatePath } from "next/cache";

import { mapBookingError } from "@/lib/booking/errors";
import { requireMerchant } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import {
  capacitySettingsSchema,
  diningLayoutSchema,
  type CapacitySettingsInput,
  type DiningLayoutInput,
} from "@/lib/validations/dining";

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

export async function saveDiningLayout(
  input: DiningLayoutInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = diningLayoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { merchant } = await requireMerchant();
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_dining_layout", {
    p_areas: parsed.data.areas,
    p_tables: parsed.data.tables,
  });

  if (error) {
    if (error.code === "BK062" || error.code === "BK064") {
      return { ok: false, error: mapBookingError(error.code).message };
    }
    if (error.code === "23514" || error.code === "22P02") return { ok: false, error: "Data meja tidak valid." };
    console.error("save_dining_layout gagal", error);
    return { ok: false, error: "Gagal menyimpan denah, coba lagi." };
  }

  revalidatePath(ROUTES.floorPlan);
  revalidatePath(ROUTES.merchantPage(merchant.username));
  return { ok: true };
}
