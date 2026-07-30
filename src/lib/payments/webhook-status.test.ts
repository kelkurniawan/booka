// Test unit untuk src/lib/payments/webhook-status.ts.
//
// "server-only" hanya aman di-import dengan --conditions=react-server (lihat
// script test:unit di package.json dan komentar serupa di
// src/lib/crypto/secret-box.test.ts). Modul ini tidak memanggil serverEnv()
// atau menyentuh Supabase, jadi tidak butuh env var apa pun seperti
// secret-box.test.ts.
import assert from "node:assert/strict";
import { before, test } from "node:test";

import type { extractProviderOrderId, mapProviderStatus, shouldMarkPaid } from "./webhook-status";

let extractId: typeof extractProviderOrderId;
let mapStatus: typeof mapProviderStatus;
let shouldMark: typeof shouldMarkPaid;

before(async () => {
  ({
    extractProviderOrderId: extractId,
    mapProviderStatus: mapStatus,
    shouldMarkPaid: shouldMark,
  } = await import("./webhook-status"));
});

// --- extractProviderOrderId ---

test("extractProviderOrderId: Midtrans membaca order_id top-level", () => {
  assert.equal(extractId("MIDTRANS", { order_id: "booking-123" }), "booking-123");
});

test("extractProviderOrderId: Midtrans tanpa order_id -> null", () => {
  assert.equal(extractId("MIDTRANS", {}), null);
});

test("extractProviderOrderId: Xendit membaca reference_id top-level", () => {
  assert.equal(extractId("XENDIT", { reference_id: "booking-456" }), "booking-456");
});

test("extractProviderOrderId: Xendit membaca reference_id di dalam data (bentuk event webhook)", () => {
  assert.equal(
    extractId("XENDIT", { event: "qr.payment", data: { reference_id: "booking-789" } }),
    "booking-789",
  );
});

test("extractProviderOrderId: Xendit tanpa reference_id -> null", () => {
  assert.equal(extractId("XENDIT", { data: {} }), null);
});

// --- mapProviderStatus ---

test("mapProviderStatus: Midtrans settlement -> PAID", () => {
  assert.equal(mapStatus("MIDTRANS", { transaction_status: "settlement" }), "PAID");
});

test("mapProviderStatus: Midtrans capture + fraud_status accept -> PAID", () => {
  assert.equal(
    mapStatus("MIDTRANS", { transaction_status: "capture", fraud_status: "accept" }),
    "PAID",
  );
});

test("mapProviderStatus: Midtrans capture + fraud_status challenge -> IGNORE", () => {
  assert.equal(
    mapStatus("MIDTRANS", { transaction_status: "capture", fraud_status: "challenge" }),
    "IGNORE",
  );
});

test("mapProviderStatus: Midtrans expire -> IGNORE (cron kedaluwarsa yang menangani)", () => {
  assert.equal(mapStatus("MIDTRANS", { transaction_status: "expire" }), "IGNORE");
});

test("mapProviderStatus: Midtrans cancel -> IGNORE", () => {
  assert.equal(mapStatus("MIDTRANS", { transaction_status: "cancel" }), "IGNORE");
});

test("mapProviderStatus: Midtrans deny -> IGNORE", () => {
  assert.equal(mapStatus("MIDTRANS", { transaction_status: "deny" }), "IGNORE");
});

test("mapProviderStatus: Midtrans pending -> IGNORE", () => {
  assert.equal(mapStatus("MIDTRANS", { transaction_status: "pending" }), "IGNORE");
});

test("mapProviderStatus: Xendit SUCCEEDED (top-level) -> PAID", () => {
  assert.equal(mapStatus("XENDIT", { status: "SUCCEEDED" }), "PAID");
});

test("mapProviderStatus: Xendit COMPLETED di dalam data -> PAID", () => {
  assert.equal(mapStatus("XENDIT", { data: { status: "COMPLETED" } }), "PAID");
});

test("mapProviderStatus: Xendit FAILED -> IGNORE", () => {
  assert.equal(mapStatus("XENDIT", { status: "FAILED" }), "IGNORE");
});

test("mapProviderStatus: Xendit tanpa status -> IGNORE", () => {
  assert.equal(mapStatus("XENDIT", {}), "IGNORE");
});

// --- shouldMarkPaid (keputusan idempotensi) ---

test("shouldMarkPaid: PENDING -> true (satu-satunya transisi yang diizinkan)", () => {
  assert.equal(shouldMark("PENDING"), true);
});

test("shouldMarkPaid: PAID -> false (event duplikat, jangan diproses ulang)", () => {
  assert.equal(shouldMark("PAID"), false);
});

test("shouldMarkPaid: CANCELLED -> false (jangan di-flip balik, lihat komentar di source)", () => {
  assert.equal(shouldMark("CANCELLED"), false);
});
