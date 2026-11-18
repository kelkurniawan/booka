import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\./.test(name) ? [p] : [];
  });
}

// Pixel mengirim URL halaman; /pesanan/[token] memuat token akses.
test("tidak ada import pixel di src/app/pesanan dan src/app/dashboard", () => {
  const bad = ["src/app/pesanan", "src/app/dashboard"]
    .flatMap((d) => sources(join(process.cwd(), d)))
    .filter((f) => /pixel-(scripts|snippets)/.test(readFileSync(f, "utf8")));
  assert.deepEqual(bad, []);
});

// Navigasi klien ke/dari /pesanan membuat pixel melihat URL bertoken: harus dokumen penuh.
test("pesanan tidak menaut ke halaman merchant lewat Link/router", () => {
  const bad = sources(join(process.cwd(), "src/app/pesanan")).filter((f) => {
    const src = readFileSync(f, "utf8");
    return /<Link[^>]*merchantPage/.test(src) || /router\.push\([^)]*merchantPage/.test(src) || /<Link[^>]*thankYou/.test(src);
  });
  assert.deepEqual(bad, []);
});

test("booking-flow memakai location.assign untuk bookingUrl", () => {
  const src = readFileSync(join(process.cwd(), "src/app/[username]/booking-flow.tsx"), "utf8");
  assert.ok(src.includes("window.location.assign(checkout.bookingUrl)"));
  assert.ok(!/router\.(push|replace)\(checkout\.bookingUrl/.test(src));
});
