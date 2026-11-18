import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

import { HEADER_RULES } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // Menghasilkan .next/standalone berisi server + dependensi seperlunya,
  // supaya image produksi tidak perlu membawa node_modules lengkap.
  output: "standalone",

  // Menyembunyikan `x-powered-by: Next.js`, yang tidak berguna bagi pengunjung
  // dan hanya memberi tahu penyerang versi kerangka kerja yang dipakai.
  poweredByHeader: false,

  // Binary ffmpeg tidak bisa dibundel; harus dimuat dari node_modules.
  serverExternalPackages: ["ffmpeg-static"],
  // output: "standalone" hanya membawa berkas yang terlacak, jadi binary disebut eksplisit.
  outputFileTracingIncludes: { "/api/staff/clip": ["./node_modules/ffmpeg-static/ffmpeg"] },

  async headers() {
    return HEADER_RULES;
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
