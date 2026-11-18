import assert from "node:assert/strict";
import { test } from "node:test";

import { isScopedMediaPath } from "@/lib/media/path";

import { COURT_PHOTO_MAX_BYTES, COURT_PHOTO_TOO_BIG, courtPhotoPath } from "./court-photo-rules";

test("path foto mengikuti pola dan lolos aturan folder merchant", () => {
  const p = courtPhotoPath("m1", "c1", "u1", "webp");
  assert.equal(p, "m1/court/c1/u1.webp");
  assert.ok(isScopedMediaPath(p, "m1"));
  assert.ok(!isScopedMediaPath(p, "m2"));
});

test("batas 5 MB dan pesan sesuai L6", () => {
  assert.equal(COURT_PHOTO_MAX_BYTES, 5_242_880);
  assert.equal(COURT_PHOTO_TOO_BIG, "Foto terlalu besar. Pakai JPG, PNG, atau WebP maksimal 5 MB.");
});
