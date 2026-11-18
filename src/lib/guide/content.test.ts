import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CHECKLIST_COPY, GUIDE_PAGES } from "./content";
import { CHECKLIST_ORDER, GUIDE_PAGE_KEYS } from "./guide";

const strings = (v: unknown): string[] =>
  typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];

describe("isi panduan", () => {
  it("setiap halaman dan langkah punya isi", () => {
    assert.deepEqual(Object.keys(GUIDE_PAGES).sort(), [...GUIDE_PAGE_KEYS].sort());
    assert.deepEqual(Object.keys(CHECKLIST_COPY).sort(), [...CHECKLIST_ORDER].sort());
    for (const [key, page] of Object.entries(GUIDE_PAGES)) {
      assert.ok(page.points.length >= 3 && page.points.length <= 7, key);
      assert.ok(page.tour.length > 0, key);
      if (key !== "today") assert.equal(page.tour[0].target, null, `${key}: langkah pertama ringkasan`);
    }
  });
  it("tanpa video karangan", () => {
    for (const page of Object.values(GUIDE_PAGES)) assert.equal(page.video, null);
  });
  it("tanpa karakter terlarang DESIGN.md dan tanpa URL", () => {
    for (const s of strings({ GUIDE_PAGES, CHECKLIST_COPY })) {
      assert.doesNotMatch(s, /[—–·→✓✕]|https?:\/\/|\bmenit\b/, s);
    }
  });
  it("kunci halaman sama dengan constraint migration", () => {
    const sql = readFileSync("supabase/migrations/20261125000500_guide_funnel_pages.sql", "utf8");
    const list = sql.match(/tours_seen <@ array\[([^\]]+)\]/)?.[1] ?? "";
    assert.deepEqual([...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort(), [...GUIDE_PAGE_KEYS].sort());
  });
  it("setiap target tur terpasang di kode aplikasi", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(p) && !/\.stories\.tsx$/.test(p) ? [p] : [];
      });
    const source = walk("src").map((p) => readFileSync(p, "utf8")).join("\n");
    const targets = new Set(
      Object.values(GUIDE_PAGES).flatMap((p) => p.tour.flatMap((s) => (s.target ? [s.target] : []))),
    );
    // Menerima data-tour="x", data-tour={"x"}, dan properti tour: "x" / tour="x" (item nav yang dirender dari larik).
    for (const t of targets) {
      assert.match(source, new RegExp(`tour\\s*[=:]\\s*\\{?["']${t}["']`), `target "${t}" tidak ditemukan`);
    }
  });
});
