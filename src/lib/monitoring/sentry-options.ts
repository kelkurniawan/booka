import { scrubEvent } from "./scrub";

/**
 * Opsi Sentry yang sama untuk browser dan server.
 *
 * Tanpa NEXT_PUBLIC_SENTRY_DSN, SDK dimatikan sepenuhnya -- development dan
 * deploy yang belum punya akun Sentry tetap jalan normal.
 *
 * Hanya error yang dikirim: tracing dan session replay dimatikan supaya
 * kuota paket gratis cukup dan tidak ada rekaman layar pelanggan.
 */
export function sentryOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: (breadcrumb: { message?: string; data?: Record<string, unknown> }) =>
      scrubEvent({ breadcrumbs: [breadcrumb] }).breadcrumbs![0],
  };
}
