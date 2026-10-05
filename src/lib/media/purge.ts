import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

const BUCKET = "merchant-media";
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
  merchantId: string,
): Promise<string[]> {
  const files: string[] = [];
  const folders = [merchantId];

  while (folders.length > 0) {
    const folder = folders.pop()!;
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await admin.storage
        .from(BUCKET)
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
  const files = await listMerchantFiles(admin, merchantId);
  for (let i = 0; i < files.length; i += PAGE_SIZE) {
    const { error } = await admin.storage.from(BUCKET).remove(files.slice(i, i + PAGE_SIZE));
    if (error) throw error;
  }
  return files.length;
}
