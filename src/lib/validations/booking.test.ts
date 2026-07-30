// Test unit untuk src/lib/validations/booking.ts.
//
// Memastikan aturan Zod tetap sinkron dengan constraint tabel `bookings` di
// supabase/migrations/20260729000100_init_schema.sql (bookings_customer_name_length,
// bookings_customer_whatsapp_format).
import assert from "node:assert/strict";
import { test } from "node:test";

import { checkoutSchema, customerNameSchema } from "./booking";

const VALID_INPUT = {
  serviceId: "123e4567-e89b-12d3-a456-426614174000",
  startUtc: "2026-08-03T02:00:00.000Z",
  customer_name: "Ayu Lestari",
  customer_whatsapp: "0812-3456-7890",
};

test("checkoutSchema menerima input valid dan menormalkan whatsapp ke E.164", () => {
  const parsed = checkoutSchema.parse(VALID_INPUT);
  assert.equal(parsed.customer_whatsapp, "+6281234567890");
  assert.equal(parsed.customer_name, "Ayu Lestari");
});

test("nama pelanggan kurang dari 2 karakter ditolak (bookings_customer_name_length)", () => {
  const result = customerNameSchema.safeParse("A");
  assert.equal(result.success, false);
});

test("nama pelanggan lebih dari 80 karakter ditolak (bookings_customer_name_length)", () => {
  const result = customerNameSchema.safeParse("A".repeat(81));
  assert.equal(result.success, false);
});

test("checkoutSchema menolak serviceId yang bukan uuid", () => {
  const result = checkoutSchema.safeParse({ ...VALID_INPUT, serviceId: "bukan-uuid" });
  assert.equal(result.success, false);
});

test("checkoutSchema menolak startUtc yang bukan ISO datetime", () => {
  const result = checkoutSchema.safeParse({ ...VALID_INPUT, startUtc: "besok jam 9" });
  assert.equal(result.success, false);
});

test("checkoutSchema menolak nomor whatsapp yang tidak valid", () => {
  const result = checkoutSchema.safeParse({ ...VALID_INPUT, customer_whatsapp: "123" });
  assert.equal(result.success, false);
});
