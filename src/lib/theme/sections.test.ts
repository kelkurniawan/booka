import assert from "node:assert/strict";
import test from "node:test";

import { moveSection, normalizeSectionOrder, visibleSections } from "./sections";

test("visibleSections: bawaan, kunci asing, duplikat, dan hidden", () => {
  assert.deepEqual(visibleSections(null, null), ["LINKS", "PROMO", "SERVICES", "FAQ"]);
  assert.deepEqual(visibleSections(["FAQ", "X", "FAQ"], ["SERVICES", "FAQ"]), ["LINKS", "PROMO", "SERVICES"]);
  assert.deepEqual(visibleSections(["SERVICES", "FAQ", "PROMO", "LINKS"], ["PROMO"]), ["SERVICES", "FAQ", "LINKS"]);
});

test("normalizeSectionOrder menambahkan kunci yang hilang", () => {
  assert.deepEqual(normalizeSectionOrder(["FAQ"]), ["LINKS", "FAQ", "PROMO", "SERVICES"]);
  assert.deepEqual(normalizeSectionOrder(["PROMO", "SERVICES", "FAQ"]), ["LINKS", "PROMO", "SERVICES", "FAQ"]);
});

test("moveSection menukar tetangga dan menahan di ujung", () => {
  const urutan = ["PROMO", "SERVICES", "FAQ"] as const;
  assert.deepEqual(moveSection(urutan, "FAQ", "up"), ["PROMO", "FAQ", "SERVICES"]);
  assert.deepEqual(moveSection(urutan, "PROMO", "up"), [...urutan]);
  assert.deepEqual(moveSection(urutan, "FAQ", "down"), [...urutan]);
});
