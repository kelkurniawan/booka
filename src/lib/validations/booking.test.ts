// Test unit untuk src/lib/validations/booking.ts.
//
// Memastikan aturan Zod tetap sinkron dengan constraint tabel `bookings` di
// supabase/migrations/20260729000100_init_schema.sql (bookings_customer_name_length,
// bookings_customer_whatsapp_format).
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bookingSearchSchema,
  bookingStatusFilterSchema,
  cancelBookingSchema,
  checkoutSchema,
  createBookingRequestSchema,
  customerNameSchema,
} from "./booking";

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

// --- bookingSearchSchema (?q= di /dashboard/bookings, Task 2) --------------

test("bookingSearchSchema menerima nama pelanggan wajar", () => {
  const parsed = bookingSearchSchema.parse("Ayu Lestari");
  assert.equal(parsed, "Ayu Lestari");
});

test("bookingSearchSchema menolak string lebih dari 80 karakter", () => {
  const result = bookingSearchSchema.safeParse("a".repeat(81));
  assert.equal(result.success, false);
});

test("bookingSearchSchema menerima tepat 80 karakter", () => {
  const result = bookingSearchSchema.safeParse("a".repeat(80));
  assert.equal(result.success, true);
});

// Setiap karakter di daftar ini punya arti khusus di sintaks filter
// PostgREST `.or()` -- kalau lolos tanpa ditolak, nilai pencarian bisa
// dipakai menyuntik kondisi filter tambahan (mis. `,merchant_id.eq.<uuid
// lain>` atau `,cancelled_at.not.is.null` lewat kurung/koma).
for (const char of [",", ".", "(", ")", "%", "\\"]) {
  test(`bookingSearchSchema menolak karakter berarti khusus di PostgREST: "${char}"`, () => {
    const result = bookingSearchSchema.safeParse(`Ayu${char}Lestari`);
    assert.equal(result.success, false);
  });
}

test("bookingSearchSchema menolak percobaan injeksi filter .or() lewat koma", () => {
  // Kalau ini lolos validasi, `.or(\`customer_name.ilike.%<value>%\`)` di
  // actions.ts akan membaca koma sebagai pemisah kondisi OR baru dan
  // membuat kondisi `merchant_id.eq.11111111-...` -- yang bisa dipakai untuk
  // mencoba membaca booking merchant lain. Test ini gagal (assert error)
  // kalau suatu saat validasinya kebobolan mengizinkan koma lewat.
  const injected = "x%,merchant_id.eq.11111111-1111-1111-1111-111111111111,x.ilike.%";
  const result = bookingSearchSchema.safeParse(injected);
  assert.equal(result.success, false);
});

// --- bookingStatusFilterSchema (?status= di /dashboard/bookings) ----------

test("bookingStatusFilterSchema menerima ketiga status booking", () => {
  for (const status of ["PENDING", "PAID", "CANCELLED"]) {
    assert.equal(bookingStatusFilterSchema.safeParse(status).success, true);
  }
});

test("bookingStatusFilterSchema menolak nilai tak dikenal (page.tsx memperlakukannya sebagai 'semua', bukan error)", () => {
  const result = bookingStatusFilterSchema.safeParse("REFUNDED");
  assert.equal(result.success, false);
});

// --- cancelBookingSchema (Server Action cancelBooking) ---------------------

test("cancelBookingSchema menerima uuid valid", () => {
  const result = cancelBookingSchema.safeParse({ id: "123e4567-e89b-12d3-a456-426614174000" });
  assert.equal(result.success, true);
});

test("cancelBookingSchema menolak id yang bukan uuid", () => {
  const result = cancelBookingSchema.safeParse({ id: "bukan-uuid" });
  assert.equal(result.success, false);
});
