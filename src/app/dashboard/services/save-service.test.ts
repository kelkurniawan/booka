import assert from "node:assert/strict";
import { test } from "node:test";

import type { CourtServiceValues, ServiceValues } from "@/lib/validations/service";

import { createServiceRecord, updateServiceRecord } from "./save-service";

type Err = { code: string } | null;
type Call = { op: string; table?: string; payload?: unknown; name?: string };

/** Klien palsu pencatat: hasil tiap operasi diatur lewat `results`, kunci "tabel.op" atau "rpc.nama". */
function fake(results: Record<string, { data?: unknown; error?: Err }> = {}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      let op = "select";
      const chain: Record<string, unknown> = {};
      const done = () => {
        const r = results[`${table}.${op}`] ?? {};
        return { data: r.data ?? null, error: r.error ?? null };
      };
      for (const m of ["insert", "update", "delete"]) {
        chain[m] = (payload?: unknown) => {
          op = m;
          calls.push({ op: m, table, payload });
          return chain;
        };
      }
      for (const m of ["select", "eq"]) chain[m] = () => chain;
      chain.single = () => Promise.resolve(done());
      chain.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(done()).then(ok, bad);
      return chain;
    },
    rpc(name: string, payload: unknown) {
      calls.push({ op: "rpc", name, payload });
      const r = results[`rpc.${name}`] ?? {};
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    },
  };
  return { client: client as never, calls };
}

const SALON = {
  name: "Potong rambut",
  description: null,
  price: 100000,
  duration_minutes: 45,
  payment_mode: "FULL",
  deposit_type: null,
  deposit_value: null,
  partyMin: null,
  partyMax: null,
  seatDurationMinutes: null,
} as ServiceValues;

const COURT: CourtServiceValues = {
  unit: 30,
  minMinutes: 60,
  maxMinutes: 120,
  courtIds: ["3f2b8c1e-0000-4000-8000-000000000001"],
  rules: [{ days: [6, 7], start: "17:00", end: "22:00", pricePerHour: 250000 }],
};

const rpcCalls = (calls: Call[]) => calls.filter((c) => c.op === "rpc");

test("create salon: insert saja, tanpa RPC sewa", async () => {
  const { client, calls } = fake({ "services.insert": { data: { id: "s1" } } });
  const r = await createServiceRecord(client, "u1", SALON, null);
  assert.deepEqual(r, { status: "success", serviceId: "s1" });
  assert.equal(rpcCalls(calls).length, 0);
  assert.equal((calls[0].payload as { duration_minutes: number }).duration_minutes, 45);
});

test("create sewa: insert lalu satu RPC dengan baris aturan per hari", async () => {
  const { client, calls } = fake({ "services.insert": { data: { id: "s1" } } });
  const r = await createServiceRecord(client, "u1", SALON, COURT);
  assert.equal(r.status, "success");
  const rpc = rpcCalls(calls);
  assert.equal(rpc.length, 1);
  assert.equal(rpc[0].name, "save_court_service");
  const p = rpc[0].payload as Record<string, unknown>;
  assert.equal(p.p_service_id, "s1");
  assert.equal(p.p_rental, true);
  assert.equal(p.p_duration, 60);
  assert.deepEqual(p.p_rules, [
    { day_of_week: 6, start_time: "17:00", end_time: "22:00", price_per_hour: 250000 },
    { day_of_week: 7, start_time: "17:00", end_time: "22:00", price_per_hour: 250000 },
  ]);
});

const rpcErrors: [string, RegExp][] = [
  ["23P01", /tumpang tindih/],
  ["42501", /tidak punya akses/],
  ["22023", /Data sewa tidak valid/],
  ["23514", /Pengaturan sewa tidak valid/],
  ["XX000", /Gagal menyimpan layanan sewa/],
];
for (const [code, pola] of rpcErrors) {
  test(`create sewa: RPC ${code} dipetakan dan layanan baru dihapus lagi`, async () => {
    const { client, calls } = fake({
      "services.insert": { data: { id: "s1" } },
      "rpc.save_court_service": { error: { code } },
    });
    const r = await createServiceRecord(client, "u1", SALON, COURT);
    assert.equal(r.status, "error");
    assert.match(r.message ?? "", pola);
    assert.match(r.courtError ?? "", pola);
    assert.ok(calls.some((c) => c.op === "delete" && c.table === "services"), "rollback");
  });
}

test("create: P0001 batas layanan dan 23514 DP tetap pesan lama", async () => {
  const a = await createServiceRecord(fake({ "services.insert": { error: { code: "P0001" } } }).client, "u1", SALON, null);
  assert.equal(a.limitReached, true);
  const b = await createServiceRecord(fake({ "services.insert": { error: { code: "23514" } } }).client, "u1", SALON, null);
  assert.match(b.message ?? "", /Besar DP/);
  const c = await createServiceRecord(fake({ "services.insert": { error: { code: "XX" } } }).client, "u1", SALON, null);
  assert.equal(c.message, "Gagal menyimpan layanan. Coba lagi.");
});

test("update salon: tanpa RPC, kolom sewa dikosongkan", async () => {
  const { client, calls } = fake();
  const r = await updateServiceRecord(client, "u1", "s1", SALON, null, false);
  assert.deepEqual(r, { status: "success" });
  assert.equal(rpcCalls(calls).length, 0);
  const p = calls[0].payload as Record<string, unknown>;
  assert.equal(p.court_unit_minutes, null);
  assert.equal(p.duration_minutes, 45);
});

test("update sewa: durasi tidak ditulis di update biasa, RPC sewa menyala", async () => {
  const { client, calls } = fake();
  const r = await updateServiceRecord(client, "u1", "s1", SALON, COURT, true);
  assert.equal(r.status, "success");
  assert.ok(!("duration_minutes" in (calls[0].payload as object)));
  assert.equal((rpcCalls(calls)[0].payload as { p_rental: boolean }).p_rental, true);
});

test("update mematikan sewa: RPC p_rental=false membersihkan tautan dan aturan", async () => {
  const { client, calls } = fake();
  const r = await updateServiceRecord(client, "u1", "s1", SALON, null, true);
  assert.equal(r.status, "success");
  assert.equal((rpcCalls(calls)[0].payload as { p_rental: boolean }).p_rental, false);
});

for (const [code, pola] of rpcErrors) {
  test(`update sewa: RPC ${code} dipetakan`, async () => {
    const { client } = fake({ "rpc.save_court_service": { error: { code } } });
    const r = await updateServiceRecord(client, "u1", "s1", SALON, COURT, false);
    assert.equal(r.status, "error");
    assert.match(r.message ?? "", pola);
  });
}

test("update: 23514 pada layanan sewa memakai pesan sewa, pada salon pesan DP", async () => {
  const bad = { "services.update": { error: { code: "23514" } } };
  const a = await updateServiceRecord(fake(bad).client, "u1", "s1", SALON, COURT, false);
  assert.match(a.message ?? "", /Pengaturan sewa tidak valid/);
  const b = await updateServiceRecord(fake(bad).client, "u1", "s1", SALON, null, false);
  assert.match(b.message ?? "", /Besar DP/);
  const c = await updateServiceRecord(fake({ "services.update": { error: { code: "XX" } } }).client, "u1", "s1", SALON, null, false);
  assert.equal(c.message, "Gagal menyimpan perubahan. Coba lagi.");
});
