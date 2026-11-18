// Tes handler POST /api/vouchers/check dan skema bodinya.
import assert from "node:assert/strict";
import { before, test } from "node:test";

import { fakeClient } from "@/lib/testing/fake-supabase";
import { checkVoucherRequestSchema } from "@/lib/validations/booking";

import type { handleVoucherCheck as HandleVoucherCheck } from "./route";

let handleVoucherCheck: typeof HandleVoucherCheck;
before(async () => {
  ({ handleVoucherCheck } = await import("./route"));
});

const SERVICE = "22222222-2222-4222-8222-222222222222";
const base = { username: "padel", serviceId: SERVICE, code: "LAP79" };
const court = { ...base, startUtc: "2030-01-12T03:00:00.000Z", durationMinutes: 120 };
const post = (b: unknown) => new Request("http://localhost/api/vouchers/check", { method: "POST", body: JSON.stringify(b) });

const okRow = { code: "LAP79", kind: "PERCENT", value: 10, max_discount: null, min_spend: 200000, service_ids: null, discount: "30000", reason: null };
function run(b: unknown, row: Record<string, unknown> | null = okRow, allowed = true) {
  const f = fakeClient({ merchants: { data: { id: "m1" } } }, {
    check_voucher_rate_limit: () => ({ data: allowed }),
    check_voucher: () => ({ data: row ? [row] : [] }),
  });
  return { f, res: handleVoucherCheck(post(b), () => f.client as never, () => "h") };
}

test("skema: jam mulai dan lama main valid diterima, keduanya kosong diterima", () => {
  assert.equal(checkVoucherRequestSchema.safeParse(court).success, true);
  assert.equal(checkVoucherRequestSchema.safeParse(base).success, true);
});

test("skema: ISO rusak, durasi 10, dan hanya satu dari dua ditolak", () => {
  assert.equal(checkVoucherRequestSchema.safeParse({ ...court, startUtc: "besok" }).success, false);
  assert.equal(checkVoucherRequestSchema.safeParse({ ...court, durationMinutes: 10 }).success, false);
  assert.equal(checkVoucherRequestSchema.safeParse({ ...base, startUtc: court.startUtc }).success, false);
  assert.equal(checkVoucherRequestSchema.safeParse({ ...base, durationMinutes: 60 }).success, false);
});

test("route: skema melanggar -> 400 (ISO rusak, durasi 10, hanya satu field)", async () => {
  for (const b of [{ ...court, startUtc: "besok" }, { ...court, durationMinutes: 10 }, { ...base, durationMinutes: 60 }]) {
    const r = await run(b).res;
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { error: "Data kode voucher tidak valid" });
  }
});

test("route: sewa sukses meneruskan jam mulai dan durasi ke check_voucher, diskon dari RPC", async () => {
  const { f, res } = run(court);
  const r = await res;
  assert.equal(r.status, 200);
  assert.equal((await r.json()).discount, 30000);
  const call = f.rpcCalls.find((c) => c.name === "check_voucher")!;
  assert.equal(call.args.p_start_datetime, court.startUtc);
  assert.equal(call.args.p_duration_minutes, 120);
});

test("route: layanan biasa tidak mengirim jam mulai dan durasi", async () => {
  const { f, res } = run(base);
  assert.equal((await res).status, 200);
  const call = f.rpcCalls.find((c) => c.name === "check_voucher")!;
  assert.equal(call.args.p_start_datetime, undefined);
  assert.equal(call.args.p_duration_minutes, undefined);
});

test("route: reason BK071 -> 422 dan BK054 -> 409 dengan pesan Indonesia", async () => {
  const a = await run(court, { ...okRow, reason: "BK071" }).res;
  assert.equal(a.status, 422);
  assert.deepEqual(await a.json(), { error: "Lama main tidak valid untuk layanan ini." });
  const b = await run(court, { reason: "BK054" }).res;
  assert.equal(b.status, 409);
  assert.deepEqual(await b.json(), { error: "Harga layanan belum memenuhi minimal transaksi voucher ini." });
});

test("route: rate limit habis 429, RPC kosong 503, merchant tidak ada 404", async () => {
  assert.equal((await run(court, okRow, false).res).status, 429);
  assert.equal((await run(court, null).res).status, 503);
  const f = fakeClient({ merchants: { data: null } });
  assert.equal((await handleVoucherCheck(post(court), () => f.client as never, () => "h")).status, 404);
});
