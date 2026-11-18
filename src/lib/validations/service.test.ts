// Test unit untuk src/lib/validations/service.ts.
//
// Memastikan aturan Zod tetap sinkron dengan constraint tabel `services` di
// supabase/migrations/20260729000100_init_schema.sql.
import assert from "node:assert/strict";
import { test } from "node:test";

import { courtServiceSchema, MAX_ONLINE_MESSAGE, ONLINE_PRICE_MESSAGE, serviceSchema } from "./service";

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

test("batas QRIS: FULL Rp10.000.001 ditolak, tepat Rp10.000.000 diterima", () => {
  const over = serviceSchema.safeParse({ ...VALID, price: "10000001", payment_mode: "FULL" });
  assert.equal(over.success, false);
  assert.ok(over.error?.issues.some((i) => i.message === MAX_ONLINE_MESSAGE));
  assert.equal(serviceSchema.safeParse({ ...VALID, price: "10000000", payment_mode: "FULL" }).success, true);
});

test("batas QRIS: DP 30% dari Rp40.000.000 ditolak, bayar di tempat Rp50.000.000 diterima", () => {
  const dp = serviceSchema.safeParse({
    ...VALID, price: "40000000", payment_mode: "DEPOSIT", deposit_type: "PERCENT", deposit_value: "30",
  });
  assert.equal(dp.success, false);
  assert.ok(dp.error?.issues.some((i) => i.path[0] === "deposit_value" && i.message === MAX_ONLINE_MESSAGE));
  assert.equal(serviceSchema.safeParse({ ...VALID, price: "50000000", payment_mode: "ON_SITE" }).success, true);
});

const UUID = "3f2b8c1e-0000-4000-8000-000000000001";
const COURT = {
  unit: "30",
  minMinutes: "60",
  maxMinutes: "120",
  courtIds: [UUID],
  rules: [{ days: [1, 2], start: "17:00", end: "22:00", pricePerHour: 250000 }],
};

test("courtServiceSchema: input valid diterima dan dikoersi", () => {
  const r = courtServiceSchema.parse(COURT);
  assert.equal(r.unit, 30);
  assert.equal(r.maxMinutes, 120);
});

test("courtServiceSchema: unit selain 30 atau 60 ditolak", () => {
  assert.equal(courtServiceSchema.safeParse({ ...COURT, unit: "45" }).success, false);
});

test("courtServiceSchema: minimum bukan kelipatan unit ditolak", () => {
  const r = courtServiceSchema.safeParse({ ...COURT, unit: "60", minMinutes: "90", maxMinutes: "120" });
  assert.equal(r.success, false);
});

test("courtServiceSchema: maksimum di atas 480 atau di bawah minimum ditolak", () => {
  assert.equal(courtServiceSchema.safeParse({ ...COURT, maxMinutes: "510" }).success, false);
  assert.equal(courtServiceSchema.safeParse({ ...COURT, minMinutes: "90", maxMinutes: "60" }).success, false);
});

test("courtServiceSchema: tanpa lapangan ditolak", () => {
  assert.equal(courtServiceSchema.safeParse({ ...COURT, courtIds: [] }).success, false);
});

test("courtServiceSchema: aturan start >= end ditolak", () => {
  const r = courtServiceSchema.safeParse({ ...COURT, rules: [{ ...COURT.rules[0], start: "18:00", end: "18:00" }] });
  assert.equal(r.success, false);
});

test("courtServiceSchema: harga aturan harus bilangan bulat positif", () => {
  for (const pricePerHour of [0, -5, 100.5]) {
    const r = courtServiceSchema.safeParse({ ...COURT, rules: [{ ...COURT.rules[0], pricePerHour }] });
    assert.equal(r.success, false, String(pricePerHour));
  }
});

test("courtServiceSchema: aturan tanpa hari ditolak", () => {
  assert.equal(courtServiceSchema.safeParse({ ...COURT, rules: [{ ...COURT.rules[0], days: [] }] }).success, false);
});

test("courtServiceSchema: tumpang tindih ditolak dengan pesan L5 pada path aturan", () => {
  const r = courtServiceSchema.safeParse({
    ...COURT,
    rules: [
      { days: [6, 7], start: "17:00", end: "18:00", pricePerHour: 250000 },
      { days: [6, 7], start: "16:30", end: "17:30", pricePerHour: 200000 },
    ],
  });
  assert.equal(r.success, false);
  const issue = r.error!.issues[0];
  assert.deepEqual(issue.path, ["rules", 1]);
  assert.match(issue.message, /^Sabtu dan Minggu 17\.00 sampai 17\.30 sudah masuk aturan 1\./);
});

test("courtServiceSchema: aturan bersentuhan lolos; lebih dari 50 baris hari ditolak", () => {
  const ok = courtServiceSchema.safeParse({
    ...COURT,
    rules: [
      { days: [6], start: "17:00", end: "18:00", pricePerHour: 250000 },
      { days: [6], start: "18:00", end: "19:00", pricePerHour: 200000 },
    ],
  });
  assert.equal(ok.success, true);
  const banyak = Array.from({ length: 8 }, (_, i) => ({
    days: [1, 2, 3, 4, 5, 6, 7],
    start: `${String(i).padStart(2, "0")}:00`,
    end: `${String(i).padStart(2, "0")}:30`,
    pricePerHour: 100000,
  }));
  assert.equal(courtServiceSchema.safeParse({ ...COURT, rules: banyak }).success, false);
});
