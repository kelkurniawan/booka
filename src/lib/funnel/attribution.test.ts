import assert from "node:assert/strict";
import { test } from "node:test";

import { adLinkUrls, channelUtm, readAttribution, slugifyAdLink, uniqueSlug } from "./attribution";

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

test("slugifyAdLink: ASCII kecil, spasi jadi strip, akhiran kanal", () => {
  assert.equal(slugifyAdLink("Iklan TikTok wisuda Desember", "TIKTOK_ADS"), "iklan-tiktok-wisuda-desember-tt");
  assert.equal(slugifyAdLink("  Promo   Café!! ", "WA_STATUS"), "promo-cafe-wa");
});

test("slugifyAdLink: nama kosong atau terlalu panjang tetap lolos pola slug", () => {
  assert.equal(slugifyAdLink("!!!", "IG_BIO"), "tautan-ig");
  for (const n of ["x".repeat(100), "a b ".repeat(30), "é"]) {
    for (const c of ["IG_BIO", "META_ADS", "TIKTOK_ADS", "WA_STATUS", "OTHER"] as const) {
      assert.match(slugifyAdLink(n, c), /^[a-z0-9-]{3,40}$/);
    }
  }
});

test("uniqueSlug menambah -2, -3 dan tetap muat 40 karakter", () => {
  assert.equal(uniqueSlug("promo-ig", new Set()), "promo-ig");
  assert.equal(uniqueSlug("promo-ig", new Set(["promo-ig"])), "promo-ig-2");
  assert.equal(uniqueSlug("promo-ig", new Set(["promo-ig", "promo-ig-2"])), "promo-ig-3");
  const long = "a".repeat(40);
  const u = uniqueSlug(long, new Set([long]));
  assert.equal(u.length, 40);
  assert.ok(u.endsWith("-2"));
});
