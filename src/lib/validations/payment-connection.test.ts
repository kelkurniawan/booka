// Test unit untuk src/lib/validations/payment-connection.ts.
import assert from "node:assert/strict";
import { test } from "node:test";

import { manualKeySchema, maskCredential } from "./payment-connection";

const VALID = {
  provider: "MIDTRANS",
  serverKey: "SB-Mid-server-abcdef1234567890",
  environment: "SANDBOX",
};

test("menerima input valid", () => {
  const parsed = manualKeySchema.parse(VALID);
  assert.equal(parsed.provider, "MIDTRANS");
  assert.equal(parsed.serverKey, "SB-Mid-server-abcdef1234567890");
  assert.equal(parsed.environment, "SANDBOX");
});

test("serverKey di-trim", () => {
  const parsed = manualKeySchema.parse({ ...VALID, serverKey: "  spasi-di-pinggir-123  " });
  assert.equal(parsed.serverKey, "spasi-di-pinggir-123");
});

test("provider di luar enum ditolak", () => {
  const result = manualKeySchema.safeParse({ ...VALID, provider: "STRIPE" });
  assert.equal(result.success, false);
});

test("environment di luar enum ditolak", () => {
  const result = manualKeySchema.safeParse({ ...VALID, environment: "STAGING" });
  assert.equal(result.success, false);
});

test("serverKey kurang dari 10 karakter ditolak", () => {
  const result = manualKeySchema.safeParse({ ...VALID, serverKey: "pendek" });
  assert.equal(result.success, false);
});

test("serverKey lebih dari 500 karakter ditolak", () => {
  const result = manualKeySchema.safeParse({ ...VALID, serverKey: "A".repeat(501) });
  assert.equal(result.success, false);
});

test("maskCredential hanya menyisakan 4 karakter terakhir", () => {
  assert.equal(maskCredential("SB-Mid-server-abcdef1234567890"), "••••7890");
});

test("maskCredential pada string pendek tidak melempar", () => {
  assert.equal(maskCredential("abc"), "••••abc");
});
