"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";

import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { settingsSchema } from "@/lib/validations/merchant";

import type { SettingsFormState } from "./settings-state";

function toFieldErrors(error: z.ZodError): SettingsFormState {
  const fieldErrors: SettingsFormState["fieldErrors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      key === "full_name" ||
      key === "bio" ||
      key === "whatsapp_number" ||
      key === "username"
    ) {
      fieldErrors[key] ??= issue.message;
    }
  }
  return { status: "error", message: "Periksa kembali isian Anda", fieldErrors };
}

/**
 * Simpan seluruh profil (nama, bio, WhatsApp, username) sekaligus.
 *
 * `subscription_tier` dan `active_payment_provider` sengaja TIDAK ada di
 * payload -- keduanya tidak di-GRANT untuk role `authenticated` (lihat
 * supabase/migrations/20260729000100_init_schema.sql), jadi mencoba
 * menulisnya hanya akan ditolak Postgres.
 */
export async function updateSettings(
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = settingsSchema.safeParse({
    full_name: formData.get("full_name"),
    bio: formData.get("bio") ?? "",
    whatsapp_number: formData.get("whatsapp_number"),
    username: formData.get("username"),
  });
  if (!parsed.success) return toFieldErrors(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  const { error } = await supabase
    .from("merchants")
    .update({
      full_name: parsed.data.full_name,
      bio: parsed.data.bio,
      whatsapp_number: parsed.data.whatsapp_number,
      username: parsed.data.username,
    })
    // RLS sudah membatasi ke merchant pemilik, tapi filter eksplisit ini
    // membuat maksudnya jelas terbaca di kode dan bukan hanya bergantung
    // pada policy database.
    .eq("id", user.id);

  if (error) {
    // 23505 unique_violation -- username sudah dipakai merchant lain.
    if (error.code === "23505") {
      return {
        status: "error",
        message: "Username sudah dipakai orang lain. Coba yang lain.",
        fieldErrors: { username: "Username sudah dipakai" },
      };
    }
    // 23514 check_violation -- dipakai trigger reject_reserved_username
    // (dan constraint format lain kalau validasi Zod di atas kebetulan lolos
    // padahal database menolak).
    if (error.code === "23514") {
      return {
        status: "error",
        message: "Username tidak dapat digunakan.",
        fieldErrors: { username: "Username ini dipakai sistem" },
      };
    }
    return { status: "error", message: "Gagal menyimpan perubahan. Coba lagi." };
  }

  revalidatePath(ROUTES.settings);
  revalidatePath(ROUTES.dashboard);
  return { status: "success" };
}
