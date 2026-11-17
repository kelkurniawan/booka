import assert from "node:assert/strict";
import { test } from "node:test";

import { bannerStatus, isSafeBannerUrl } from "./banner";

test("isSafeBannerUrl sama dengan constraint (t48a)", () => {
  assert.ok(isSafeBannerUrl("https://instagram.com/riasbysekar"));
  for (const bad of ["http://contoh.test", "javascript:alert(1)", "https://a.test/x y", "//a.test", "https://"])
    assert.ok(!isSafeBannerUrl(bad), bad);
  assert.ok(!isSafeBannerUrl("https://a.test/" + "x".repeat(500)));
});

test("bannerStatus", () => {
  const now = Date.parse("2026-12-10T00:00:00Z");
  assert.equal(bannerStatus({ published: false, starts_at: null, ends_at: null }, now), "Draf");
  assert.equal(bannerStatus({ published: true, starts_at: null, ends_at: null }, now), "Tayang");
  assert.equal(bannerStatus({ published: true, starts_at: "2027-03-20T00:00:00Z", ends_at: null }, now), "Terjadwal");
  assert.equal(bannerStatus({ published: true, starts_at: null, ends_at: "2026-12-01T00:00:00Z" }, now), "Selesai");
});
