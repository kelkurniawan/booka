"use client";

import { createClient } from "@/lib/supabase/client";

import { MEDIA_BUCKET } from "./url";

/**
 * Unggahan berjalan dari browser LANGSUNG ke Storage memakai klien bersesi,
 * jadi yang menjaga adalah policy RLS "folder pertama harus sama dengan
 * auth.uid()", bukan kode route handler yang bisa lupa memeriksa.
 */
export async function uploadMedia(
  path: string,
  blob: Blob,
  contentType: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, blob, { contentType, upsert: false });

  if (error) {
    throw new Error(`Gagal mengunggah berkas: ${error.message}`);
  }
}

/**
 * Menghapus berkas. Dipakai dua kali: saat merchant mengganti berkas lama, dan
 * saat penyimpanan baris database gagal setelah berkas terlanjur mendarat
 * (misalnya trigger menolak video milik merchant STARTER) -- tanpa ini, bucket
 * perlahan terisi berkas yang tidak dirujuk apa pun.
 */
export async function removeMedia(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const supabase = createClient();
  await supabase.storage.from(MEDIA_BUCKET).remove(paths);
}

/** Nama berkas acak; menjaga URL lama tidak tertimpa di cache CDN. */
export function mediaFileName(prefix: string, ext: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
}

/**
 * Mengubah URL publik kembali menjadi path di bucket, atau null kalau URL itu
 * bukan milik bucket kita.
 *
 * `merchants.avatar_url` menyimpan URL penuh dan bisa berisi tautan Google dari
 * proses signup, bukan hanya berkas kita. Penghapusan berkas lama hanya boleh
 * menyentuh yang memang milik kita.
 */
export function mediaPathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const penanda = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
  const posisi = url.indexOf(penanda);
  return posisi === -1 ? null : url.slice(posisi + penanda.length);
}
