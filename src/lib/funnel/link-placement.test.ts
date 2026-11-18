import assert from "node:assert/strict";
import { test } from "node:test";

import { applyPlacement, placementFromOrder } from "./link-placement";

const base = ["PROMO", "FAQ", "SERVICES"];

test("letak tautan: tiga pilihan, urutan lain tetap", () => {
  assert.deepEqual(applyPlacement(base, "BEFORE_SERVICES"), ["PROMO", "FAQ", "LINKS", "SERVICES"]);
  assert.deepEqual(applyPlacement(base, "AFTER_SERVICES"), ["PROMO", "FAQ", "SERVICES", "LINKS"]);
  assert.deepEqual(applyPlacement(["LINKS", "SERVICES", "FAQ", "PROMO"], "END"), ["SERVICES", "FAQ", "PROMO", "LINKS"]);
});

test("placementFromOrder membalik applyPlacement", () => {
  for (const p of ["BEFORE_SERVICES", "AFTER_SERVICES", "END"] as const) {
    assert.equal(placementFromOrder(applyPlacement(["LINKS", "PROMO", "SERVICES", "FAQ"], p)), p);
  }
});
