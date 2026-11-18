import assert from "node:assert/strict";
import { test } from "node:test";

import { adLinkUrls, channelUtm, readAttribution } from "./attribution";

const self = "marky.id";

test("channelUtm per kanal", () => {
  assert.deepEqual(channelUtm("TIKTOK_ADS"), { source: "tiktok", medium: "paid" });
  assert.deepEqual(channelUtm("OTHER"), { source: "lainnya", medium: "link" });
});

test("adLinkUrls memuat t dan utm", () => {
  const u = adLinkUrls({ origin: "https://marky.id", username: "ayu", slug: "promo-ig", channel: "IG_BIO" });
  assert.equal(u.short, "https://marky.id/ayu?t=promo-ig");
  assert.equal(u.full, "https://marky.id/ayu?t=promo-ig&utm_source=instagram&utm_medium=bio&utm_campaign=promo-ig");
});

test("readAttribution membuang referrer sendiri dan memotong utm", () => {
  const url = new URL(`https://marky.id/ayu?t=promo-ig&utm_source=${"a".repeat(100)}`);
  const a = readAttribution(url, "https://marky.id/x", self);
  assert.equal(a.referrerHost, null);
  assert.equal(a.utmSource?.length, 64);
  assert.equal(a.adLinkSlug, "promo-ig");
});

test("readAttribution: referrer hanya host, slug buruk jadi null", () => {
  const a = readAttribution(new URL("https://marky.id/ayu?t=A!"), "https://l.instagram.com/path?q=1", self);
  assert.equal(a.referrerHost, "l.instagram.com");
  assert.equal(a.adLinkSlug, null);
  assert.equal(readAttribution(new URL("https://marky.id/a"), "bukan url", self).referrerHost, null);
  assert.equal(readAttribution(new URL("https://marky.id/a"), "http://[::1]/", self).referrerHost, null);
  assert.equal(readAttribution(new URL("https://marky.id/a"), null, self).utmMedium, null);
});

test("readAttribution: utm_source/medium huruf kecil, campaign apa adanya", () => {
  const a = readAttribution(new URL("https://marky.id/a?utm_source=%20Instagram%20&utm_medium=BIO&utm_campaign=%20Promo%20"), null, self);
  assert.equal(a.utmSource, "instagram");
  assert.equal(a.utmMedium, "bio");
  assert.equal(a.utmCampaign, "Promo");
});

test("readAttribution: userinfo dan port tidak ikut referrerHost", () => {
  const a = readAttribution(new URL("https://marky.id/a"), "https://user:pass@L.Instagram.com:8443/x", self);
  assert.equal(a.referrerHost, "l.instagram.com");
});
