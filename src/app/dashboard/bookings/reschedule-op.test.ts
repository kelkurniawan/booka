import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeClient } from "@/lib/testing/fake-supabase";

import { courtsFromLinks, rescheduleBookingOp } from "./reschedule-op";

const ID = "5f0c4d3e-1b2a-4c5d-8e9f-0a1b2c3d4e5f";
const COURT = "6f0c4d3e-1b2a-4c5d-8e9f-0a1b2c3d4e5f";
const START = "2030-01-07T09:30:00.000Z";
const ok = { reschedule_booking_by_merchant: () => ({ data: null }) };

test("meneruskan p_court_id ke reschedule_booking_by_merchant", async () => {
  const f = fakeClient({}, ok);
  assert.deepEqual(await rescheduleBookingOp(f.client as never, ID, START, COURT), { ok: true });
  assert.deepEqual(f.rpcCalls[0], {
    name: "reschedule_booking_by_merchant",
    args: { p_booking_id: ID, p_new_start: START, p_court_id: COURT },
  });
});

test("tanpa lapangan tujuan: p_court_id null (perilaku lama)", async () => {
  const f = fakeClient({}, ok);
  await rescheduleBookingOp(f.client as never, ID, START);
  assert.equal(f.rpcCalls[0].args.p_court_id, null);
});

for (const [code, re] of [
  ["BK070", /Lapangan yang dipilih tidak tersedia/],
  ["BK072", /Semua lapangan penuh/],
  ["BK001", /di luar jam buka/],
  ["BK036", /3 kali/],
  ["BK034", /tidak bisa dijadwal ulang/],
  ["23P01", /sudah terisi/],
  ["P0006", /sudah lewat/],
  ["XX999", /^Gagal menyimpan\. Coba lagi\.$/],
] as const) {
  test(`${code} dari RPC jadi pesan Indonesia tanpa teks mentah`, async () => {
    const f = fakeClient({}, { reschedule_booking_by_merchant: () => ({ data: null, error: { code, message: "rahasia" } }) });
    const r = await rescheduleBookingOp(f.client as never, ID, START, COURT);
    assert.equal(r.ok, false);
    assert.match(r.message!, re);
    assert.doesNotMatch(r.message!, /rahasia/);
  });
}

test("input tidak valid ditolak sebelum RPC", async () => {
  const f = fakeClient({}, ok);
  for (const [id, s, c] of [["x", START, null], [ID, "besok", null], [ID, START, "bukan-uuid"]] as const) {
    assert.deepEqual(await rescheduleBookingOp(f.client as never, id, s, c), { ok: false, message: "Jadwal tidak valid." });
  }
  assert.equal(f.rpcCalls.length, 0);
});

test("courtsFromLinks: hanya aktif, urut sort_order lalu nama, join objek atau larik", () => {
  const c = (id: string, name: string, sort_order: number, is_active = true) => ({ id, name, sort_order, is_active });
  assert.deepEqual(
    courtsFromLinks([
      { courts: c("b", "Lapangan B", 2) },
      { courts: [c("a", "Lapangan A", 1)] },
      { courts: c("x", "Nonaktif", 0, false) },
      { courts: null },
      { courts: c("c", "Lapangan C", 2) },
    ]),
    [{ id: "a", name: "Lapangan A" }, { id: "b", name: "Lapangan B" }, { id: "c", name: "Lapangan C" }],
  );
});
