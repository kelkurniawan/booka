"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireMerchant } from "@/lib/auth/session";
import { REMINDER_TIERS } from "@/lib/notify/reminder-plan";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import {
  bookingSettingsSchema,
  contactSettingsSchema,
  customerPolicySchema,
  reminderSettingsSchema,
} from "@/lib/validations/merchant-settings";
import type { Database } from "@/types/database";

type MerchantSettingsUpdate = Database["public"]["Tables"]["merchant_settings"]["Update"];

export type BookingSettingsState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function updateBookingSettings(
  _prev: BookingSettingsState,
  formData: FormData,
): Promise<BookingSettingsState> {
  const parsed = bookingSettingsSchema.safeParse({
    allow_pay_on_site: formData.get("allow_pay_on_site"),
    auto_confirm_on_site: formData.get("auto_confirm_on_site"),
    max_active_per_phone: formData.get("max_active_per_phone") ?? "",
    deposit_after_no_show: formData.get("deposit_after_no_show"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(ROUTES.login);

  // Baris dibuat trigger/backfill, authenticated hanya punya UPDATE.
  const { data, error } = await supabase
    .from("merchant_settings")
    .update(parsed.data)
    .eq("merchant_id", user.id)
    .select("merchant_id");

  if (error || !data?.length) {
    return { status: "error", message: "Gagal menyimpan pengaturan. Coba lagi." };
  }

  revalidatePath(ROUTES.settings);
  revalidatePath(ROUTES.services);
  return { status: "success" };
}

async function saveSettings(patch: MerchantSettingsUpdate): Promise<BookingSettingsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(ROUTES.login);

  const { data, error } = await supabase
    .from("merchant_settings")
    .update(patch)
    .eq("merchant_id", user.id)
    .select("merchant_id");
  if (error || !data?.length) {
    return { status: "error", message: "Gagal menyimpan pengaturan. Coba lagi." };
  }
  revalidatePath(ROUTES.settings);
  return { status: "success" };
}

export async function updateCustomerPolicy(
  _prev: BookingSettingsState,
  formData: FormData,
): Promise<BookingSettingsState> {
  const parsed = customerPolicySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  return saveSettings(parsed.data);
}

export async function updateContactSettings(
  _prev: BookingSettingsState,
  formData: FormData,
): Promise<BookingSettingsState> {
  const parsed = contactSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  return saveSettings(parsed.data);
}

export async function updateReminderSettings(
  _prev: BookingSettingsState,
  formData: FormData,
): Promise<BookingSettingsState> {
  const parsed = reminderSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  // Paket di luar REMINDER_TIERS tidak boleh mengubah; kontrol di UI juga nonaktif.
  const { merchant } = await requireMerchant();
  if (!REMINDER_TIERS.includes(merchant.subscription_tier)) {
    return { status: "error", message: "Pengingat untuk pelanggan tersedia di paket Pro dan Studio." };
  }
  return saveSettings(parsed.data);
}
