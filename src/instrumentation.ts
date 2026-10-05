import * as Sentry from "@sentry/nextjs";

/**
 * Proxy Next 16 berjalan di runtime Node.js, jadi tidak ada konfigurasi
 * edge terpisah -- seluruh kode server melewati cabang nodejs ini.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { sentryOptions } = await import("@/lib/monitoring/sentry-options");
    Sentry.init(sentryOptions());
  }
}

// Error dari Server Component, Route Handler, Server Action, dan proxy.
export const onRequestError = Sentry.captureRequestError;
