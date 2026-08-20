import assert from "node:assert/strict";
import test from "node:test";

import { themeToCssVars } from "./css";
import { resolveTheme } from "./resolve";

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
