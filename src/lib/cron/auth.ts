import { timingSafeEqual } from "node:crypto";

/**
 * Memverifikasi header `Authorization: Bearer <token>` sebuah cron request
 * terhadap `CRON_SECRET`.
 *
 * FAIL CLOSED: kalau `secret` kosong/undefined (mis. `CRON_SECRET` belum
 * diisi di environment), SELALU mengembalikan false — endpoint cron tidak
 * boleh berjalan tanpa auth yang dikonfigurasi. Perbandingan token dibuat
 * tahan timing attack, sama seperti pengecekan `state` OAuth di
 * src/app/api/payments/[provider]/callback/route.ts.
 */
export function isAuthorizedCron(
  authorizationHeader: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  if (!authorizationHeader) return false;

  const prefix = "Bearer ";
  if (!authorizationHeader.startsWith(prefix)) return false;
  const token = authorizationHeader.slice(prefix.length);

  const tokenBuf = Buffer.from(token, "utf8");
  const secretBuf = Buffer.from(secret, "utf8");
  if (tokenBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(tokenBuf, secretBuf);
}
