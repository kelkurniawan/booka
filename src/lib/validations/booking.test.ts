// Test unit untuk src/lib/validations/booking.ts.
//
// Memastikan aturan Zod tetap sinkron dengan constraint tabel `bookings` di
// supabase/migrations/20260729000100_init_schema.sql (bookings_customer_name_length,
// bookings_customer_whatsapp_format).
import assert from "node:assert/strict";
import { test } from "node:test";

import { checkoutSchema, createBookingRequestSchema, customerNameSchema } from "./booking";

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

// --- createBookingRequestSchema (body POST /api/bookings, Task 8) ---------

const VALID_BOOKING_REQUEST = { ...VALID_INPUT, username: "studio-mawar" };

test("createBookingRequestSchema menerima input valid", () => {
  const parsed = createBookingRequestSchema.parse(VALID_BOOKING_REQUEST);
  assert.equal(parsed.username, "studio-mawar");
  assert.equal(parsed.customer_whatsapp, "+6281234567890");
});

test("createBookingRequestSchema menolak body kosong dengan issues per-field, bukan 500", () => {
  const result = createBookingRequestSchema.safeParse({});
  assert.equal(result.success, false);
  if (!result.success) {
    const paths = result.error.issues.map((issue) => issue.path[0]);
    assert.ok(paths.includes("username"));
    assert.ok(paths.includes("serviceId"));
    assert.ok(paths.includes("startUtc"));
    assert.ok(paths.includes("customer_name"));
    assert.ok(paths.includes("customer_whatsapp"));
  }
});

test("createBookingRequestSchema menolak username yang bukan format valid", () => {
  const result = createBookingRequestSchema.safeParse({
    ...VALID_BOOKING_REQUEST,
    username: "AB",
  });
  assert.equal(result.success, false);
});

test("createBookingRequestSchema mengabaikan field ekstra seperti merchantId (tidak trusted dari klien)", () => {
  const parsed = createBookingRequestSchema.parse({
    ...VALID_BOOKING_REQUEST,
    merchantId: "abaikan-saja-ini",
  });
  assert.ok(!("merchantId" in parsed));
});
