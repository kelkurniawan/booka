// Tes ekspor data merchant: tabel lapangan ikut, galat tabel baru menggagalkan ekspor, tanpa sesi 401.
import assert from "node:assert/strict";
import { before, test } from "node:test";

import { fakeClient, type FakeResult } from "@/lib/testing/fake-supabase";

import type { handleExport as HandleExport } from "./route";

let handleExport: typeof HandleExport;
before(async () => {
  ({ handleExport } = await import("./route"));
});

const COURT_TABLES = ["courts", "service_courts", "court_price_rules", "court_media", "venue_areas", "venue_markers"];

function run(user: unknown, overrides: Record<string, FakeResult> = {}) {
  const tables: Record<string, FakeResult> = {};
  for (const t of ["merchants", "merchant_profiles", "merchant_themes", "services", "service_media", "availability", "merchant_faqs", "bookings", "payment_connections", "merchant_settings", "vouchers", "merchant_banners", "dining_areas", "dining_tables", "ad_links", "merchant_links", "merchant_tracking", ...COURT_TABLES]) {
    tables[t] = { data: [{ t }] };
  }
  const selects: Record<string, string> = {};
  const { client } = fakeClient({ ...tables, ...overrides });
  const wrapped = {
    auth: { getUser: async () => ({ data: { user } }) },
    from(table: string) {
      const chain = client.from(table) as { select: (c: string) => unknown };
      const origSelect = chain.select;
      chain.select = (cols: string) => {
        selects[table] = cols;
        return origSelect(cols);
      };
      return chain;
    },
  };
  return { selects, res: handleExport(async () => wrapped as never) };
}

const USER = { id: "m1", email: "a@b.c", created_at: "2026-01-01" };

test("sukses: semua tabel lapangan ada di berkas dan bookings memuat court_id, court_name", async () => {
  const { res, selects } = run(USER);
  const r = await res;
  assert.equal(r.status, 200);
  const json = (await r.json()) as Record<string, unknown>;
  for (const t of COURT_TABLES) assert.deepEqual(json[t], [{ t }], t);
  assert.match(selects.bookings, /court_id, court_name/);
});

test("tabel lapangan gagal: 500 generik, tanpa berkas bolong", async () => {
  const { res } = run(USER, { venue_markers: { data: null, error: { code: "42501", message: "raw" } } });
  const r = await res;
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { error: "Gagal menyiapkan ekspor. Coba lagi beberapa saat." });
});

test("tanpa sesi: 401", async () => {
  const r = await run(null).res;
  assert.equal(r.status, 401);
  assert.deepEqual(await r.json(), { error: "Tidak diizinkan" });
});
