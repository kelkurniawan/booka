import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COURT_API_ERRORS,
  courtApiError,
  courtSlotsResponse,
  isCourtService,
  loadCourtData,
  loadCourtVenue,
  type CourtData,
  type CourtServiceInfo,
} from "./court-loader";

const MON = "2026-11-23"; // Senin
const service: CourtServiceInfo = { price: 150000, court_unit_minutes: 30, court_max_minutes: 120, duration_minutes: 60 };
const availability = [{ day_of_week: 1 as const, start_time: "16:00:00", end_time: "18:00:00" }];
const now = new Date("2026-11-20T00:00:00Z");
const data = (booked: CourtData["booked"] = []): CourtData => ({
  courts: [
    { id: "c1", name: "Lapangan 1", sortOrder: 1 },
    { id: "c2", name: "Lapangan 2", sortOrder: 2 },
  ],
  rules: [{ dayOfWeek: 1, start: "17:00", end: "22:00", pricePerHour: 250000 }],
  booked,
});
const run = (durationRaw: string | null, d: CourtData | Error = data(), svc = service) =>
  courtSlotsResponse({
    service: svc, availability, dateISO: MON, durationRaw, now,
    load: async () => {
      if (d instanceof Error) throw d;
      return d;
    },
  });

test("sewa tanpa durationMinutes -> 400 duration_required dengan pesan Indonesia", async () => {
  for (const raw of [null, "", "  "]) {
    const res = await run(raw);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "duration_required", message: COURT_API_ERRORS.duration_required.message });
  }
});

test("durasi tidak valid -> 400 duration_invalid (bukan kelipatan, di luar batas, bukan angka)", async () => {
  for (const raw of ["45", "30", "150", "abc", "60.5"]) {
    const res = await run(raw);
    assert.equal(res.status, 400, raw);
    assert.deepEqual(await res.json(), { error: "duration_invalid", message: "Lama main tidak valid untuk layanan ini." });
  }
});

test("gagal memuat data lapangan -> 500 court_load_failed tanpa detail mentah", async () => {
  const res = await run("60", new Error("connection refused 10.0.0.5"));
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.error, "court_load_failed");
  assert.equal(body.message, "Gagal memuat jadwal lapangan.");
  assert.doesNotMatch(JSON.stringify(body), /10\.0\.0\.5/);
});

test("sukses: bentuk respons, harga jam ramai, durasi", async () => {
  const res = await run("60");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.courtService, true);
  assert.deepEqual(body.durations, [60, 90, 120]);
  assert.deepEqual(body.courts, [{ id: "c1", name: "Lapangan 1" }, { id: "c2", name: "Lapangan 2" }]);
  // 16:00-17:00 dasar, 17:00-18:00 ramai; 16:00 + 60 menit tidak melewati batas.
  const by = new Map(body.slots.map((s: { time: string }) => [s.time, s]));
  assert.deepEqual(by.get("16:00"), {
    time: "16:00", start: "2026-11-23T09:00:00.000Z", full: false, freeCount: 2, price: 150000,
    courts: [{ id: "c1", name: "Lapangan 1" }, { id: "c2", name: "Lapangan 2" }],
  });
  assert.equal((by.get("16:30") as { price: number }).price, 200000); // 30 dasar + 30 ramai
  assert.equal((by.get("17:00") as { price: number }).price, 250000);
});

test("slot penuh: full true, freeCount 0, courts kosong, harga tetap", async () => {
  const both = ["c1", "c2"].map((courtId) => ({
    courtId, start_datetime: `${MON}T17:00:00+07:00`, end_datetime: `${MON}T18:00:00+07:00`,
  }));
  const body = await (await run("60", data(both))).json();
  const s = body.slots.find((x: { time: string }) => x.time === "17:00");
  assert.equal(s.full, true);
  assert.equal(s.freeCount, 0);
  assert.deepEqual(s.courts, []);
  assert.equal(s.price, 250000);
  const free = body.slots.find((x: { time: string }) => x.time === "16:00");
  assert.equal(free.full, false);
});

