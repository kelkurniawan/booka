import assert from "node:assert/strict";
import test from "node:test";

import { sampleTheme } from "@/components/booking-page/fixtures";

import { buttonContrastMessage } from "./contrast";

test("FILLED tidak disesuaikan", () => {
  const r = buttonContrastMessage(sampleTheme("BERSIH"));
  assert.equal(r.adjusted, false);
  assert.ok(r.message.startsWith("Teks tombol terbaca jelas (kontras "));
  assert.ok(r.message.includes(":1). Lolos standar WCAG AA."));
});

test("aksen pucat OUTLINE di latar terang: teks lebih gelap", () => {
  const r = buttonContrastMessage(sampleTheme("BERSIH", { button_style: "OUTLINE", accent: "#ffe600" }));
  assert.equal(r.adjusted, true);
  assert.ok(r.message.includes("lebih gelap"));
});

test("aksen gelap OUTLINE di latar gelap: teks lebih terang", () => {
  const r = buttonContrastMessage(sampleTheme("MALAM", { button_style: "OUTLINE", accent: "#1f5c45" }));
  assert.ok(r.message.includes("lebih terang"));
});
