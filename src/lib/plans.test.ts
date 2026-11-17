import test from "node:test";
import assert from "node:assert/strict";
import {
  PLANS,
  PLAN_COMPARISON,
  STARTER_MONTHLY_TRANSACTIONS,
} from "@/lib/plans";

test("monthlyPriceIdr sejalan dengan label price", () => {
  for (const plan of PLANS) {
    const expected =
      plan.price === "Gratis" ? 0 : Number(plan.price.replace(/\D/g, ""));
    assert.equal(plan.monthlyPriceIdr, expected, plan.name);
  }
});

test("setiap baris perbandingan punya kunci untuk tiap paket", () => {
  const tiers = PLANS.map((plan) => plan.tier).sort();
  for (const row of PLAN_COMPARISON) {
    assert.deepEqual(Object.keys(row.values).sort(), tiers, row.label);
  }
});

test("kuota Starter di perbandingan dan fitur sama", () => {
  assert.equal(
    PLAN_COMPARISON[0].values.STARTER,
    String(STARTER_MONTHLY_TRANSACTIONS),
  );
  const starter = PLANS.find((plan) => plan.tier === "STARTER");
  assert.ok(
    starter?.features[0].label.includes(String(STARTER_MONTHLY_TRANSACTIONS)),
  );
});

test("perbandingan punya delapan baris", () => {
  assert.equal(PLAN_COMPARISON.length, 8);
});
