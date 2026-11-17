import assert from "node:assert/strict";
import test from "node:test";

import type { MerchantTheme } from "@/types/database";

import { themeToCssVars } from "./css";
import { resolveTheme } from "./resolve";

const BARIS: MerchantTheme = {
  merchant_id: "m1", preset: "BERSIH", accent: null, background_style: "SOLID",
  background_color: null, background_image_path: null, background_overlay: 45,
  font_pair: null, text_scale: "SEDANG", corner_style: null, logo_path: null,
  cover_path: null, button_style: "FILLED", section_order: ["PROMO", "SERVICES", "FAQ"],
  hidden_sections: [], background_motion: "BENTUK", background_motion_speed: "SLOW",
  created_at: "2026-08-20T00:00:00Z", updated_at: "2026-08-20T00:00:00Z",
};

test("memancarkan token shadcn yang dibaca komponen", () => {
  const vars = themeToCssVars(resolveTheme("PRO", null)) as Record<string, string>;
  assert.equal(vars["--background"], "#ffffff");
  assert.equal(vars["--foreground"], "#252525");
  assert.equal(vars["--radius"], "0.625rem");
  assert.equal(vars["--font-sans"], "var(--font-plus-jakarta)");
});

test("skala teks menggeser seluruh token ukuran secara proporsional", () => {
  const sedang = themeToCssVars(resolveTheme("PRO", null)) as Record<string, string>;
  assert.equal(sedang["--text-base"], "1rem");

  const besar = themeToCssVars({
    ...resolveTheme("PRO", null),
    textScale: "BESAR",
    scale: 1.125,
  }) as Record<string, string>;
  assert.equal(besar["--text-base"], "1.125rem");
  assert.equal(besar["--text-sm"], "0.984375rem");
});

test("overlay hanya dipancarkan saat background berupa gambar", () => {
  const solid = themeToCssVars(resolveTheme("PRO", null)) as Record<string, string>;
  assert.equal(solid["--page-overlay"], undefined);
});

test("variabel tombol selalu ada; variabel gerak hanya untuk MOTION", () => {
  const solid = themeToCssVars(resolveTheme("PRO", null)) as Record<string, string>;
  assert.ok(solid["--button-bg"]);
  assert.equal(solid["--motion-base"], undefined);

  const baris = (speed: "SLOW" | "NORMAL") =>
    themeToCssVars(
      resolveTheme("PRO", { ...BARIS, background_style: "MOTION", background_motion_speed: speed }),
    ) as Record<string, string>;
  assert.equal(baris("SLOW")["--motion-factor"], "1.5");
  assert.ok(baris("SLOW")["--motion-a"]);
  assert.equal(baris("NORMAL")["--motion-factor"], "1");
});
