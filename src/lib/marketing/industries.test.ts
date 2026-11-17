import test from "node:test";
import assert from "node:assert/strict";
import { findSlopChars } from "@/lib/marketing/content";
import { INDUSTRIES, industryBySlug } from "@/lib/marketing/industries";
import { ROUTES } from "@/lib/routes";

test("enam slug berurutan dan unik", () => {
  assert.deepEqual(
    INDUSTRIES.map((i) => i.slug),
    ["salon", "barbershop", "restoran", "fotografer", "klinik", "kelas"],
  );
});

test("batas metadata dan jumlah isi", () => {
  for (const i of INDUSTRIES) {
    assert.ok(i.metaTitle.length <= 60, `${i.slug} metaTitle ${i.metaTitle.length}`);
    assert.ok(
      i.metaDescription.length >= 70 && i.metaDescription.length <= 160,
      `${i.slug} metaDescription ${i.metaDescription.length}`,
    );
    assert.equal(i.points.length, 3, i.slug);
    assert.ok(i.faqs.length === 2 || i.faqs.length === 3, i.slug);
  }
});

test("industryBySlug dan ROUTES.industry", () => {
  assert.equal(industryBySlug("salon")?.slug, "salon");
  assert.equal(industryBySlug("spa"), undefined);
  assert.equal(ROUTES.industry("salon"), "/untuk/salon");
});

test("tanpa karakter terlarang", () => {
  assert.deepEqual(findSlopChars(INDUSTRIES), []);
});
