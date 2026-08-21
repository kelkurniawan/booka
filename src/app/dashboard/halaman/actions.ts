"use server";

import { revalidatePath } from "next/cache";

import { requireMerchant } from "@/lib/auth/session";
import { isScopedMediaPath, PESAN_PATH_TIDAK_VALID } from "@/lib/media/path";
import { MEDIA_BUCKET } from "@/lib/media/url";
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

  // Path datang dari browser. Constraint merchant_themes_background_path_scoped
  // sudah menahannya di database; dicek juga di sini supaya merchant mendapat
  // kalimat yang bisa dibaca, bukan galat Postgres mentah.
  const pathLatar = parsed.data.background_image_path;
  if (pathLatar !== null && !isScopedMediaPath(pathLatar, user.id)) {
    return {
      status: "error",
      message: PESAN_PATH_TIDAK_VALID,
      fieldErrors: { background_image_path: PESAN_PATH_TIDAK_VALID },
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

  // Hanya berkas dari bucket kita sendiri. Sebelumnya URL https apa pun
  // diterima, yang berarti merchant bisa menempelkan pelacak pihak ketiga di
  // halaman yang berjalan di domain kita. Foto lama dari Google OAuth tetap
  // aman: validasi ini hanya berlaku saat nilainya DITULIS, bukan saat dibaca.
  if (avatarUrl !== "") {
    const awalanBucket = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
    const posisi = avatarUrl.indexOf(awalanBucket);
    if (
      !avatarUrl.startsWith("https://") ||
      posisi === -1 ||
      !isScopedMediaPath(avatarUrl.slice(posisi + awalanBucket.length), user.id)
    ) {
      return { status: "error", message: PESAN_PATH_TIDAK_VALID };
    }
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
  const { merchant } = await requireMerchant();

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
  //
  // Lewat RPC, BUKAN delete lalu insert dari sini. Sebagai dua panggilan
  // terpisah, insert yang ditolak meninggalkan penghapusan yang sudah commit --
  // merchant kehilangan seluruh FAQ-nya justru saat menyimpan. Satu pemanggilan
  // fungsi adalah satu statement, jadi keduanya berhasil bersama atau gagal
  // bersama.
  const { error } = await supabase.rpc("replace_merchant_faqs", {
    p_faqs: parsed.data,
  });

  if (error) {
    return { status: "error", message: pesanDariError(error) };
  }

  segarkan(merchant.username);
  return { status: "success", message: "FAQ tersimpan" };
}
