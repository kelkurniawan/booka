import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

/**
 * Header keamanan yang berlaku untuk SELURUH respons.
 *
 * HSTS sudah dipasang Vercel sendiri, jadi tidak diulang di sini.
 *
 * `frame-ancestors 'none'` adalah yang paling penting: tanpa itu, dashboard
 * merchant bisa dibingkai situs lain dan merchant yang sedang login bisa
 * ditipu mengklik tindakan merusak (clickjacking). X-Frame-Options ikut
 * dipasang untuk peramban lama yang belum mengenal frame-ancestors.
 *
 * CSP-nya sengaja TIDAK memasang `script-src` yang ketat. Next.js menyuntikkan
 * skrip inline untuk hidrasi, sehingga kebijakan ketat menuntut nonce per
 * request lewat middleware -- perubahan berisiko yang layak dikerjakan
 * tersendiri, bukan diselipkan. Yang dipasang di sini menutup pembingkaian,
 * pengiriman form ke domain lain, dan pemuatan objek/plugin.
 */
const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: [
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  // Mencegah peramban menebak-nebak tipe berkas. Relevan untuk bucket
  // merchant-media yang isinya diunggah merchant.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Halaman /pesanan/{token} menaruh token di path URL. Ini memastikan path
  // itu tidak pernah ikut terkirim ke domain lain lewat header Referer,
  // tidak bergantung pada nilai bawaan peramban.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  // Menghasilkan .next/standalone berisi server + dependensi seperlunya,
  // supaya image produksi tidak perlu membawa node_modules lengkap.
  output: "standalone",

  // Menyembunyikan `x-powered-by: Next.js`, yang tidak berguna bagi pengunjung
  // dan hanya memberi tahu penyerang versi kerangka kerja yang dipakai.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

/**
 * Source map hanya diunggah bila SENTRY_AUTH_TOKEN ada (build Vercel yang
 * sudah dikonfigurasi). Tanpa token, build tetap jalan dan Sentry tetap
 * menerima error -- hanya stack trace-nya belum ter-unminify.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
