import type { PaymentProvider } from "@/types/database";

/**
 * URL webhook pembayaran Marky untuk satu provider, mis.
 * "https://marky.id/api/webhooks/midtrans". Dipakai header
 * X-Override-Notification Midtrans dan ditampilkan di /dashboard/payments
 * supaya merchant bisa menempelkannya di dashboard gateway (wajib untuk Xendit).
 */
export function paymentWebhookUrl(appUrl: string, provider: PaymentProvider): string {
  return new URL(`/api/webhooks/${provider.toLowerCase()}`, appUrl).toString();
}

/** Gateway hanya bisa mengirim webhook ke URL publik ber-https, bukan localhost. */
export function isDeliverableWebhookUrl(url: string): boolean {
  const { protocol, hostname } = new URL(url);
  return protocol === "https:" && hostname !== "localhost" && hostname !== "127.0.0.1";
}