test("satu lapangan terisi: freeCount 1 dan hanya lapangan kosong dicantumkan", async () => {
  const one = [{ courtId: "c1", start_datetime: `${MON}T16:00:00+07:00`, end_datetime: `${MON}T17:00:00+07:00` }];
  const body = await (await run("60", data(one))).json();
  const s = body.slots.find((x: { time: string }) => x.time === "16:00");
  assert.equal(s.freeCount, 1);
  assert.deepEqual(s.courts, [{ id: "c2", name: "Lapangan 2" }]);
});

test("nearest untuk sewa -> 400 court_service_not_supported; layanan biasa bukan sewa", async () => {
  const res = courtApiError("court_service_not_supported");
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "court_service_not_supported", message: COURT_API_ERRORS.court_service_not_supported.message });
  assert.equal(isCourtService({ court_unit_minutes: 30 }), true);
  assert.equal(isCourtService({ court_unit_minutes: null }), false);
});

test("loadCourtData: hanya lapangan terkait layanan, aturan dan rentang terpakai dipetakan", async () => {
  const calls: string[] = [];
  const rpc = async (name: string, args: Record<string, unknown>) => {
    calls.push(`${name}:${args.p_merchant_id}`);
    if (name === "get_court_profiles")
      return { error: null, data: [{ courts: [
        { id: "c1", name: "A", sort_order: 1, service_ids: ["s1"] },
        { id: "c2", name: "B", sort_order: 2, service_ids: ["lain"] },
      ] }] };
    if (name === "get_court_price_rules")
      return { error: null, data: [{ day_of_week: 1, start_time: "17:00:00", end_time: "22:00:00", price_per_hour: "250000.00" }] };
    return { error: null, data: [{ court_id: "c1", court_name: "A", start_datetime: "x", end_datetime: "y" }] };
  };
  const out = await loadCourtData({ rpc } as never, "m1", "s1", MON);
  assert.deepEqual(out.courts, [{ id: "c1", name: "A", sortOrder: 1 }]);
  assert.deepEqual(out.rules, [{ dayOfWeek: 1, start: "17:00", end: "22:00", pricePerHour: 250000 }]);
  assert.deepEqual(out.booked, [{ courtId: "c1", start_datetime: "x", end_datetime: "y" }]);
  assert.equal(calls.length, 3);
});

test("loadCourtData: error RPC dilempar", async () => {
  const rpc = async (name: string) =>
    name === "get_court_availability" ? { error: { code: "PGRST202" }, data: null } : { error: null, data: [] };
  await assert.rejects(loadCourtData({ rpc } as never, "m1", "s1", MON));
});

test("loadCourtVenue: profil, denah, dan aturan jam ramai per layanan sewa", async () => {
  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (name === "get_court_profiles")
      return { error: null, data: [{ courts: [{ id: "c1" }], areas: [{ id: "a1" }], markers: [{ id: "k1" }] }] };
    assert.equal(name, "get_court_price_rules");
    return {
      error: null,
      data: [{ day_of_week: 1, start_time: "17:00:00", end_time: "22:00:00", price_per_hour: args.p_service_id === "s1" ? "250000.00" : "99000" }],
    };
  };
  const out = await loadCourtVenue({ rpc } as never, "m1", ["s1", "s2"]);
  assert.equal(out.courts.length, 1);
  assert.equal(out.areas.length, 1);
  assert.equal(out.markers.length, 1);
  assert.deepEqual(out.rulesByService.s1, [{ dayOfWeek: 1, start: "17:00", end: "22:00", pricePerHour: 250000 }]);
  assert.equal(out.rulesByService.s2[0].pricePerHour, 99000);
});

test("loadCourtVenue: tanpa layanan sewa tidak memanggil RPC apa pun", async () => {
  const rpc = async () => {
    throw new Error("tidak boleh dipanggil");
  };
  const out = await loadCourtVenue({ rpc } as never, "m1", []);
  assert.deepEqual(out, { courts: [], areas: [], markers: [], rulesByService: {} });
});

test("loadCourtVenue: error RPC dilempar", async () => {
  const rpc = async (name: string) =>
    name === "get_court_price_rules" ? { error: { code: "PGRST202" }, data: null } : { error: null, data: [] };
  await assert.rejects(loadCourtVenue({ rpc } as never, "m1", ["s1"]));
});
