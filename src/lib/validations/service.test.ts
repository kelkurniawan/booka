// Test unit untuk src/lib/validations/service.ts.
//
// Memastikan aturan Zod tetap sinkron dengan constraint tabel `services` di
// supabase/migrations/20260729000100_init_schema.sql.
import assert from "node:assert/strict";
import { test } from "node:test";

import { serviceSchema } from "./service";

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
