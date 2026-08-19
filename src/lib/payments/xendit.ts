import "server-only";

import { timingSafeEqual } from "node:crypto";

import type { PaymentEnvironment } from "@/types/database";

import { ChargeRejectedError } from "./errors";
import type {
  PaymentProviderAdapter,
  QrisCharge,
  QrisChargeParams,
  VerifyWebhookSignatureParams,
} from "./types";

const BASE_URL = "https://api.xendit.co";

/**
 * Xendit TIDAK punya base URL terpisah untuk sandbox/produksi seperti
 * Midtrans — environment ditentukan oleh PREFIKS Secret Key yang dipakai
 * (`xnd_development_...` vs `xnd_production_...`), bukan oleh URL API.
 *
 * Fungsi ini tetap menerima `environment` supaya signature-nya seragam
 * dengan `getMidtransBaseUrl` dan tetap sesuai prinsip di
 * docs/DECISIONS.md bagian 3 (kolom `environment` baris koneksi yang jadi
 * sumber kebenaran) — tapi nilainya sengaja tidak memengaruhi URL yang
 * dikembalikan, karena memang begitu cara kerja API Xendit.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- parameter dipertahankan supaya signature seragam dengan getMidtransBaseUrl(environment).
export function getXenditBaseUrl(environment: PaymentEnvironment): string {
  return BASE_URL;
}

/** Xendit: HTTP Basic, username = Secret Key, password kosong — sama seperti Midtrans. */
function basicAuthHeader(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

type XenditQrCodeResponse = {
  id: string;
  reference_id: string;
  qr_string?: string;
  expires_at?: string;
  error_code?: string;
  message?: string;
};

async function createQrisCharge(params: QrisChargeParams): Promise<QrisCharge> {
  const baseUrl = getXenditBaseUrl(params.environment);

  const response = await fetch(`${baseUrl}/qr_codes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuthHeader(params.credential),
    },
    body: JSON.stringify({
      reference_id: params.orderId,
      type: "DYNAMIC",
      currency: "IDR",
      amount: params.amount,
      channel_code: "QRIS",
    }),
  });

  const body = (await response.json()) as XenditQrCodeResponse;

  // HTTP non-2xx: gateway MENJAWAB dan MENOLAK secara definitif. Beda dengan
  // Midtrans, Xendit tidak punya kuirk "HTTP 200 tapi body-nya gagal" --
  // response.ok sudah cukup jadi satu-satunya sinyal penolakan definitif di
  // sini. Kegagalan jaringan/timeout (fetch() melempar) tidak pernah sampai
  // baris ini, tetap Error biasa. Lihat ChargeRejectedError.
  if (!response.ok) {
    const providerMessage = body.message ?? body.error_code ?? "tidak diketahui";
    throw new ChargeRejectedError(
      "XENDIT",
      `Xendit QR charge gagal (HTTP ${response.status}): ${providerMessage}`,
      providerMessage,
      body.error_code ?? String(response.status),
    );
  }

  return {
    provider: "XENDIT",
    transactionId: body.id,
    orderId: body.reference_id,
    qrString: body.qr_string ?? "",
    expiresAt: body.expires_at ?? null,
  };
}

/**
 * Verifikasi webhook Xendit: bandingkan header `x-callback-token` terhadap
 * token verifikasi webhook TERSENDIRI milik merchant (`webhookToken`) --
 * nilai yang merchant atur sendiri lewat dashboard Xendit (Settings ->
 * Webhooks), bukan turunan dari Secret Key API (`credential`). Kolomnya
 * `private.payment_credentials.webhook_token_encrypted`, lihat
 * supabase/migrations/20260813120100_webhook_token_credential.sql.
 *
 * Kalau merchant belum mengisi token webhook, verifikasi TIDAK PERNAH jatuh
 * balik diam-diam ke Secret Key -- itu yang membuat webhook Xendit asli
 * sebelumnya selalu gagal (401), lihat riwayat di migration di atas. Di sini
 * cukup ditolak dengan alasan yang jelas di log.
 */
function verifyWebhookSignature({
  headers,
  webhookToken,
}: VerifyWebhookSignatureParams): boolean {
  const token = headers["x-callback-token"];
  if (!token) return false;

  if (!webhookToken) {
    console.warn(
      "[xendit] verifyWebhookSignature: merchant belum mengisi Callback Token webhook, ditolak",
    );
    return false;
  }

  const expectedBuf = Buffer.from(webhookToken, "utf8");
  const actualBuf = Buffer.from(token, "utf8");

  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}

export const xenditAdapter: PaymentProviderAdapter = {
  provider: "XENDIT",
  createQrisCharge,
  verifyWebhookSignature,
};
