// react-dom/server tidak bisa dimuat di bawah --conditions=react-server (script
// test:unit), jadi yang diuji di sini aturan murni komponen. Tampilan
// diperiksa lewat Storybook (marky-mark.stories.tsx) dan browser.
import assert from "node:assert/strict";
import { test } from "node:test";

import { loaderLabel, maskIdFromReactId } from "./mark-ids";

test("maskIdFromReactId: id React jadi id yang aman untuk url(#...)", () => {
  for (const raw of [":r0:", "«r1»", "_r_2_", "R3"]) {
    const id = maskIdFromReactId(raw);
    assert.match(id, /^marky-cap-[A-Za-z0-9_-]+$/, raw);
  }
});

test("maskIdFromReactId: id React berbeda tetap berbeda", () => {
  assert.notEqual(maskIdFromReactId(":r0:"), maskIdFromReactId(":r1:"));
  assert.notEqual(maskIdFromReactId("«r1»"), maskIdFromReactId("«r10»"));
});

test("loaderLabel: tanpa label, Memuat hanya untuk pembaca layar", () => {
  assert.deepEqual(loaderLabel(undefined), { text: "Memuat", visible: false });
});

test("loaderLabel: label kustom terlihat", () => {
  assert.deepEqual(loaderLabel("Menyiapkan halaman"), { text: "Menyiapkan halaman", visible: true });
});
