import type { PaymentEnvironment, PaymentProvider } from "@/types/database";

/**
 * Parameter membuat charge QRIS baru. `environment` dan `credential` wajib
 * berasal dari baris `payment_connections`/`payment_credentials` milik
 * merchant yang benar (lihat `loadMerchantCredential` di ./credentials.ts) —
 * adapter di sini tidak tahu apa-apa soal merchant, ia hanya memanggil API
 * provider dengan apa yang diberikan.
 */
export type QrisChargeParams = {
  /** ID unik dari sisi Booka (biasanya `bookings.id`) — jadi order_id/reference_id di provider. */
  orderId: string;
  /** Nominal dalam Rupiah, bilangan bulat (tanpa desimal). */
  amount: number;
  /**
   * SANDBOX atau PRODUCTION — WAJIB diambil dari kolom `environment` baris
   * koneksi merchant, bukan dari env var proses. Lihat docs/DECISIONS.md
   * bagian 3: kalau keduanya berbeda, kolom per-baris yang menang.
   */
  environment: PaymentEnvironment;
  /** Server Key (Midtrans) / Secret Key (Xendit) merchant, plaintext, sudah didekripsi pemanggil. */
  credential: string;
};

/** Hasil charge QRIS, sudah dinormalisasi lintas provider. */
export type QrisCharge = {
  provider: PaymentProvider;
  /** ID transaksi dari sisi provider. */
  transactionId: string;
  orderId: string;
  /** String QR mentah — dirender jadi gambar QR di sisi klien (Task 7/8). */
  qrString: string;
  /** Waktu QR kedaluwarsa kalau providernya memberi tahu. */
  expiresAt: string | null;
};

/**
 * Parameter memverifikasi signature webhook. `credential` wajib diberikan
 * eksplisit oleh pemanggil (bukan dibaca ulang oleh adapter dari DB) supaya
 * adapter tetap murni: tidak menyentuh Supabase sama sekali.
 */
export type VerifyWebhookSignatureParams = {
  /** Body webhook, sudah di-parse JSON. */
  body: Record<string, unknown>;
  /** Header request webhook. Key TIDAK case-sensitive secara jaminan — pemanggil sebaiknya kirim lower-case. */
  headers: Record<string, string>;
  /** Server Key / token verifikasi webhook merchant, plaintext. */
  credential: string;
};

export interface PaymentProviderAdapter {
  readonly provider: PaymentProvider;
  createQrisCharge(params: QrisChargeParams): Promise<QrisCharge>;
  verifyWebhookSignature(params: VerifyWebhookSignatureParams): boolean;
}
