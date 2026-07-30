import "server-only";

import { timingSafeEqual } from "node:crypto";

import type { PaymentEnvironment } from "@/types/database";

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

  if (!response.ok) {
    throw new Error(
      `Xendit QR charge gagal (HTTP ${response.status}): ${body.message ?? body.error_code ?? "tidak diketahui"}`,
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
 * token verifikasi webhook merchant.
 *
 * Skema kredensial saat ini hanya menyimpan satu secret per koneksi
 * (`access_token_encrypted`), jadi untuk sementara token verifikasi webhook
 * dianggap sama dengan Secret Key yang dipakai untuk charge. Ini
 * penyederhanaan yang disengaja untuk MVP — kalau ternyata merchant perlu
 * token verifikasi webhook yang berbeda dari Secret Key, Task 9 (webhook
 * handler) yang akan menambah kolom/field kredensial terpisah.
 */
function verifyWebhookSignature({ headers, credential }: VerifyWebhookSignatureParams): boolean {
  const token = headers["x-callback-token"];
  if (!token) return false;

  const expectedBuf = Buffer.from(credential, "utf8");
  const actualBuf = Buffer.from(token, "utf8");

  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}

export const xenditAdapter: PaymentProviderAdapter = {
  provider: "XENDIT",
  createQrisCharge,
  verifyWebhookSignature,
};
