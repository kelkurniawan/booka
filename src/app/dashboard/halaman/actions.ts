"use server";

import { revalidatePath } from "next/cache";

import { requireMerchant } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { faqListSchema, themeSchema } from "@/lib/validations/theme";

import type { AppearanceFormState } from "./appearance-state";

/**
 * Trigger merchant_themes_enforce_tier melempar P0001 dengan pesan yang sudah
 * berbahasa Indonesia dan sudah menyebut paket Pro, jadi pesannya diteruskan
 * apa adanya ketimbang ditulis ulang di sini dan berisiko berbeda.
 */
function pesanDariError(error: { code?: string; message: string }): string {
  return error.code === "P0001"
    ? error.message
    : "Perubahan gagal disimpan. Coba lagi sebentar lagi.";
}

/**
 * Halaman publik dirender di server, jadi cache-nya harus dibuang eksplisit
 * atau merchant akan mengira perubahannya tidak tersimpan.
 */
function segarkan(username: string | null) {
  if (username) {
    revalidatePath(ROUTES.merchantPage(username));
  }
  revalidatePath(ROUTES.appearance);
}

export async function updateTheme(
  _prevState: AppearanceFormState,
  formData: FormData,
): Promise<AppearanceFormState> {
  const { user, merchant } = await requireMerchant();

  const parsed = themeSchema.safeParse({
    preset: formData.get("preset"),
    accent: formData.get("accent") ?? "",
    background_style: formData.get("background_style"),
    background_color: formData.get("background_color") ?? "",
    background_image_path: formData.get("background_image_path") ?? "",
    background_overlay: formData.get("background_overlay"),
    font_pair: formData.get("font_pair") || null,
    text_scale: formData.get("text_scale"),
    corner_style: formData.get("corner_style") || null,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path[0];
    return {
      status: "error",
      message: issue.message,
      fieldErrors:
        typeof field === "string"
          ? { [field as "accent"]: issue.message }
          : undefined,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("merchant_themes")
    .upsert({ merchant_id: user.id, ...parsed.data }, { onConflict: "merchant_id" });

  if (error) {
    return { status: "error", message: pesanDariError(error) };
  }

  segarkan(merchant.username);
  return { status: "success", message: "Tampilan tersimpan" };
}

/**
 * Menyimpan alamat foto profil setelah berkasnya mendarat di Storage. Berkas
 * lamanya dihapus di klien; kalau baris ini gagal disimpan, klien juga yang
 * menghapus berkas baru (lihat removeMedia di src/lib/media/upload.ts).
 */
export async function updateProfileMedia(
  _prevState: AppearanceFormState,
  formData: FormData,
): Promise<AppearanceFormState> {
  const { user, merchant } = await requireMerchant();

  const avatarUrl = String(formData.get("avatar_url") ?? "").trim();
  if (avatarUrl !== "" && !avatarUrl.startsWith("https://")) {
    return { status: "error", message: "Alamat foto profil tidak valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("merchants")
    .update({ avatar_url: avatarUrl === "" ? null : avatarUrl })
    .eq("id", user.id);

  if (error) {
    return { status: "error", message: "Foto profil gagal disimpan." };
  }

  segarkan(merchant.username);
  return { status: "success", message: "Foto profil tersimpan" };
}

export async function saveFaqs(
  _prevState: AppearanceFormState,
  formData: FormData,
): Promise<AppearanceFormState> {
  const { user, merchant } = await requireMerchant();

  let mentah: unknown;
  try {
    mentah = JSON.parse(String(formData.get("faqs") ?? "[]"));
  } catch {
    return { status: "error", message: "Data FAQ tidak terbaca." };
  }

  const parsed = faqListSchema.safeParse(mentah);
  if (!parsed.success) {
    const pesan = parsed.error.issues[0].message;
    return { status: "error", message: pesan, fieldErrors: { faqs: pesan } };
  }

  const supabase = await createClient();

  // Ganti seluruh daftar, bukan diff per baris: urutannya ikut berubah setiap
  // kali merchant menyusun ulang, dan daftar maksimal sepuluh baris terlalu
  // kecil untuk pantas dibuatkan rekonsiliasi sendiri.
  const { error: hapusError } = await supabase
    .from("merchant_faqs")
    .delete()
    .eq("merchant_id", user.id);

  if (hapusError) {
    return { status: "error", message: "FAQ gagal disimpan." };
  }

  if (parsed.data.length > 0) {
    const { error: simpanError } = await supabase.from("merchant_faqs").insert(
      parsed.data.map((faq, index) => ({
        merchant_id: user.id,
        question: faq.question,
        answer: faq.answer,
        sort_order: index,
      })),
    );

    if (simpanError) {
      return { status: "error", message: pesanDariError(simpanError) };
    }
  }

  segarkan(merchant.username);
  return { status: "success", message: "FAQ tersimpan" };
}
