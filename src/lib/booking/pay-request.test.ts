import { test } from "node:test";
import assert from "node:assert/strict";
import { payDecision, paymentHoldUntil } from "./pay-request";

const now = Date.parse("2026-11-20T08:00:00Z");
const row = (over = {}) => ({ status: "PENDING" as const, expires_at: "2026-11-21T08:00:00Z", payment_url: null, ...over });

test("payDecision", () => {
  assert.equal(payDecision(row(), now), "CHARGE");
  assert.equal(payDecision(row({ payment_url: "000201..." }), now), "ALREADY_CHARGED");
  assert.equal(payDecision(row({ expires_at: "2026-11-20T07:59:00Z" }), now), "NOT_PAYABLE");
  assert.equal(payDecision(row({ status: "REQUESTED" as never }), now), "NOT_PAYABLE");
  assert.equal(payDecision(row({ status: "PAID" as never }), now), "NOT_PAYABLE");
});

test("paymentHoldUntil memendekkan ke 15 menit, tidak pernah memperpanjang", () => {
  assert.equal(paymentHoldUntil("2026-11-21T08:00:00Z", now), "2026-11-20T08:15:00.000Z");
  assert.equal(paymentHoldUntil("2026-11-20T08:05:00Z", now), "2026-11-20T08:05:00.000Z");
});
