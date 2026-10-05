/**
 * URL kanonik situs untuk metadata (OG, sitemap, robots).
 *
 * Sengaja membaca `process.env` langsung, bukan `clientEnv()`/`serverEnv()`:
 * keduanya melempar error saat variabel Supabase kosong, padahal landing
 * page dan metadata harus tetap bisa dirender tanpa konfigurasi lengkap
 * (lihat komentar di src/app/page.tsx).
 */
export function siteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  try {
    return new URL(raw && raw.length > 0 ? raw : "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

/** Ukuran gambar Open Graph standar (rasio 1.91:1). */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;
