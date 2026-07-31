// Test unit untuk src/lib/payments/xendit.ts.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import type { PaymentProviderAdapter } from "./types";

let getXenditBaseUrl: (environment: "SANDBOX" | "PRODUCTION") => string;
let xenditAdapter: PaymentProviderAdapter;

before(async () => {
  ({ getXenditBaseUrl, xenditAdapter } = await import("./xendit"));
});

test("getXenditBaseUrl: SANDBOX -> api.xendit.co (tidak ada base URL sandbox terpisah)", () => {
  assert.equal(getXenditBaseUrl("SANDBOX"), "https://api.xendit.co");
});

test("getXenditBaseUrl: PRODUCTION -> URL yang sama persis dengan SANDBOX", () => {
  // Beda dengan Midtrans: environment Xendit ditentukan lewat prefiks Secret
  // Key (xnd_development_ vs xnd_production_), bukan lewat URL.
  assert.equal(getXenditBaseUrl("PRODUCTION"), getXenditBaseUrl("SANDBOX"));
});

test("verifyWebhookSignature: x-callback-token yang cocok diterima", () => {
  const result = xenditAdapter.verifyWebhookSignature({
    body: {},
    headers: { "x-callback-token": "token-rahasia-webhook" },
    credential: "token-rahasia-webhook",
  });

  assert.equal(result, true);
});

test("verifyWebhookSignature: x-callback-token yang tidak cocok ditolak", () => {
  const result = xenditAdapter.verifyWebhookSignature({
    body: {},
    headers: { "x-callback-token": "token-palsu" },
    credential: "token-rahasia-webhook",
  });

  assert.equal(result, false);
});

test("verifyWebhookSignature: header x-callback-token hilang ditolak, bukan throw", () => {
  assert.doesNotThrow(() => {
    const result = xenditAdapter.verifyWebhookSignature({
      body: {},
      headers: {},
      credential: "token-rahasia-webhook",
    });
    assert.equal(result, false);
  });
});

test("verifyWebhookSignature: panjang token beda ditolak, bukan throw (timingSafeEqual butuh panjang sama)", () => {
  assert.doesNotThrow(() => {
    const result = xenditAdapter.verifyWebhookSignature({
      body: {},
      headers: { "x-callback-token": "pendek" },
      credential: "token-rahasia-webhook-yang-jauh-lebih-panjang",
    });
    assert.equal(result, false);
  });
});

// --- createQrisCharge: fetch di-mock. ---

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

test("createQrisCharge: memanggil /qr_codes dengan channel_code QRIS dan Basic auth dari secret key", async () => {
  mockFetchOnce(200, {
    id: "qr-1",
    reference_id: "booking-456",
    qr_string: "00020101...xendit-qr-payload",
    expires_at: "2026-08-01T10:00:00.000Z",
  });

  const charge = await xenditAdapter.createQrisCharge({
    orderId: "booking-456",
    amount: 200000,
    environment: "SANDBOX",
    credential: "xnd_development_secret",
  });

  assert.equal(lastCall?.url, "https://api.xendit.co/qr_codes");
  const headers = lastCall?.init.headers as Record<string, string>;
  assert.equal(
    headers.Authorization,
    `Basic ${Buffer.from("xnd_development_secret:").toString("base64")}`,
  );

  const sentBody = JSON.parse(String(lastCall?.init.body)) as {
    channel_code: string;
    reference_id: string;
    amount: number;
    currency: string;
  };
  assert.equal(sentBody.channel_code, "QRIS");
  assert.equal(sentBody.reference_id, "booking-456");
  assert.equal(sentBody.amount, 200000);
  assert.equal(sentBody.currency, "IDR");

  assert.deepEqual(charge, {
    provider: "XENDIT",
    transactionId: "qr-1",
    orderId: "booking-456",
    qrString: "00020101...xendit-qr-payload",
    expiresAt: "2026-08-01T10:00:00.000Z",
  });
});

test("createQrisCharge: response non-2xx melempar error yang menyertakan pesan dari Xendit", async () => {
  mockFetchOnce(401, { error_code: "INVALID_API_KEY", message: "Secret Key tidak valid" });

  await assert.rejects(
    () =>
      xenditAdapter.createQrisCharge({
        orderId: "booking-999",
        amount: 10000,
        environment: "PRODUCTION",
        credential: "secret-key-salah",
      }),
    /Secret Key tidak valid/,
  );
});
