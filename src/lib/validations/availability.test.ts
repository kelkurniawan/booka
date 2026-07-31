// Test unit untuk src/lib/validations/availability.ts.
//
// Memastikan aturan Zod tetap sinkron dengan constraint tabel `availability` di
// supabase/migrations/20260729000100_init_schema.sql.
import assert from "node:assert/strict";
import { test } from "node:test";

import { availabilitySchema } from "./availability";

const VALID = {
  day_of_week: "1",
  start_time: "09:00",
  end_time: "17:00",
};

test("menerima input valid dan mengoersi day_of_week ke number", () => {
  const parsed = availabilitySchema.parse(VALID);
  assert.equal(parsed.day_of_week, 1);
  assert.equal(parsed.start_time, "09:00");
  assert.equal(parsed.end_time, "17:00");
});

test("day_of_week 0 ditolak (availability_day_range dimulai dari 1)", () => {
  const result = availabilitySchema.safeParse({ ...VALID, day_of_week: "0" });
  assert.equal(result.success, false);
});

test("day_of_week 8 ditolak (availability_day_range berakhir di 7)", () => {
  const result = availabilitySchema.safeParse({ ...VALID, day_of_week: "8" });
  assert.equal(result.success, false);
});

test("day_of_week batas bawah dan atas diterima (1 = Senin, 7 = Minggu)", () => {
  assert.equal(availabilitySchema.safeParse({ ...VALID, day_of_week: "1" }).success, true);
  assert.equal(availabilitySchema.safeParse({ ...VALID, day_of_week: "7" }).success, true);
});

test("format jam mulai selain HH:mm ditolak", () => {
  const result = availabilitySchema.safeParse({ ...VALID, start_time: "9:00" });
  assert.equal(result.success, false);
});

test("format jam selesai selain HH:mm ditolak", () => {
  const result = availabilitySchema.safeParse({ ...VALID, end_time: "25:00" });
  assert.equal(result.success, false);
});

test("jam selesai sama dengan jam mulai ditolak (availability_time_order memakai >)", () => {
  const result = availabilitySchema.safeParse({ ...VALID, start_time: "09:00", end_time: "09:00" });
  assert.equal(result.success, false);
});

test("jam selesai sebelum jam mulai ditolak (availability_time_order)", () => {
  const result = availabilitySchema.safeParse({ ...VALID, start_time: "17:00", end_time: "09:00" });
  assert.equal(result.success, false);
});

test("jam selesai setelah jam mulai diterima", () => {
  const result = availabilitySchema.safeParse({ ...VALID, start_time: "09:00", end_time: "09:01" });
  assert.equal(result.success, true);
});
