import assert from "node:assert/strict";
import test from "node:test";

import {
  contrastRatio,
  ensureContrast,
  hexToRgb,
  isDark,
  mixHex,
  readableOn,
  relativeLuminance,
  rgbToHex,
} from "./color";

test("hexToRgb dan rgbToHex saling membalik", () => {
  assert.deepEqual(hexToRgb("#1a2b3c"), { r: 26, g: 43, b: 60 });
  assert.equal(rgbToHex({ r: 26, g: 43, b: 60 }), "#1a2b3c");
});

test("relativeLuminance: putih 1, hitam 0", () => {
  assert.equal(relativeLuminance("#ffffff"), 1);
  assert.equal(relativeLuminance("#000000"), 0);
});

test("contrastRatio: putih di atas hitam adalah 21:1", () => {
  assert.equal(Math.round(contrastRatio("#ffffff", "#000000")), 21);
  assert.equal(contrastRatio("#ffffff", "#ffffff"), 1);
});

test("ensureContrast menggelapkan warna terang di atas latar terang", () => {
  // Kuning cerah di atas putih: rasio aslinya sekitar 1.07:1, tidak terbaca.
  const hasil = ensureContrast("#ffe600", "#ffffff", 4.5);
  assert.ok(
    contrastRatio(hasil, "#ffffff") >= 4.5,
    `rasio hasil hanya ${contrastRatio(hasil, "#ffffff")}`,
  );
  assert.ok(isDark(hasil), "warna hasil harus lebih gelap dari aslinya");
});

test("ensureContrast mencerahkan warna gelap di atas latar gelap", () => {
  const hasil = ensureContrast("#1f3a5f", "#111111", 4.5);
  assert.ok(contrastRatio(hasil, "#111111") >= 4.5);
});

test("ensureContrast membiarkan warna yang kontrasnya sudah cukup", () => {
  assert.equal(ensureContrast("#111111", "#ffffff", 4.5), "#111111");
});

test("readableOn memilih teks gelap di atas latar terang dan sebaliknya", () => {
  assert.equal(readableOn("#ffe600"), "#111111");
  assert.equal(readableOn("#1a1a1c"), "#ffffff");
});

test("mixHex bergerak dari warna pertama ke warna kedua", () => {
  assert.equal(mixHex("#000000", "#ffffff", 0), "#000000");
  assert.equal(mixHex("#000000", "#ffffff", 1), "#ffffff");
  assert.equal(mixHex("#000000", "#ffffff", 0.5), "#808080");
});
