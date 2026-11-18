import assert from "node:assert/strict";
import { test } from "node:test";

import { saveLinksInputSchema } from "./funnel";

const link = { label: "Lokasi", url: "https://maps.app.goo.gl/x", isVisible: true };
const input = (links: unknown[]) => ({ links, showSocialIcons: true, placement: "BEFORE_SERVICES" });

test("8 tautan diterima, 9 ditolak", () => {
  assert.equal(saveLinksInputSchema.safeParse(input(Array(8).fill(link))).success, true);
  assert.equal(saveLinksInputSchema.safeParse(input(Array(9).fill(link))).success, false);
});

test("http:// dan alamat dengan spasi ditolak", () => {
  assert.equal(saveLinksInputSchema.safeParse(input([{ ...link, url: "http://a.com" }])).success, false);
  assert.equal(saveLinksInputSchema.safeParse(input([{ ...link, url: "maps studio sekar" }])).success, false);
});

test("placement asing ditolak", () => {
  assert.equal(saveLinksInputSchema.safeParse({ ...input([link]), placement: "TOP" }).success, false);
});
