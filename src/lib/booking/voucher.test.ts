import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VOUCHER_CODE_PATTERN,
  computeDiscount,
  normalizeVoucherCode,
  randomVoucherCode,
  voucherIneligibleReason,
  voucherStatus,
  voucherSummary,
  type VoucherTerms,
} from "./voucher";

const v = (o: Partial<VoucherTerms>): VoucherTerms =>
  ({ code: "WISUDA20", kind: "PERCENT", value: 20, max_discount: null, min_spend: null, service_ids: null, ...o });

test("computeDiscount sama dengan evaluate_voucher (t46a)", () => {
  assert.equal(computeDiscount(v({ max_discount: 100000 }), 350000), 70000);
  assert.equal(computeDiscount(v({ value: 50, max_discount: 100000 }), 350000), 100000);
  assert.equal(computeDiscount(v({ kind: "FIXED", value: 400000 }), 350000), 350000);
  assert.equal(computeDiscount(v({ kind: "FIXED", value: 349000 }), 350000), 348500);
  assert.equal(computeDiscount(v({ value: 100 }), 350000), 350000);
  assert.equal(computeDiscount(v({ kind: "FIXED", value: 9000 }), 10000), 8500);
  assert.equal(computeDiscount(v({ kind: "FIXED", value: 500 }), 1000), 500); // harga lama < 1500 tidak dipotong
  assert.equal(computeDiscount(v({ value: 15 }), 99999), 15000);              // setengah ke atas
});

test("voucherIneligibleReason", () => {
  const names = { a: "Makeup Wisuda", b: "Makeup Pesta" };
  assert.equal(voucherIneligibleReason(v({}), { id: "a", price: 350000 }, names), null);
  assert.equal(voucherIneligibleReason(v({ service_ids: ["b"] }), { id: "a", price: 350000 }, names), "Hanya untuk Makeup Pesta");
  assert.equal(voucherIneligibleReason(v({ min_spend: 500000 }), { id: "a", price: 350000 }, names), "Belum bisa dipakai: minimal Rp500.000");
});

test("normalizeVoucherCode dan pola", () => {
  assert.equal(normalizeVoucherCode("  wisuda20 "), "WISUDA20");
  assert.ok(VOUCHER_CODE_PATTERN.test("AB12"));
  assert.ok(!VOUCHER_CODE_PATTERN.test("AB1"));
  assert.ok(!VOUCHER_CODE_PATTERN.test("AB-12"));
});

test("voucherSummary", () => {
  assert.equal(voucherSummary({ kind: "PERCENT", value: 20, max_discount: 100000, min_spend: null }), "Diskon 20%, maks Rp100.000");
  assert.equal(voucherSummary({ kind: "FIXED", value: 50000, max_discount: null, min_spend: 500000 }), "Potongan Rp50.000, min Rp500.000");
});

test("randomVoucherCode", () => {
  const code = randomVoucherCode(() => 0);
  assert.equal(code, "AAAAAAAA");
  assert.ok(VOUCHER_CODE_PATTERN.test(randomVoucherCode()));
});

test("voucherStatus", () => {
  const now = Date.parse("2026-12-10T00:00:00Z");
  assert.equal(voucherStatus({ starts_at: null, ends_at: null, quota: null }, 5, now), "Aktif");
  assert.equal(voucherStatus({ starts_at: "2027-03-20T00:00:00Z", ends_at: null, quota: null }, 0, now), "Terjadwal");
  assert.equal(voucherStatus({ starts_at: null, ends_at: "2026-11-01T00:00:00Z", quota: null }, 0, now), "Berakhir");
  assert.equal(voucherStatus({ starts_at: null, ends_at: null, quota: 30 }, 30, now), "Habis");
});
