import { test } from "node:test";
import assert from "node:assert/strict";

import { formatRupiah } from "@/lib/format";

import {
  DEFAULT_PAYMENT_SETTINGS,
  MIN_ONLINE_CHARGE,
  computeAmounts,
  effectivePaymentMode,
  initialBookingStatus,
  needsApproval,
  paymentLabel,
  type ServicePayment,
} from "./payment-mode";

const svc = (over: Partial<ServicePayment> = {}): ServicePayment => ({
  price: 350000,
  payment_mode: "FULL",
  deposit_type: null,
  deposit_value: null,
  ...over,
});
const on = DEFAULT_PAYMENT_SETTINGS;
const off = { allow_pay_on_site: false, auto_confirm_on_site: true };
const manual = { allow_pay_on_site: true, auto_confirm_on_site: false };

test("effectivePaymentMode jatuh ke FULL bila bayar di tempat dimatikan", () => {
  assert.equal(effectivePaymentMode(svc({ payment_mode: "ON_SITE" }), on), "ON_SITE");
  assert.equal(effectivePaymentMode(svc({ payment_mode: "ON_SITE" }), off), "FULL");
  assert.equal(effectivePaymentMode(svc({ payment_mode: "REQUEST" }), off), "REQUEST");
  assert.equal(effectivePaymentMode(svc({ payment_mode: "DEPOSIT" }), off), "DEPOSIT");
});

test("computeAmounts sama dengan create_booking", () => {
  const dp = svc({ payment_mode: "DEPOSIT", deposit_type: "PERCENT", deposit_value: 30 });
  assert.deepEqual(computeAmounts(dp, "DEPOSIT"), { dueNow: 105000, dueOnSite: 245000 });
  assert.deepEqual(
    computeAmounts(svc({ payment_mode: "DEPOSIT", deposit_type: "FIXED", deposit_value: 100000 }), "DEPOSIT"),
    { dueNow: 100000, dueOnSite: 250000 },
  );
  // 99999 x 30% = 29999,7 dibulatkan ke 30000.
  assert.deepEqual(
    computeAmounts({ ...dp, price: 99999 }, "DEPOSIT"),
    { dueNow: 30000, dueOnSite: 69999 },
  );
  assert.deepEqual(computeAmounts(svc(), "FULL"), { dueNow: 350000, dueOnSite: 0 });
  assert.deepEqual(computeAmounts(svc({ payment_mode: "ON_SITE" }), "ON_SITE"), { dueNow: 0, dueOnSite: 350000 });
  assert.deepEqual(computeAmounts(svc({ payment_mode: "REQUEST" }), "REQUEST"), { dueNow: 350000, dueOnSite: 0 });
  assert.deepEqual(
    computeAmounts(svc({ payment_mode: "REQUEST", deposit_type: "FIXED", deposit_value: 100000 }), "REQUEST"),
    { dueNow: 100000, dueOnSite: 250000 },
  );
  // Mode efektif FULL mengabaikan DP apa pun.
  assert.deepEqual(computeAmounts(dp, "FULL"), { dueNow: 350000, dueOnSite: 0 });
});

test("computeAmounts menaikkan DP ke minimum QRIS, tapi tidak melebihi harga", () => {
  assert.equal(MIN_ONLINE_CHARGE, 1500);
  const dp1 = svc({ price: 100000, payment_mode: "DEPOSIT", deposit_type: "PERCENT", deposit_value: 1 });
  assert.deepEqual(computeAmounts(dp1, "DEPOSIT"), { dueNow: 1500, dueOnSite: 98500 });
  assert.deepEqual(
    computeAmounts(svc({ price: 100000, payment_mode: "REQUEST", deposit_type: "FIXED", deposit_value: 500 }), "REQUEST"),
    { dueNow: 1500, dueOnSite: 98500 },
  );
  // Harga di bawah minimum: DP jadi seluruh harga (server lalu menolak BK022).
  assert.deepEqual(computeAmounts({ ...dp1, price: 1000 }, "DEPOSIT"), { dueNow: 1000, dueOnSite: 0 });
  // Gratis tetap 0; REQUEST tanpa DP tidak disentuh aturan DP.
  assert.deepEqual(computeAmounts({ ...dp1, price: 0 }, "DEPOSIT"), { dueNow: 0, dueOnSite: 0 });
  assert.deepEqual(computeAmounts(svc({ price: 1000, payment_mode: "REQUEST" }), "REQUEST"), { dueNow: 1000, dueOnSite: 0 });
});

test("initialBookingStatus sama dengan create_booking", () => {
  assert.equal(initialBookingStatus("FULL", 350000, on), "PENDING");
  assert.equal(initialBookingStatus("DEPOSIT", 1500, on), "PENDING");
  // Bayar sekarang 0 tidak pernah PENDING.
  assert.equal(initialBookingStatus("FULL", 0, on), "CONFIRMED");
  assert.equal(initialBookingStatus("DEPOSIT", 0, on), "CONFIRMED");
  assert.equal(initialBookingStatus("ON_SITE", 0, on), "CONFIRMED");
  assert.equal(initialBookingStatus("ON_SITE", 0, manual), "REQUESTED");
  assert.equal(initialBookingStatus("REQUEST", 0, on), "REQUESTED");
  assert.equal(initialBookingStatus("REQUEST", 200000, on), "REQUESTED");
});

test("needsApproval", () => {
  assert.equal(needsApproval("REQUEST", on), true);
  assert.equal(needsApproval("ON_SITE", manual), true);
  assert.equal(needsApproval("ON_SITE", on), false);
  assert.equal(needsApproval("FULL", manual), false);
});

test("paymentLabel memakai teks M1", () => {
  assert.equal(paymentLabel(svc(), on), "Lunas di muka");
  assert.equal(paymentLabel(svc({ payment_mode: "DEPOSIT", deposit_type: "PERCENT", deposit_value: 30 }), on), "DP 30% di muka");
  assert.equal(
    paymentLabel(svc({ payment_mode: "DEPOSIT", deposit_type: "FIXED", deposit_value: 100000 }), on),
    `DP ${formatRupiah(100000)} di muka`,
  );
  assert.equal(paymentLabel(svc({ payment_mode: "ON_SITE" }), on), "Bayar di tempat");
  assert.equal(paymentLabel(svc({ payment_mode: "ON_SITE" }), off), "Lunas di muka");
  assert.equal(paymentLabel(svc({ payment_mode: "ON_SITE" }), manual), "Bayar di tempat");
  assert.equal(paymentLabel(svc({ payment_mode: "REQUEST" }), on), "Ajukan dulu");
});

test("computeAmounts memotong harga dengan diskon voucher", () => {
  const dp = svc({ payment_mode: "DEPOSIT", deposit_type: "PERCENT", deposit_value: 30 });
  // Harga efektif 350000 - 70000 = 280000; DP 30% = 84000.
  assert.deepEqual(computeAmounts(dp, "DEPOSIT", 70000), { dueNow: 84000, dueOnSite: 196000 });
  // Diskon penuh: harga efektif 0.
  assert.deepEqual(computeAmounts(svc(), "FULL", 350000), { dueNow: 0, dueOnSite: 0 });
  // Tanpa argumen ketiga sama dengan diskon 0.
  assert.deepEqual(computeAmounts(dp, "DEPOSIT"), computeAmounts(dp, "DEPOSIT", 0));
});
