import assert from "node:assert/strict";
import { test } from "node:test";

import { isSafeLinkUrl, isValidGa4Id, isValidMetaPixelId, isValidTiktokPixelId } from "./pixel-ids";

test("ID pixel", () => {
  assert.equal(isValidMetaPixelId("12345-678"), false);
  assert.equal(isValidMetaPixelId("1234567890123456"), true);
  assert.equal(isValidMetaPixelId("12345678901234"), false);
  assert.equal(isValidTiktokPixelId("C0NT0HP1XELT1KT0K000"), true);
  assert.equal(isValidTiktokPixelId("c0nt0hp1xelt1kt0k000"), false);
  assert.equal(isValidGa4Id("G-ABC123XYZ9"), true);
  assert.equal(isValidGa4Id("G-ABC"), false);
});

test("isSafeLinkUrl", () => {
  assert.equal(isSafeLinkUrl("javascript:alert(1)"), false);
  assert.equal(isSafeLinkUrl("http://a.b"), false);
  assert.equal(isSafeLinkUrl("https://a.b/x"), true);
  assert.equal(isSafeLinkUrl("https://a.b/" + "x".repeat(500)), false);
});
