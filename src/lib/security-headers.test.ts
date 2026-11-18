import assert from "node:assert/strict";
import { test } from "node:test";

import { HEADER_RULES } from "./security-headers";

// Cukup untuk pola yang dipakai di sini: `:nama*` = apa pun, `:nama` = satu segmen.
const cocok = (source: string, path: string) =>
  new RegExp(`^${source.replace(/:\w+\*/g, ".*").replace(/:\w+/g, "[^/]+")}$`).test(path);

/** Meniru Next: aturan yang cocok diterapkan berurutan, yang terakhir menang. */
function efektif(path: string, key: string): string | undefined {
  let nilai: string | undefined;
  for (const r of HEADER_RULES) {
    if (!cocok(r.source, path)) continue;
    for (const h of r.headers) if (h.key === key) nilai = h.value;
  }
  return nilai;
}

test("Referrer-Policy: no-referrer untuk /pesanan dan terima-kasih, bawaan untuk halaman lain", () => {
  assert.equal(efektif("/pesanan/abc", "Referrer-Policy"), "no-referrer");
  assert.equal(efektif("/salon/terima-kasih", "Referrer-Policy"), "no-referrer");
  assert.equal(efektif("/salon", "Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(efektif("/salon", "X-Frame-Options"), "DENY");
  assert.equal(efektif("/pesanan/abc", "X-Frame-Options"), "DENY");
});
