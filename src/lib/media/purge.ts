import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { CLIP_UPLOAD_BUCKET } from "./staff-paths";
import { MEDIA_BUCKET } from "./url";

const BUCKETS = [MEDIA_BUCKET, CLIP_UPLOAD_BUCKET];
/** Batas `list()` Storage per halaman. */
const PAGE_SIZE = 100;

/**
 * Mengumpulkan path SEMUA berkas di bawah folder `{merchantId}/`, rekursif.
 *
 * `storage.list()` tidak rekursif: entri tanpa `id` adalah folder dan harus
 * ditelusuri sendiri. Berangkat dari folder, bukan dari kolom path di tabel,
 * supaya berkas yatim (unggahan yang tidak pernah tersimpan ke baris mana
 * pun) ikut terhapus.
 */
async function listMerchantFiles(
  admin: SupabaseClient<Database>,
  bucket: string,
  merchantId: string,
): Promise<string[]> {
  const files: string[] = [];
  const folders = [merchantId];

  while (folders.length > 0) {
    const folder = folders.pop()!;
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(folder, { limit: PAGE_SIZE, offset });
      if (error) throw error;
      for (const entry of data ?? []) {
        const path = `${folder}/${entry.name}`;
        if (entry.id === null) folders.push(path);
        else files.push(path);
      }
      if (!data || data.length < PAGE_SIZE) break;
    }
  }

  return files;
}

/**
 * Menghapus seluruh berkas milik satu merchant dari bucket.
 *
 * WAJIB dipanggil dengan klien admin dan `merchantId` yang berasal dari
 * `getUser()`, bukan dari input: tidak ada RLS yang menjaga di sini, jadi
 * awalan folder inilah satu-satunya batas.
 */
export async function purgeMerchantMedia(
  admin: SupabaseClient<Database>,
  merchantId: string,
): Promise<number> {
  let total = 0;
  for (const bucket of BUCKETS) {
    const files = await listMerchantFiles(admin, bucket, merchantId);
    for (let i = 0; i < files.length; i += PAGE_SIZE) {
      const { error } = await admin.storage.from(bucket).remove(files.slice(i, i + PAGE_SIZE));
      if (error) throw error;
    }
    total += files.length;
  }
  return total;
}
