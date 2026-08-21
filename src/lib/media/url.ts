import { clientEnv } from "@/lib/env/client";

export const MEDIA_BUCKET = "merchant-media";

/**
 * URL publik sebuah berkas di bucket merchant-media.
 *
 * Database menyimpan path, bukan URL penuh, supaya isi tabel tidak ikut basi
 * kalau host Supabase berubah. URL-nya dirakit di sini.
 */
export function publicMediaUrl(path: string): string {
  const base = clientEnv().supabaseUrl.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}
