import assert from "node:assert/strict";
import { test } from "node:test";

import { eventBodySchema, saveLinksInputSchema } from "./funnel";

const link = { label: "Lokasi", url: "https://maps.app.goo.gl/x", isVisible: true };
const input = (links: unknown[]) => ({ links, showSocialIcons: true, publicWhatsapp: false, placement: "BEFORE_SERVICES" });

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

test("kejadian menerima id merchant bukan UUID v4 (data contoh di produksi)", () => {
  const nullAttr = { adLinkSlug: null, utmSource: null, utmMedium: null, utmCampaign: null, referrerHost: null };
  const ok = eventBodySchema.safeParse({
    merchantId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    sessionId: "7fab73c9-74bb-4c35-b8ec-1e4bff131f0e",
    kind: "VIEW",
    attribution: nullAttr,
  });
  assert.equal(ok.success, true);
  assert.equal(eventBodySchema.safeParse({ merchantId: "bukan-id", sessionId: "x", kind: "VIEW", attribution: nullAttr }).success, false);
});
