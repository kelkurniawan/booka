// Tes handler POST /api/bookings: pemetaan error RPC lapangan dan argumen create_booking.
import assert from "node:assert/strict";
import { before, test } from "node:test";

import { fakeClient } from "@/lib/testing/fake-supabase";

import type { handleBooking as HandleBooking } from "./route";

let handleBooking: typeof HandleBooking;
before(async () => {
  ({ handleBooking } = await import("./route"));
});

const SERVICE = "22222222-2222-4222-8222-222222222222";
const COURT = "33333333-3333-4333-8333-333333333333";
const body = {
  username: "padel", serviceId: SERVICE, startUtc: "2030-01-07T10:00:00.000Z",
  customer_name: "Budi", customer_whatsapp: "081234567890", courtId: COURT, durationMinutes: 90,
};
const post = (b: unknown) => new Request("http://localhost/api/bookings", { method: "POST", body: JSON.stringify(b) });

function run(b: unknown, rpcError?: { code: string }, bookingRow?: Record<string, unknown>) {
  const f = fakeClient(
    { merchants: { data: { id: "m1" } }, services: { data: { id: SERVICE } }, ad_links: { data: null } },
    {
      check_booking_rate_limit: () => ({ data: true }),
      create_booking: () => (rpcError ? { data: null, error: rpcError } : { data: bookingRow ? [bookingRow] : [] }),
    },
  );
  const scheduled: unknown[] = [];
  const res = handleBooking(post(b), {
    createClient: () => f.client as never,
    findProvider: async () => null,
    schedule: (t) => scheduled.push(t),
    ipHash: () => "h",
  });
  return { f, res, scheduled };
}

test("courtId dan durationMinutes diteruskan sebagai p_court_id dan p_duration_minutes", async () => {
  const { f, res } = run(body, { code: "BK070" });
  await res;
  const call = f.rpcCalls.find((c) => c.name === "create_booking")!;
  assert.equal(call.args.p_court_id, COURT);
  assert.equal(call.args.p_duration_minutes, 90);
  assert.equal(call.args.p_merchant_id, "m1");
});

test("Mana saja (courtId null) dan layanan biasa: kedua argumen null", async () => {
  const { f, res } = run({ ...body, courtId: null, durationMinutes: null }, { code: "BK070" });
  await res;
  const call = f.rpcCalls.find((c) => c.name === "create_booking")!;
  assert.equal(call.args.p_court_id, null);
  assert.equal(call.args.p_duration_minutes, null);
});

test("error RPC lapangan menjadi status, code, dan pesan yang benar", async () => {
  const cases: [string, number, string][] = [
    ["BK070", 409, "Lapangan yang dipilih tidak tersedia. Pilih lapangan lain atau Mana saja."],
    ["BK071", 422, "Lama main tidak valid untuk layanan ini."],
    ["BK072", 409, "Semua lapangan penuh untuk lama main ini di tanggal ini. Coba lama main lebih singkat atau pilih tanggal lain."],
    ["23P01", 409, "Jam tersebut baru saja dipesan orang lain, silakan pilih jadwal lain."],
  ];
  for (const [code, status, message] of cases) {
    const r = await run(body, { code }).res;
    assert.equal(r.status, status, code);
    assert.deepEqual(await r.json(), { error: message, code });
  }
});

test("error tak dikenal -> 500 generik tanpa code dan tanpa teks mentah", async () => {
  const r = await run(body, { code: "PGRST202" }).res;
  assert.equal(r.status, 500);
  const json = await r.json();
  assert.equal(json.error, "Gagal membuat booking, silakan coba lagi.");
  assert.equal(json.code, undefined);
});

test("sukses (CONFIRMED): 201, notifikasi dijadwalkan, tanpa charge", async () => {
  const { res, scheduled } = run(body, undefined, {
    id: "b1", status: "CONFIRMED", access_token: "tok", pixel_event_id: "px", amount_due_now: "0", amount_due_on_site: "225000",
  });
  const r = await res;
  assert.equal(r.status, 201);
  const json = await r.json();
  assert.equal(json.bookingId, "b1");
  assert.equal(json.value, 225000);
  assert.equal(scheduled.length, 1);
});

test("body rusak -> 400; layanan tidak aktif -> 404; durasi di luar batas -> 400", async () => {
  const bad = await handleBooking(new Request("http://localhost/api/bookings", { method: "POST", body: "{" }));
  assert.equal(bad.status, 400);
  assert.equal((await run({ ...body, durationMinutes: 10 }).res).status, 400);
  const f = fakeClient({ merchants: { data: { id: "m1" } }, services: { data: null } });
  const r = await handleBooking(post(body), { createClient: () => f.client as never, findProvider: async () => null, schedule: () => {}, ipHash: () => "h" });
  assert.equal(r.status, 404);
});
