import assert from "node:assert/strict";
import { test } from "node:test";

import { linkHost, linkIconFor } from "./link-icon";

test("linkIconFor memilih ikon dari host", () => {
  const cases: [string, string][] = [
    ["https://www.instagram.com/sekar", "instagram"],
    ["https://tiktok.com/@sekar", "tiktok"],
    ["https://wa.me/62812", "whatsapp"],
    ["https://maps.app.goo.gl/abc", "maps"],
    ["https://www.google.com/maps/place/x", "maps"],
    ["https://drive.google.com/file/d/1", "drive"],
    ["https://contoh.id/harga", "link"],
    ["https://google.com/search?q=maps", "link"],
    ["bukan url", "link"],
  ];
  for (const [url, icon] of cases) assert.equal(linkIconFor(url), icon, url);
});

test("linkHost membuang www", () => {
  assert.equal(linkHost("https://www.contoh.id/x"), "contoh.id");
  assert.equal(linkHost("rusak"), "");
});
