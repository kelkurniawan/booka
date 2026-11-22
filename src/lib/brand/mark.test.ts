import assert from "node:assert/strict";
import { test } from "node:test";

import { INK_HEX, MARK_PATH, PAPER_HEX, markDataUri, markSvg } from "./mark";

test("markSvg: memuat path m dan rect cap yang dimiringkan", () => {
  const svg = markSvg({});
  assert.match(svg, /viewBox="0 0 100 100"/);
  assert.ok(svg.includes(MARK_PATH));
  assert.match(svg, /rotate\(-8 50 50\)/);
  assert.match(svg, new RegExp(`fill="${INK_HEX}"`));
});

test("markSvg: maskId berbeda menghasilkan id mask berbeda", () => {
  assert.match(markSvg({ maskId: "a" }), /id="a"/);
  assert.match(markSvg({ maskId: "b" }), /url\(#b\)/);
});

test("markSvg adaptive: warna kertas saat prefers-color-scheme dark", () => {
  const svg = markSvg({ adaptive: true });
  assert.match(svg, /@media \(prefers-color-scheme: dark\)/);
  assert.ok(svg.includes(PAPER_HEX));
});

test("markSvg tile: kotak latar lalu simbol diperkecil", () => {
  const svg = markSvg({ color: PAPER_HEX, tile: { background: INK_HEX, radius: 22, scale: 0.66 } });
  assert.match(svg, new RegExp(`<rect[^>]*rx="22"[^>]*fill="${INK_HEX}"`));
  assert.match(svg, /scale\(0\.66\)/);
});

test("markSvg size: atribut width dan height", () => {
  assert.match(markSvg({ size: 32 }), /width="32" height="32"/);
});

test("markDataUri: base64 svg", () => {
  assert.match(markDataUri({}), /^data:image\/svg\+xml;base64,/);
});
