import assert from "node:assert/strict";
import { test } from "node:test";

import { pixelSnippets } from "./pixel-snippets";

test("ID valid masuk lewat JSON.stringify; Meta mematikan autoConfig", () => {
  const s = pixelSnippets({ meta: "1234567890123456", tiktok: "ABCDEFGHIJ0123456789", ga4: "G-ABC123XYZ" });
  assert.ok(s.meta?.includes(`fbq('set','autoConfig',false,"1234567890123456")`));
  assert.ok(s.meta!.indexOf("fbq.disablePushState=true") < s.meta!.indexOf("fbq('init'"));
  assert.ok(s.meta!.indexOf("autoConfig") < s.meta!.indexOf("fbq('init'"));
  assert.ok(s.tiktok?.includes(`ttq.load("ABCDEFGHIJ0123456789")`));
  assert.ok(s.ga4?.includes(`gtag('config',"G-ABC123XYZ",{send_page_view:false})`));
  assert.ok(s.ga4?.includes("gtag('event','page_view')"));
});

test("ID berbahaya atau kosong dibuang", () => {
  const s = pixelSnippets({ meta: "1');alert(1);//", tiktok: '"+alert(1)+"', ga4: null });
  assert.deepEqual(s, { meta: null, tiktok: null, ga4: null });
  assert.equal(pixelSnippets({ ga4: "G-ABC');//" }).ga4, null);
});
