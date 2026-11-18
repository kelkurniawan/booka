import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeClient } from "@/lib/testing/fake-supabase";

import { createManualBookingOp } from "./manual-booking-op";

const COURT = "6f0c4d3e-1b2a-4c5d-8e9f-0a1b2c3d4e5f";
const input = {
  serviceId: "5f0c4d3e-1b2a-4c5d-8e9f-0a1b2c3d4e5f",
  staffId: null,
  startISO: "2030-01-07T09:30:00.000Z",
  customerName: "Budi",
  customerWhatsapp: "081234567890",
  courtId: COURT,
  durationMinutes: 90,
};

test("meneruskan p_court_id dan p_duration_minutes ke create_manual_booking dan mengembalikan id", async () => {
  const f = fakeClient({}, { create_manual_booking: () => ({ data: [{ id: "bk-1" }] }) });
  assert.deepEqual(await createManualBookingOp(f.client as never, input), { ok: true, id: "bk-1" });
  assert.equal(f.rpcCalls.length, 1);
  assert.equal(f.rpcCalls[0].name, "create_manual_booking");
  assert.equal(f.rpcCalls[0].args.p_court_id, COURT);
  assert.equal(f.rpcCalls[0].args.p_duration_minutes, 90);
  assert.equal(f.rpcCalls[0].args.p_staff_id, null);
});

test("Mana saja: p_court_id null; layanan non-sewa: durasi null", async () => {
  const f = fakeClient({}, { create_manual_booking: () => ({ data: [{ id: "bk-2" }] }) });
  await createManualBookingOp(f.client as never, { ...input, courtId: null });
  await createManualBookingOp(f.client as never, { ...input, courtId: undefined, durationMinutes: undefined });
  assert.equal(f.rpcCalls[0].args.p_court_id, null);
  assert.equal(f.rpcCalls[1].args.p_court_id, null);
  assert.equal(f.rpcCalls[1].args.p_duration_minutes, null);
});

for (const [code, re] of [
  ["BK070", /Lapangan yang dipilih tidak tersedia/],
  ["BK071", /Lama main tidak valid/],
  ["BK072", /Semua lapangan penuh/],
  ["23P01", /sudah terisi/],
  ["42501", /tidak punya akses/],
] as const) {
  test(`${code} dari RPC menjadi pesan Indonesia tanpa teks mentah`, async () => {
    const f = fakeClient({}, { create_manual_booking: () => ({ data: null, error: { code, message: "rahasia skema" } }) });
    const r = await createManualBookingOp(f.client as never, input);
    assert.equal(r.ok, false);
    assert.match((r as { message: string }).message, re);
    assert.doesNotMatch((r as { message: string }).message, /rahasia/);
  });
}

test("input tidak valid ditolak sebelum RPC; hasil kosong tanpa error -> pesan umum", async () => {
  const f = fakeClient({}, { create_manual_booking: () => ({ data: [] }) });
  assert.deepEqual(await createManualBookingOp(f.client as never, { ...input, serviceId: "x" }), { ok: false, message: "Periksa lagi isian form." });
  assert.equal(f.rpcCalls.length, 0);
  const r = await createManualBookingOp(f.client as never, input);
  assert.equal(r.ok, false);
});
