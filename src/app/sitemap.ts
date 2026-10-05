import type { MetadataRoute } from "next";

import { ROUTES } from "@/lib/routes";
import { siteUrl } from "@/lib/site";
import { createPublicClient } from "@/lib/supabase/server";

/** Daftar merchant cukup diperbarui per jam; mesin pencari tidak lebih cepat dari itu. */
export const revalidate = 3600;

/**
 * Halaman statis + seluruh halaman booking merchant.
 *
 * Dibaca sebagai `anon` lewat `createPublicClient()`, jadi hanya merchant
 * yang lolos policy `merchants_public_read` (sudah punya username) yang
 * masuk -- sitemap tidak pernah bisa memuat lebih dari yang memang publik.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const url = (path: string) => new URL(path, base).toString();

  const entries: MetadataRoute.Sitemap = [
    { url: url(ROUTES.home), changeFrequency: "weekly", priority: 1 },
    { url: url(ROUTES.terms), changeFrequency: "yearly", priority: 0.2 },
    { url: url(ROUTES.privacy), changeFrequency: "yearly", priority: 0.2 },
  ];

  try {
    const { data, error } = await createPublicClient()
      .from("merchants")
      // Hanya `username`: anon tidak punya grant atas `updated_at`, dan
      // memperlebar grant demi `lastModified` tidak sepadan.
      .select("username")
      .not("username", "is", null)
      .limit(45000);

    if (error) throw error;

    for (const merchant of data ?? []) {
      if (!merchant.username) continue;
      entries.push({
        url: url(ROUTES.merchantPage(merchant.username)),
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  } catch (error) {
    // Sitemap tanpa halaman merchant masih lebih baik daripada 500: mesin
    // pencari akan mencoba lagi, dan halaman statis tetap terdaftar.
    console.error("[sitemap] gagal memuat daftar merchant", { error });
  }

  return entries;
}
