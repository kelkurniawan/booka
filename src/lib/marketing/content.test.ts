import test from "node:test";
import assert from "node:assert/strict";
import { PLANS, PLAN_COMPARISON } from "@/lib/plans";
import {
  AGENDA_EXAMPLE_ROWS,
  BIZ_EXAMPLES,
  findSlopChars,
  LANDING_FAQS,
  MESSAGE_EXAMPLES,
  POLICIES,
  QRIS_EXAMPLE_ROWS,
} from "@/lib/marketing/content";
import { INDUSTRIES } from "@/lib/marketing/industries";

test("jumlah isi sesuai kanvas", () => {
  assert.equal(LANDING_FAQS.length, 6);
  assert.equal(POLICIES.length, 4);
  assert.equal(BIZ_EXAMPLES.length, 4);
  assert.equal(MESSAGE_EXAMPLES.length, 3);
  assert.equal(QRIS_EXAMPLE_ROWS.length, 3);
  assert.equal(AGENDA_EXAMPLE_ROWS.length, 4);
});

test("tidak ada em dash, en dash, · atau panah di isi", () => {
  const found = findSlopChars({
    LANDING_FAQS,
    POLICIES,
    BIZ_EXAMPLES,
    MESSAGE_EXAMPLES,
    QRIS_EXAMPLE_ROWS,
    AGENDA_EXAMPLE_ROWS,
    PLANS,
    PLAN_COMPARISON,
    INDUSTRIES,
  });
  assert.deepEqual(found, []);
});

test("findSlopChars menemukan karakter terlarang", () => {
  assert.deepEqual(findSlopChars({ a: ["ok", "x \u2014 y"] }), ["$.a[1]"]);
});

test("setiap tautan pesan menuju halaman pesanan", () => {
  for (const message of MESSAGE_EXAMPLES) {
    assert.ok(message.linkPath.startsWith("/pesanan/"), message.label);
  }
});
