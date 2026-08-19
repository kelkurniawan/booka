import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import type { PaymentEnvironment } from "@/types/database";

import type {
  PaymentProviderAdapter,
  QrisCharge,
  QrisChargeParams,
  VerifyWebhookSignatureParams,
} from "./types";

const BASE_URL_SANDBOX = "https://api.sandbox.midtrans.com/v2";
const BASE_URL_PRODUCTION = "https://api.midtrans.com/v2";

/**
 * Base URL Core API Midtrans berdasarkan `environment` BARIS koneksi
 * merchant — bukan `MIDTRANS_ENV` di env var proses. Lihat
 * docs/DECISIONS.md bagian 3: env var proses hanya konfigurasi level-proses;
 * kolom `environment` per merchant yang menang kalau keduanya berbeda.
 */
export function getMidtransBaseUrl(environment: PaymentEnvironment): string {
  return environment === "PRODUCTION" ? BASE_URL_PRODUCTION : BASE_URL_SANDBOX;
}

/** Midtrans: HTTP Basic, username = Server Key, password kosong. */
function basicAuthHeader(serverKey: string): string {
  return `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;
}

type MidtransChargeResponse = {
  status_code?: string;
  status_message?: string;
  transaction_id: string;
  order_id: string;
  qr_string?: string;
  expiry_time?: string;
  actions?: { name: string; method: string; url: string }[];
};

async function createQrisCharge(params: QrisChargeParams): Promise<QrisCharge> {
  const baseUrl = getMidtransBaseUrl(params.environment);

  const response = await fetch(`${baseUrl}/charge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: basicAuthHeader(params.credential),
    },
    body: JSON.stringify({
      payment_type: "qris",
      transaction_details: {
        order_id: params.orderId,
        gross_amount: params.amount,
      },
    }),
  });

  const body = (await response.json()) as MidtransChargeResponse;

  if (!response.ok) {
    throw new Error(
      `Midtrans charge gagal (HTTP ${response.status}): ${body.status_message ?? "tidak diketahui"}`,
    );
  }

  // Midtrans MEMBALAS HTTP 200 walau charge-nya gagal -- status sebenarnya
  // ada di `status_code` dalam body. Contoh nyata yang sempat lolos ke
  // produksi: `{"status_code":"402","status_message":"Payment channel is not
  // activated."}` dengan HTTP 200. Karena dulu hanya `response.ok` yang
  // diperiksa, kegagalan itu dianggap sukses, `qrString` jatuh ke string
  // kosong, dan booking tersimpan dalam keadaan MUSTAHIL DIBAYAR -- tanpa
  // memicu pembatalan kompensasi di POST /api/bookings, karena tidak ada
  // yang dilempar.
  //
  // 201 = transaksi dibuat, menunggu pembayaran (jalur normal QRIS).
  // 200 = sukses langsung. Selain itu error, apa pun kode HTTP-nya.
  const statusCode = body.status_code ?? "";
  if (statusCode !== "201" && statusCode !== "200") {
    throw new Error(
      `Midtrans charge gagal (status_code ${statusCode || "kosong"}): ` +
        `${body.status_message ?? "tidak diketahui"}`,
    );
  }

  const qrAction = body.actions?.find((action) => action.name === "generate-qr-code");
  const qrString = body.qr_string ?? qrAction?.url ?? "";

  // Penjaga terakhir: charge yang "sukses" tapi tidak membawa QR sama saja
  // dengan booking yang tidak bisa dibayar. Lebih baik gagal keras di sini
  // supaya booking-nya dibatalkan, daripada pelanggan menatap panel kosong.
  if (!qrString) {
    throw new Error(
      "Midtrans charge berhasil tapi tidak mengembalikan QRIS " +
        "(tidak ada qr_string maupun action generate-qr-code).",
    );
  }

  return {
    provider: "MIDTRANS",
    transactionId: body.transaction_id,
    orderId: body.order_id,
    qrString,
    expiresAt: body.expiry_time ?? null,
  };
}

/**
 * Verifikasi signature webhook Midtrans:
 *   signature_key = SHA512(order_id + status_code + gross_amount + server_key)
 *
 * Dibandingkan lewat `timingSafeEqual`, bukan `===` — perbandingan string
 * biasa berhenti di karakter pertama yang beda, sehingga waktu eksekusinya
 * membocorkan berapa banyak karakter awal yang sudah cocok (timing attack).
 */
function verifyWebhookSignature({ body, credential }: VerifyWebhookSignatureParams): boolean {
  const orderId = typeof body.order_id === "string" ? body.order_id : "";
  const statusCode = typeof body.status_code === "string" ? body.status_code : "";
  const grossAmount = typeof body.gross_amount === "string" ? body.gross_amount : "";
  const signatureKey = typeof body.signature_key === "string" ? body.signature_key : "";

  if (!orderId || !statusCode || !grossAmount || !signatureKey) return false;

  const expected = createHash("sha512")
    .update(orderId + statusCode + grossAmount + credential)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signatureKey, "utf8");

  // timingSafeEqual melempar kalau panjang buffer beda — signature_key
  // dengan panjang salah jelas invalid, tapi harus dicek dulu sebelum
  // dibandingkan supaya tidak throw.
  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}

export const midtransAdapter: PaymentProviderAdapter = {
  provider: "MIDTRANS",
  createQrisCharge,
  verifyWebhookSignature,
};
