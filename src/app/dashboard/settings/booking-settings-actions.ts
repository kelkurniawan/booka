"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { bookingSettingsSchema } from "@/lib/validations/merchant-settings";

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
