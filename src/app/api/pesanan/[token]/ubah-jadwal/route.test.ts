// Tes handler POST /api/pesanan/[token]/ubah-jadwal: status, kode mesin, dan pesan per jalur galat.
import assert from "node:assert/strict";
import { before, test } from "node:test";

import { fakeClient, type FakeResult } from "@/lib/testing/fake-supabase";

import type { handleReschedule as HandleReschedule } from "./route";

let handleReschedule: typeof HandleReschedule;
before(async () => {
  ({ handleReschedule } = await import("./route"));
});

const TOKEN = "a".repeat(48);
const START = "2030-01-12T03:00:00.000Z";
const post = (b: unknown) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(b) });

async function run(body: unknown, rpc: () => FakeResult, token = TOKEN) {
  const f = fakeClient({}, { reschedule_booking: rpc });
  const tasks: (() => unknown)[] = [];
  const res = await handleReschedule(post(body), Promise.resolve({ token }), () => f.client as never, (t) => tasks.push(t));
  return { res, json: (await res.json()) as Record<string, unknown>, f, tasks };
}

test("sukses: 200 ok, RPC dipanggil dengan token dan jam baru, notifikasi dijadwalkan", async () => {
  const { res, json, f, tasks } = await run({ startUtc: START }, () => ({ data: [{ booking_id: "b1", old_start: START }] }));
  assert.equal(res.status, 200);
  assert.deepEqual(json, { ok: true });
  assert.deepEqual(f.rpcCalls[0].args, { p_token: TOKEN, p_new_start: START });
  assert.equal(tasks.length, 1);
});

for (const [code, status, error, message] of [
  ["BK073", 409, "price_higher", "Jam baru harganya lebih tinggi. Hubungi merchant untuk pindah ke jam ini."],
  ["BK072", 409, "no_court_free", "Semua lapangan penuh di jam itu. Pilih jam lain."],
  ["BK001", 409, "outside_hours", "Jam itu di luar jam buka. Pilih jam lain."],
  ["23P01", 409, "slot_taken", "Jam itu baru saja terisi. Pilih jam lain."],
] as const) {
  test(`${code}: ${status} ${error} dengan pesan Indonesia, tanpa notifikasi`, async () => {
    const { res, json, tasks } = await run({ startUtc: START }, () => ({ data: null, error: { code, message: "raw pg text" } }));
    assert.equal(res.status, status);
    assert.deepEqual(json, { error: message, code: error });
    assert.equal(tasks.length, 0);
  });
}

test("kode tak dikenal: 500 generik, teks Postgres tidak bocor", async () => {
  const { res, json } = await run({ startUtc: START }, () => ({ data: null, error: { code: "XX000", message: "relation secret" } }));
  assert.equal(res.status, 500);
  assert.deepEqual(json, { error: "Gagal menyimpan. Coba lagi.", code: "save_failed" });
});

test("token cacat: 404 not_found; body cacat: 400 invalid_body", async () => {
  const bad = await run({ startUtc: START }, () => ({ data: [] }), "xyz");
  assert.equal(bad.res.status, 404);
  assert.equal(bad.json.code, "not_found");
  const inv = await run({ startUtc: "besok" }, () => ({ data: [] }));
  assert.equal(inv.res.status, 400);
  assert.equal(inv.json.code, "invalid_body");
  assert.equal(inv.f.rpcCalls.length, 0);
});
