"use server";

import { revalidatePath } from "next/cache";

import { requireMerchant } from "@/lib/auth/session";
import { clientEnv } from "@/lib/env/client";
import { isScopedMediaPath, PESAN_PATH_TIDAK_VALID } from "@/lib/media/path";
import { MEDIA_BUCKET } from "@/lib/media/url";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { faqListSchema, themeSchema } from "@/lib/validations/theme";

import type { AppearanceFormState } from "./appearance-state";
import { replacedMediaPaths, THEME_MEDIA_KEYS } from "./theme-media";

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
    logo_path: formData.get("logo_path") ?? "",
    cover_path: formData.get("cover_path") ?? "",
    button_style: formData.get("button_style") ?? undefined,
    section_order: formData.get("section_order") ?? undefined,
    hidden_sections: formData.get("hidden_sections") ?? "",
    background_motion: formData.get("background_motion") ?? undefined,
    background_motion_speed: formData.get("background_motion_speed") ?? undefined,
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

  // Path datang dari browser. Constraint merchant_themes_*_path_scoped sudah
  // menahannya di database; dicek juga di sini supaya merchant mendapat
  // kalimat yang bisa dibaca, bukan galat Postgres mentah.
  for (const kunci of THEME_MEDIA_KEYS) {
    const path = parsed.data[kunci];
    if (path !== null && !isScopedMediaPath(path, user.id)) {
      return {
        status: "error",
        message: PESAN_PATH_TIDAK_VALID,
        fieldErrors: { [kunci]: PESAN_PATH_TIDAK_VALID },
      };
    }
  }

  const supabase = await createClient();

  // Baris tersimpan dibaca dulu untuk tahu berkas mana yang kini tidak dirujuk.
  // Kalau bacanya gagal, tidak ada yang dihapus: lebih baik berkas yatim
  // daripada menghapus berkas yang masih dipakai.
  const { data: tersimpan } = await supabase
    .from("merchant_themes")
    .select("background_image_path, logo_path, cover_path")
    .eq("merchant_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("merchant_themes")
    .upsert({ merchant_id: user.id, ...parsed.data }, { onConflict: "merchant_id" });

  if (error) {
    return { status: "error", message: pesanDariError(error) };
  }

  // Dihapus hanya setelah simpan berhasil, supaya halaman publik tidak pernah
  // menunjuk berkas yang sudah hilang. Galat hapus diabaikan: paling buruk
  // berkas yatim tertinggal di bucket.
  const dibuang = replacedMediaPaths(
    {
      background_image_path: tersimpan?.background_image_path ?? null,
      logo_path: tersimpan?.logo_path ?? null,
      cover_path: tersimpan?.cover_path ?? null,
    },
    parsed.data,
  );
  if (dibuang.length > 0) {
    await supabase.storage.from(MEDIA_BUCKET).remove(dibuang);
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

  // Hanya berkas dari bucket kita sendiri, di folder merchant ini sendiri.
  //
  // Diparsing dengan `new URL()`, BUKAN dicari dengan indexOf: pencarian
  // substring meloloskan host pihak ketiga yang menaruh penanda bucket di
  // query string, misalnya
  //   https://pelacak.contoh/beacon?x=/storage/v1/object/public/merchant-media/<uid>/a.webp
  // Nilai itu berakhir sebagai <img src> di halaman publik, sehingga tiap
  // pengunjung mengirim IP dan User-Agent-nya ke host pilihan merchant.
  //
  // Constraint `merchants_avatar_url_scoped` menegakkan aturan yang sama di
  // database, karena Server Action ini bukan satu-satunya jalur tulis --
  // `authenticated` punya grant UPDATE pada kolom ini lewat PostgREST.
  if (avatarUrl !== "") {
    const awalanBucket = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
    let sah = false;

    try {
      const url = new URL(avatarUrl);
      const asal = new URL(clientEnv().supabaseUrl);
      sah =
        url.protocol === "https:" &&
        url.origin === asal.origin &&
        url.search === "" &&
        url.hash === "" &&
        url.pathname.startsWith(awalanBucket) &&
        isScopedMediaPath(
          decodeURIComponent(url.pathname.slice(awalanBucket.length)),
          user.id,
        );
    } catch {
      sah = false;
    }

    if (!sah) {
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
