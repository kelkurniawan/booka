// Test unit untuk src/lib/payments/midtrans.ts.
//
// "server-only" hanya aman di-import dengan --conditions=react-server (lihat
// script test:unit di package.json dan komentar serupa di
// src/lib/crypto/secret-box.test.ts). Modul ini sendiri tidak memanggil
// serverEnv(), jadi tidak butuh env var Supabase seperti secret-box.test.ts.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";

import type { PaymentProviderAdapter } from "./types";

let getMidtransBaseUrl: (environment: "SANDBOX" | "PRODUCTION") => string;
let midtransAdapter: PaymentProviderAdapter;

before(async () => {
  ({ getMidtransBaseUrl, midtransAdapter } = await import("./midtrans"));
});

test("getMidtransBaseUrl: SANDBOX -> api.sandbox.midtrans.com", () => {
  assert.equal(getMidtransBaseUrl("SANDBOX"), "https://api.sandbox.midtrans.com/v2");
});

test("getMidtransBaseUrl: PRODUCTION -> api.midtrans.com (tanpa 'sandbox')", () => {
  assert.equal(getMidtransBaseUrl("PRODUCTION"), "https://api.midtrans.com/v2");
});

function buildSignedBody(serverKey: string) {
  const orderId = "booking-123";
  const statusCode = "200";
  const grossAmount = "150000.00";
  const signature_key = createHash("sha512")
    .update(orderId + statusCode + grossAmount + serverKey)
    .digest("hex");

  return { order_id: orderId, status_code: statusCode, gross_amount: grossAmount, signature_key };
}

test("verifyWebhookSignature: signature valid diterima", () => {
  const serverKey = "SB-Mid-server-rahasia-123";
  const body = buildSignedBody(serverKey);

  const result = midtransAdapter.verifyWebhookSignature({
    body,
    headers: {},
    credential: serverKey,
    webhookToken: null,
  });

  assert.equal(result, true);
});

test("verifyWebhookSignature: signature dari server key yang salah ditolak", () => {
  const body = buildSignedBody("server-key-asli");

  const result = midtransAdapter.verifyWebhookSignature({
    body,
    headers: {},
    credential: "server-key-yang-salah",
    webhookToken: null,
  });

  assert.equal(result, false);
});

test("verifyWebhookSignature: gross_amount diutak-atik (mismatch amount) ditolak", () => {
  const serverKey = "SB-Mid-server-rahasia-123";
  const body = buildSignedBody(serverKey);
  const tampered = { ...body, gross_amount: "999999.00" };

  const result = midtransAdapter.verifyWebhookSignature({
    body: tampered,
    headers: {},
    credential: serverKey,
    webhookToken: null,
  });

  assert.equal(result, false);
});

test("verifyWebhookSignature: field wajib hilang (order_id) ditolak, bukan throw", () => {
  const serverKey = "SB-Mid-server-rahasia-123";
  const body = buildSignedBody(serverKey);
  const { order_id: _omit, ...withoutOrderId } = body;
  void _omit;

  const result = midtransAdapter.verifyWebhookSignature({
    body: withoutOrderId,
    headers: {},
    credential: serverKey,
    webhookToken: null,
  });

  assert.equal(result, false);
});

test("verifyWebhookSignature: signature_key panjangnya beda ditolak, bukan throw (timingSafeEqual butuh panjang sama)", () => {
  const serverKey = "SB-Mid-server-rahasia-123";
  const body = { ...buildSignedBody(serverKey), signature_key: "pendek" };

  assert.doesNotThrow(() => {
    const result = midtransAdapter.verifyWebhookSignature({
      body,
      headers: {},
      credential: serverKey,
      webhookToken: null,
    });
    assert.equal(result, false);
  });
});

// --- createQrisCharge: fetch di-mock, memverifikasi URL/auth header/body yang dikirim. ---

type FetchArgs = { url: string; init: RequestInit };
let originalFetch: typeof fetch;
let lastCall: FetchArgs | null = null;

before(() => {
  originalFetch = global.fetch;
});

after(() => {
  global.fetch = originalFetch;
});

function mockFetchOnce(status: number, jsonBody: unknown) {
  global.fetch = (async (url: string | URL, init?: RequestInit) => {
    lastCall = { url: String(url), init: init ?? {} };
    return new Response(JSON.stringify(jsonBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

test("createQrisCharge: memanggil base URL sandbox, Basic auth dari server key, dan mem-parse qr_string", async () => {
  mockFetchOnce(201, {
    status_code: "201",
    transaction_id: "trx-1",
    order_id: "booking-123",
    qr_string: "00020101...qr-payload",
    expiry_time: "2026-08-01 10:00:00",
  });

  const charge = await midtransAdapter.createQrisCharge({
    orderId: "booking-123",
    amount: 150000,
    environment: "SANDBOX",
    credential: "server-key-abc",
  });

  assert.equal(lastCall?.url, "https://api.sandbox.midtrans.com/v2/charge");
  const headers = lastCall?.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Basic ${Buffer.from("server-key-abc:").toString("base64")}`);

  const sentBody = JSON.parse(String(lastCall?.init.body)) as {
    payment_type: string;
    transaction_details: { order_id: string; gross_amount: number };
  };
  assert.equal(sentBody.payment_type, "qris");
  assert.equal(sentBody.transaction_details.order_id, "booking-123");
  assert.equal(sentBody.transaction_details.gross_amount, 150000);

  assert.deepEqual(charge, {
    provider: "MIDTRANS",
    transactionId: "trx-1",
    orderId: "booking-123",
    qrString: "00020101...qr-payload",
    expiresAt: "2026-08-01 10:00:00",
  });
});

test("createQrisCharge: response non-2xx melempar error yang menyertakan status_message", async () => {
  mockFetchOnce(402, { status_code: "402", status_message: "Server Key tidak valid" });

  await assert.rejects(
    () =>
      midtransAdapter.createQrisCharge({
        orderId: "booking-999",
        amount: 10000,
        environment: "PRODUCTION",
        credential: "server-key-salah",
      }),
    /Server Key tidak valid/,
  );
});
