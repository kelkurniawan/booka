import { z } from "zod";

/**
 * Nama domain merchant: huruf kecil, tanpa protokol/path/port, minimal satu
 * titik. Sama dengan constraint `merchant_domains_format`. Input seperti
 * "https://Booking.Salon.id/" dinormalkan dulu supaya merchant tidak
 * ditolak hanya karena menyalin dari address bar.
 */
export const DOMAIN_PATTERN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

export const domainSchema = z
  .string()
  .transform(normalizeDomain)
  .pipe(z.string().regex(DOMAIN_PATTERN, "Masukkan nama domain yang valid, mis. booking.salonanda.id"));
