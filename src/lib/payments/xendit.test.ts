// Test unit untuk src/lib/payments/xendit.ts.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import type { ChargeRejectedError as ChargeRejectedErrorType } from "./errors";
import type { PaymentProviderAdapter } from "./types";

let getXenditBaseUrl: (environment: "SANDBOX" | "PRODUCTION") => string;
let xenditAdapter: PaymentProviderAdapter;
let ChargeRejectedError: typeof ChargeRejectedErrorType;

before(async () => {
  ({ getXenditBaseUrl, xenditAdapter } = await import("./xendit"));
  ({ ChargeRejectedError } = await import("./errors"));
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
    credential: "secret-key-tidak-relevan",
    webhookToken: "token-rahasia-webhook",
  });

  assert.equal(result, true);
});

test("verifyWebhookSignature: x-callback-token yang tidak cocok ditolak", () => {
  const result = xenditAdapter.verifyWebhookSignature({
    body: {},
    headers: { "x-callback-token": "token-palsu" },
    credential: "secret-key-tidak-relevan",
    webhookToken: "token-rahasia-webhook",
  });

  assert.equal(result, false);
});

test("verifyWebhookSignature: header x-callback-token hilang ditolak, bukan throw", () => {
  assert.doesNotThrow(() => {
    const result = xenditAdapter.verifyWebhookSignature({
      body: {},
      headers: {},
      credential: "secret-key-tidak-relevan",
      webhookToken: "token-rahasia-webhook",
    });
    assert.equal(result, false);
  });
});

test("verifyWebhookSignature: webhookToken belum diisi (null) ditolak, bukan jatuh balik ke Secret Key", () => {
  assert.doesNotThrow(() => {
    const result = xenditAdapter.verifyWebhookSignature({
      body: {},
      headers: { "x-callback-token": "secret-key-tidak-relevan" },
      credential: "secret-key-tidak-relevan",
      webhookToken: null,
    });
    // credential (Secret Key) SENGAJA sama persis dengan header di atas --
    // ini menegaskan tidak ada jatuh balik diam-diam ke Secret Key saat
    // webhookToken belum diisi merchant.
    assert.equal(result, false);
  });
});

test("verifyWebhookSignature: panjang token beda ditolak, bukan throw (timingSafeEqual butuh panjang sama)", () => {
  assert.doesNotThrow(() => {
    const result = xenditAdapter.verifyWebhookSignature({
      body: {},
      headers: { "x-callback-token": "pendek" },
      credential: "secret-key-tidak-relevan",
      webhookToken: "token-rahasia-webhook-yang-jauh-lebih-panjang",
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

// --- ChargeRejectedError vs Error biasa --------------------------------------
// Sama seperti midtrans.test.ts: pemanggil (POST /api/bookings) butuh
// membedakan penolakan DEFINITIF gateway dari gangguan jaringan/timeout.
// Xendit tidak punya kuirk "HTTP 200 tapi body-nya gagal" seperti Midtrans,
// jadi cuma satu kondisi (HTTP non-2xx) yang perlu diuji di sini.

test("createQrisCharge: HTTP non-2xx melempar ChargeRejectedError dengan provider/providerMessage/providerStatusCode", async () => {
  mockFetchOnce(401, { error_code: "INVALID_API_KEY", message: "Secret Key tidak valid" });

  await assert.rejects(
    () =>
      xenditAdapter.createQrisCharge({
        orderId: "booking-999",
        amount: 10000,
        environment: "PRODUCTION",
        credential: "secret-key-salah",
      }),
    (error: unknown) => {
      assert.ok(error instanceof ChargeRejectedError, "seharusnya ChargeRejectedError");
      assert.equal(error.provider, "XENDIT");
      assert.equal(error.providerMessage, "Secret Key tidak valid");
      assert.equal(error.providerStatusCode, "INVALID_API_KEY");
      return true;
    },
  );
});

test("createQrisCharge: kegagalan jaringan (fetch melempar) tetap Error biasa, BUKAN ChargeRejectedError", async () => {
  global.fetch = (async () => {
    throw new Error("network hiccup, koneksi terputus");
  }) as typeof fetch;

  await assert.rejects(
    () =>
      xenditAdapter.createQrisCharge({
        orderId: "order-network-fail",
        amount: 10000,
        environment: "PRODUCTION",
        credential: "xnd_development_secret",
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(
        !(error instanceof ChargeRejectedError),
        "kegagalan jaringan tidak boleh diklasifikasikan sebagai penolakan gateway",
      );
      return true;
    },
  );
});
