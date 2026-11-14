import { test } from "node:test";
import assert from "node:assert/strict";

import { formatRupiah } from "@/lib/format";

import {
  DEFAULT_PAYMENT_SETTINGS,
  computeAmounts,
  effectivePaymentMode,
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
