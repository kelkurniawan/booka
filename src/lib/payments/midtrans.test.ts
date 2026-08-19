// Test unit untuk src/lib/payments/midtrans.ts.
//
// "server-only" hanya aman di-import dengan --conditions=react-server (lihat
// script test:unit di package.json dan komentar serupa di
// src/lib/crypto/secret-box.test.ts). Modul ini sendiri tidak memanggil
// serverEnv(), jadi tidak butuh env var Supabase seperti secret-box.test.ts.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";

import type { ChargeRejectedError as ChargeRejectedErrorType } from "./errors";
import type { PaymentProviderAdapter } from "./types";

let getMidtransBaseUrl: (environment: "SANDBOX" | "PRODUCTION") => string;
let midtransAdapter: PaymentProviderAdapter;
let ChargeRejectedError: typeof ChargeRejectedErrorType;

before(async () => {
  ({ getMidtransBaseUrl, midtransAdapter } = await import("./midtrans"));
  ({ ChargeRejectedError } = await import("./errors"));
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

// --- Regresi: Midtrans membalas HTTP 200 walau charge-nya gagal -------------
// Kasus nyata yang sempat lolos ke produksi: channel QRIS belum diaktifkan di
// akun merchant, Midtrans membalas HTTP 200 dengan status_code 402. Karena
// dulu hanya `response.ok` yang diperiksa, kegagalan itu dianggap sukses dan
// booking tersimpan dengan payment_url kosong -- mustahil dibayar, dan tanpa
// pembatalan kompensasi karena tidak ada yang dilempar.
test("createQrisCharge: HTTP 200 dengan status_code error tetap melempar", async () => {
  mockFetchOnce(200, {
    status_code: "402",
    status_message: "Payment channel is not activated.",
  });

  await assert.rejects(
    () =>
      midtransAdapter.createQrisCharge({
        credential: "Mid-server-uji",
        environment: "SANDBOX",
        orderId: "order-402",
        amount: 15000,
      }),
    /402|Payment channel is not activated/,
  );
});

test("createQrisCharge: sukses tanpa QR sama sekali tetap melempar", async () => {
  // status_code sukses, tapi tidak ada qr_string maupun action generate-qr-code.
  mockFetchOnce(200, {
    status_code: "201",
    transaction_id: "trx-1",
    order_id: "order-tanpa-qr",
  });

  await assert.rejects(
    () =>
      midtransAdapter.createQrisCharge({
        credential: "Mid-server-uji",
        environment: "SANDBOX",
        orderId: "order-tanpa-qr",
        amount: 15000,
      }),
    /tidak mengembalikan QRIS/,
  );
});

test("createQrisCharge: memakai action generate-qr-code kalau qr_string tidak ada", async () => {
  mockFetchOnce(200, {
    status_code: "201",
    transaction_id: "trx-2",
    order_id: "order-action",
    actions: [
      {
        name: "generate-qr-code",
        method: "GET",
        url: "https://api.sandbox.midtrans.com/v2/qris/trx-2/qr-code",
      },
    ],
  });

  const charge = await midtransAdapter.createQrisCharge({
    credential: "Mid-server-uji",
    environment: "SANDBOX",
    orderId: "order-action",
    amount: 15000,
  });

  assert.equal(charge.qrString, "https://api.sandbox.midtrans.com/v2/qris/trx-2/qr-code");
});

// --- ChargeRejectedError vs Error biasa --------------------------------------
// Task "Peringatan koneksi pembayaran yang ditolak gateway": pemanggil (POST
// /api/bookings) butuh membedakan penolakan DEFINITIF gateway dari gangguan
// jaringan/timeout supaya tidak salah menandai koneksi merchant bermasalah
// akibat hiccup sesaat. Lihat src/lib/payments/errors.ts.

test("createQrisCharge: HTTP non-2xx melempar ChargeRejectedError dengan provider/providerMessage/providerStatusCode", async () => {
  mockFetchOnce(402, { status_code: "402", status_message: "Server Key tidak valid" });

  await assert.rejects(
    () =>
      midtransAdapter.createQrisCharge({
        orderId: "booking-999",
        amount: 10000,
        environment: "PRODUCTION",
        credential: "server-key-salah",
      }),
    (error: unknown) => {
      assert.ok(error instanceof ChargeRejectedError, "seharusnya ChargeRejectedError");
      assert.equal(error.provider, "MIDTRANS");
      assert.equal(error.providerMessage, "Server Key tidak valid");
      assert.equal(error.providerStatusCode, "402");
      return true;
    },
  );
});

test("createQrisCharge: HTTP 200 dengan status_code error melempar ChargeRejectedError", async () => {
  mockFetchOnce(200, {
    status_code: "402",
    status_message: "Payment channel is not activated.",
  });

  await assert.rejects(
    () =>
      midtransAdapter.createQrisCharge({
        credential: "Mid-server-uji",
        environment: "SANDBOX",
        orderId: "order-402",
        amount: 15000,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ChargeRejectedError, "seharusnya ChargeRejectedError");
      assert.equal(error.provider, "MIDTRANS");
      assert.equal(error.providerMessage, "Payment channel is not activated.");
      assert.equal(error.providerStatusCode, "402");
      return true;
    },
  );
});

test("createQrisCharge: sukses tanpa QR melempar ChargeRejectedError", async () => {
  mockFetchOnce(200, {
    status_code: "201",
    transaction_id: "trx-1",
    order_id: "order-tanpa-qr",
  });

  await assert.rejects(
    () =>
      midtransAdapter.createQrisCharge({
        credential: "Mid-server-uji",
        environment: "SANDBOX",
        orderId: "order-tanpa-qr",
        amount: 15000,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ChargeRejectedError, "seharusnya ChargeRejectedError");
      assert.equal(error.provider, "MIDTRANS");
      assert.equal(error.providerStatusCode, "201");
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
      midtransAdapter.createQrisCharge({
        credential: "Mid-server-uji",
        environment: "SANDBOX",
        orderId: "order-network-fail",
        amount: 15000,
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
