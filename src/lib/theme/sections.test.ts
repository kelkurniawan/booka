import assert from "node:assert/strict";
import test from "node:test";

import { moveSection, normalizeSectionOrder, visibleSections } from "./sections";

test("visibleSections: bawaan, kunci asing, duplikat, dan hidden", () => {
  assert.deepEqual(visibleSections(null, null), ["PROMO", "SERVICES", "FAQ"]);
  assert.deepEqual(visibleSections(["FAQ", "X", "FAQ"], ["SERVICES", "FAQ"]), ["PROMO", "SERVICES"]);
  assert.deepEqual(visibleSections(["SERVICES", "FAQ", "PROMO"], ["PROMO"]), ["SERVICES", "FAQ"]);
});

test("normalizeSectionOrder menambahkan kunci yang hilang", () => {
  assert.deepEqual(normalizeSectionOrder(["FAQ"]), ["FAQ", "PROMO", "SERVICES"]);
});

test("moveSection menukar tetangga dan menahan di ujung", () => {
  const urutan = ["PROMO", "SERVICES", "FAQ"] as const;
  assert.deepEqual(moveSection(urutan, "FAQ", "up"), ["PROMO", "FAQ", "SERVICES"]);
  assert.deepEqual(moveSection(urutan, "PROMO", "up"), [...urutan]);
  assert.deepEqual(moveSection(urutan, "FAQ", "down"), [...urutan]);
});
