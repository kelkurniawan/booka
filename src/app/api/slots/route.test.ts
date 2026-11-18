// Tes handler GET /api/slots dan /api/slots/nearest dengan klien Supabase palsu.
import assert from "node:assert/strict";
import { test } from "node:test";

import { computeFreeSlots } from "@/lib/booking/slots";
import { fakeClient } from "@/lib/testing/fake-supabase";

import { handleNearest } from "./nearest/route";
import { handleSlots } from "./route";

const MERCHANT = "11111111-1111-4111-8111-111111111111";
const SERVICE = "22222222-2222-4222-8222-222222222222";
const MON = "2030-01-07"; // Senin, jauh di masa depan
const avail = [{ day_of_week: 1 as const, start_time: "16:00:00", end_time: "18:00:00" }];

const courtService = {
  id: SERVICE, price: "150000.00", duration_minutes: 60, party_max: null, seat_duration_minutes: null,
  court_unit_minutes: 30, court_max_minutes: 120,
};
const salonService = { ...courtService, price: "100000", court_unit_minutes: null, court_max_minutes: null };

function setup(service: unknown, merchantFound = true) {
  return fakeClient(
    {
      merchants: { data: merchantFound ? { id: MERCHANT, username: "padel", subscription_tier: "PRO" } : null },
      services: { data: service },
      availability: { data: avail },
      merchant_settings: { data: null },
    },
    {
      get_court_profiles: () => ({ data: [{ courts: [
        { id: "c1", name: "Lapangan 1", sort_order: 1, service_ids: [SERVICE] },
        { id: "c2", name: "Lapangan 2", sort_order: 2, service_ids: [SERVICE] },
      ] }] }),
      get_court_price_rules: () => ({ data: [{ day_of_week: 1, start_time: "17:00:00", end_time: "22:00:00", price_per_hour: "250000.00" }] }),
      get_court_availability: () => ({ data: [] }),
      get_booked_ranges: () => ({ data: [] }),
    },
  );
}
const req = (path: string, qs: Record<string, string>) =>
  new Request(`http://localhost${path}?${new URLSearchParams({ username: "padel", serviceId: SERVICE, ...qs })}`);
const slots = (qs: Record<string, string>, svc: unknown = courtService) => {
  const f = setup(svc);
  return { f, res: handleSlots(req("/api/slots", { date: MON, ...qs }), () => f.client as never) };
};

test("sewa: durationMinutes 60 -> 200, harga string jadi angka, unit 30 dipakai, RPC diberi id merchant dan tanggal", async () => {
  const { f, res } = slots({ durationMinutes: "60", staffId: "", party: "4" });
  const r = await res;
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.courtService, true);
  assert.deepEqual(body.durations, [60, 90, 120]);
  assert.deepEqual(body.slots.map((s: { time: string; price: number }) => [s.time, s.price]), [
    ["16:00", 150000], ["16:30", 200000], ["17:00", 250000],
  ]);
  const avail = f.rpcCalls.find((c) => c.name === "get_court_availability")!;
  assert.deepEqual(avail.args, { p_merchant_id: MERCHANT, p_service_id: SERVICE, p_date: MON });
  assert.equal(f.rpcCalls.some((c) => c.name === "get_booked_ranges"), false);
});

test("sewa: tanpa durationMinutes -> 400 duration_required; durasi 45 -> 400 duration_invalid", async () => {
  const a = await slots({}).res;
  assert.equal(a.status, 400);
  assert.equal((await a.json()).error, "duration_required");
  const b = await slots({ durationMinutes: "45" }).res;
  assert.equal(b.status, 400);
  assert.deepEqual(await b.json(), { error: "duration_invalid", message: "Lama main tidak valid untuk layanan ini." });
});

test("sewa: RPC lapangan gagal -> 500 court_load_failed", async () => {
  const f = setup(courtService);
  const fail = { ...f.client, rpc: async () => ({ data: null, error: { code: "XX000", message: "rahasia" } }) };
  const r = await handleSlots(req("/api/slots", { date: MON, durationMinutes: "60" }), () => fail as never);
  assert.equal(r.status, 500);
  const body = await r.json();
  assert.equal(body.error, "court_load_failed");
  assert.doesNotMatch(JSON.stringify(body), /rahasia/);
});

test("salon (bukan sewa): bentuk respons lama, tanpa courtService, durationMinutes diabaikan", async () => {
  const f = setup(salonService);
  const r = await handleSlots(req("/api/slots", { date: MON, durationMinutes: "999" }), () => f.client as never);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual(Object.keys(body), ["slots"]);
  const expected = computeFreeSlots({
    dateISO: MON, durationMinutes: 60, availability: avail, bookedRanges: [],
  });
  assert.deepEqual(body.slots, JSON.parse(JSON.stringify(expected)));
  assert.ok(body.slots.length > 0);
  assert.equal(f.rpcCalls.some((c) => c.name.startsWith("get_court")), false);
});

test("slots: layanan tidak ditemukan 404; parameter rusak 400; merchant tidak ada 404", async () => {
  const f = setup(null);
  assert.equal((await handleSlots(req("/api/slots", { date: MON }), () => f.client as never)).status, 404);
  assert.equal((await handleSlots(req("/api/slots", { date: "bukan" }), () => f.client as never)).status, 400);
  const g = setup(courtService, false);
  assert.equal((await handleSlots(req("/api/slots", { date: MON }), () => g.client as never)).status, 404);
});

test("nearest: layanan sewa -> 400 court_service_not_supported", async () => {
  const f = setup(courtService);
  const r = await handleNearest(req("/api/slots/nearest", {}), () => f.client as never);
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.equal(body.error, "court_service_not_supported");
  assert.match(body.message, /Layanan sewa lapangan tidak memakai jam terdekat/);
  assert.equal(f.rpcCalls.length, 0);
});

test("nearest: layanan salon tetap berjalan (200)", async () => {
  const f = setup(salonService);
  const r = await handleNearest(req("/api/slots/nearest", {}), () => f.client as never);
  assert.equal(r.status, 200);
});
