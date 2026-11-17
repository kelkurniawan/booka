// Test unit untuk src/lib/validations/service.ts.
//
// Memastikan aturan Zod tetap sinkron dengan constraint tabel `services` di
// supabase/migrations/20260729000100_init_schema.sql.
import assert from "node:assert/strict";
import { test } from "node:test";

import { ONLINE_PRICE_MESSAGE, serviceSchema } from "./service";

const VALID = {
  name: "Riasan pengantin",
  description: "Termasuk touch up",
  price: "350000",
  duration_minutes: "90",
};

test("menerima input valid dan mengoersi price/duration_minutes ke number", () => {
  const parsed = serviceSchema.parse(VALID);
  assert.equal(parsed.price, 350000);
  assert.equal(parsed.duration_minutes, 90);
  assert.equal(parsed.name, "Riasan pengantin");
});

test("deskripsi kosong (string kosong) dinormalkan ke null", () => {
  const parsed = serviceSchema.parse({ ...VALID, description: "   " });
  assert.equal(parsed.description, null);
});

test("nama kurang dari 2 karakter ditolak (services_name_length)", () => {
  const result = serviceSchema.safeParse({ ...VALID, name: "A" });
  assert.equal(result.success, false);
});

test("nama lebih dari 80 karakter ditolak (services_name_length)", () => {
  const result = serviceSchema.safeParse({ ...VALID, name: "A".repeat(81) });
  assert.equal(result.success, false);
});

test("deskripsi lebih dari 500 karakter ditolak (services_description_length)", () => {
  const result = serviceSchema.safeParse({ ...VALID, description: "A".repeat(501) });
  assert.equal(result.success, false);
});

test("harga negatif ditolak (services_price_non_negative)", () => {
  const result = serviceSchema.safeParse({ ...VALID, price: "-1" });
  assert.equal(result.success, false);
});

test("harga nol diterima (services_price_non_negative memakai >=)", () => {
  const result = serviceSchema.safeParse({ ...VALID, price: "0" });
  assert.equal(result.success, true);
});

test("durasi di bawah 5 menit ditolak (services_duration_range)", () => {
  const result = serviceSchema.safeParse({ ...VALID, duration_minutes: "4" });
  assert.equal(result.success, false);
});

test("durasi di atas 480 menit ditolak (services_duration_range)", () => {
  const result = serviceSchema.safeParse({ ...VALID, duration_minutes: "481" });
  assert.equal(result.success, false);
});

test("durasi batas bawah dan atas diterima", () => {
  assert.equal(serviceSchema.safeParse({ ...VALID, duration_minutes: "5" }).success, true);
  assert.equal(serviceSchema.safeParse({ ...VALID, duration_minutes: "480" }).success, true);
});

test("durasi pecahan ditolak (harus bilangan bulat menit)", () => {
  const result = serviceSchema.safeParse({ ...VALID, duration_minutes: "5.5" });
  assert.equal(result.success, false);
});

test("input tanpa payment_mode menghasilkan FULL tanpa DP", () => {
  const parsed = serviceSchema.parse(VALID);
  assert.equal(parsed.payment_mode, "FULL");
  assert.equal(parsed.deposit_type, null);
  assert.equal(parsed.deposit_value, null);
});

test("DEPOSIT tanpa DP ditolak dengan 'Isi besar DP'", () => {
  const r = serviceSchema.safeParse({ ...VALID, payment_mode: "DEPOSIT", deposit_type: "", deposit_value: "" });
  assert.equal(r.success, false);
  assert.equal(r.error?.issues[0].message, "Isi besar DP");
});

test("DP persen 95 ditolak", () => {
  const r = serviceSchema.safeParse({ ...VALID, payment_mode: "DEPOSIT", deposit_type: "PERCENT", deposit_value: "95" });
  assert.equal(r.error?.issues[0].message, "DP persen 1 sampai 90");
});

test("DP tetap sama dengan harga ditolak", () => {
  const r = serviceSchema.safeParse({ ...VALID, payment_mode: "DEPOSIT", deposit_type: "FIXED", deposit_value: "350000" });
  assert.equal(r.error?.issues[0].message, "DP harus lebih kecil dari harga");
});

test("DEPOSIT persen valid diterima", () => {
  const p = serviceSchema.parse({ ...VALID, payment_mode: "DEPOSIT", deposit_type: "PERCENT", deposit_value: "30" });
  assert.equal(p.deposit_value, 30);
});

test("ON_SITE dengan DP terisi diterima dan DP dibuang", () => {
  const p = serviceSchema.parse({ ...VALID, payment_mode: "ON_SITE", deposit_type: "PERCENT", deposit_value: "30" });
  assert.equal(p.deposit_type, null);
  assert.equal(p.deposit_value, null);
});

test("REQUEST tanpa DP diterima", () => {
  const p = serviceSchema.parse({ ...VALID, payment_mode: "REQUEST", deposit_type: "", deposit_value: "" });
  assert.equal(p.payment_mode, "REQUEST");
  assert.equal(p.deposit_value, null);
});

test("harga 1..1499 ditolak untuk FULL, DEPOSIT, REQUEST; ON_SITE dan 0 diterima", () => {
  for (const payment_mode of ["FULL", "DEPOSIT", "REQUEST"]) {
    const r = serviceSchema.safeParse({ ...VALID, price: "1499", payment_mode, deposit_type: "PERCENT", deposit_value: "30" });
    assert.equal(r.success, false, payment_mode);
    assert.ok(r.error?.issues.some((i) => i.path[0] === "price" && i.message === ONLINE_PRICE_MESSAGE), payment_mode);
    assert.equal(
      serviceSchema.safeParse({ ...VALID, price: "1500", payment_mode, deposit_type: "PERCENT", deposit_value: "30" }).success,
      true,
      payment_mode,
    );
  }
  assert.equal(serviceSchema.safeParse({ ...VALID, price: "1000", payment_mode: "ON_SITE" }).success, true);
  assert.equal(serviceSchema.safeParse({ ...VALID, price: "0", payment_mode: "FULL" }).success, true);
});

test("jumlah tamu: min tanpa max, min > max, dan lama duduk tanpa rentang ditolak", () => {
  assert.equal(serviceSchema.safeParse({ ...VALID, partyMin: "2" }).success, false);
  assert.equal(serviceSchema.safeParse({ ...VALID, partyMin: "5", partyMax: "2" }).success, false);
  assert.equal(serviceSchema.safeParse({ ...VALID, seatDurationMinutes: "90" }).success, false);
  assert.equal(serviceSchema.safeParse({ ...VALID, partyMin: "1", partyMax: "201" }).success, false);
});

test("jumlah tamu: rentang 1 sampai 12 dengan lama duduk 90 diterima, kosong jadi null", () => {
  const ok = serviceSchema.parse({ ...VALID, partyMin: "1", partyMax: "12", seatDurationMinutes: "90" });
  assert.deepEqual([ok.partyMin, ok.partyMax, ok.seatDurationMinutes], [1, 12, 90]);
  const kosong = serviceSchema.parse({ ...VALID, partyMin: "", partyMax: "", seatDurationMinutes: "" });
  assert.deepEqual([kosong.partyMin, kosong.partyMax, kosong.seatDurationMinutes], [null, null, null]);
});
