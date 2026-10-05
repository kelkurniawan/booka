import type { MetadataRoute } from "next";

import { ROUTES } from "@/lib/routes";
import { siteUrl } from "@/lib/site";

/**
 * `/pesanan/` WAJIB tertutup: token akses booking ada di path-nya (lihat
 * docs/DECISIONS.md #18), jadi halaman itu tidak boleh dirayapi walau sudah
 * memasang `noindex` sendiri. Dashboard dan rute auth tidak berguna bagi
 * mesin pencari dan hanya membuang anggaran perayapan.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/pesanan/",
        `${ROUTES.dashboard}/`,
        ROUTES.dashboard,
        ROUTES.onboarding,
        ROUTES.resetPassword,
      ],
    },
    sitemap: new URL("/sitemap.xml", base).toString(),
  };
}
