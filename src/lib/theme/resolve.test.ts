import assert from "node:assert/strict";
import test from "node:test";

import type { MerchantTheme } from "@/types/database";

import { contrastRatio } from "./color";
import { THEME_PRESETS } from "./presets";
import { resolveTheme } from "./resolve";

function baris(ubah: Partial<MerchantTheme> = {}): MerchantTheme {
  return {
    merchant_id: "m1",
    preset: "BERSIH",
    accent: null,
    background_style: "SOLID",
    background_color: null,
    background_image_path: null,
    background_overlay: 45,
    font_pair: null,
    text_scale: "SEDANG",
    corner_style: null,
    created_at: "2026-08-20T00:00:00Z",
    updated_at: "2026-08-20T00:00:00Z",
    ...ubah,
  };
}

test("tanpa baris tema: jatuh ke preset BERSIH", () => {
  const tema = resolveTheme("PRO", null);
  assert.equal(tema.preset, "BERSIH");
  assert.equal(tema.background, THEME_PRESETS.BERSIH.background);
  assert.equal(tema.colorMode, "TERANG");
});

test("null pada font_pair dan corner_style berarti ikut preset", () => {
  const tema = resolveTheme("PRO", baris({ preset: "ELEGAN" }));
  assert.equal(tema.fontPair, THEME_PRESETS.ELEGAN.fontPair);
  assert.equal(tema.radius, "0rem");
});

test("preset gelap menghasilkan colorMode GELAP", () => {
  assert.equal(resolveTheme("PRO", baris({ preset: "MALAM" })).colorMode, "GELAP");
  assert.equal(resolveTheme("PRO", baris({ preset: "ELEGAN" })).colorMode, "GELAP");
  assert.equal(resolveTheme("PRO", baris({ preset: "HANGAT" })).colorMode, "TERANG");
});

test("STARTER dipangkas ke preset gratis dan nilai netral", () => {
  const tema = resolveTheme(
    "STARTER",
    baris({
      preset: "ELEGAN",
      accent: "#ff0000",
      background_style: "IMAGE",
      background_image_path: "m1/bg.webp",
      font_pair: "KLASIK",
      text_scale: "BESAR",
    }),
  );
  assert.equal(tema.preset, "BERSIH");
  assert.equal(tema.backgroundStyle, "SOLID");
  assert.equal(tema.backgroundImagePath, null);
  assert.equal(tema.fontPair, THEME_PRESETS.BERSIH.fontPair);
  assert.equal(tema.textScale, "SEDANG");
  assert.equal(tema.accentFill, THEME_PRESETS.BERSIH.accent);
});

test("STARTER tetap boleh memakai preset gratis dan gaya sudut", () => {
  const tema = resolveTheme(
    "STARTER",
    baris({ preset: "MALAM", corner_style: "BULAT" }),
  );
  assert.equal(tema.preset, "MALAM");
  assert.equal(tema.radius, "1.25rem");
});

test("aksen yang tidak terbaca digelapkan untuk teks, tapi utuh untuk isian", () => {
  const tema = resolveTheme("PRO", baris({ preset: "BERSIH", accent: "#ffe600" }));
  assert.equal(tema.accentFill, "#ffe600");
  assert.ok(contrastRatio(tema.accentText, tema.background) >= 4.5);
  assert.equal(tema.accentForeground, "#111111");
});

test("background pilihan sendiri tetap menghasilkan teks yang kontras", () => {
  const tema = resolveTheme(
    "PRO",
    baris({ preset: "BERSIH", background_color: "#101010" }),
  );
  assert.equal(tema.colorMode, "GELAP");
  assert.ok(contrastRatio(tema.foreground, tema.background) >= 4.5);
});

test("background bergambar memaksa overlay minimal 40", () => {
  const tema = resolveTheme(
    "PRO",
    baris({
      preset: "BERSIH",
      background_style: "IMAGE",
      background_image_path: "m1/bg.webp",
      background_overlay: 5,
    }),
  );
  assert.equal(tema.backgroundOverlay, 40);
  assert.equal(tema.backgroundImagePath, "m1/bg.webp");
});

test("background bergambar tanpa path jatuh kembali ke SOLID", () => {
  const tema = resolveTheme(
    "PRO",
    baris({ preset: "BERSIH", background_style: "IMAGE", background_image_path: null }),
  );
  assert.equal(tema.backgroundStyle, "SOLID");
});

test("skala teks dipetakan ke pengali", () => {
  assert.equal(resolveTheme("PRO", baris({ text_scale: "KECIL" })).scale, 0.9375);
  assert.equal(resolveTheme("PRO", baris({ text_scale: "SEDANG" })).scale, 1);
  assert.equal(resolveTheme("PRO", baris({ text_scale: "BESAR" })).scale, 1.125);
});
