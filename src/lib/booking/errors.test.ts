// Test unit untuk src/lib/booking/errors.ts.
//
// Memastikan errcode Postgres dari create_booking (lihat
// supabase/migrations/20260730000700_create_booking.sql, diuji lewat
// supabase/tests/99_verify.sql bagian 11) selalu terpetakan ke pesan
// Indonesia yang aman + status HTTP yang benar -- bukan teks Postgres mentah.
import assert from "node:assert/strict";
import { test } from "node:test";

import { mapBookingError } from "./errors";

test("23P01 (bookings_no_overlap) -> 409, pesan slot direbut", () => {
  const result = mapBookingError("23P01");
  assert.equal(result.status, 409);
  assert.match(result.message, /baru saja dipesan orang lain/);
});

test("P0002 (kuota bulanan) -> 409, pesan kuota", () => {
  const result = mapBookingError("P0002");
  assert.equal(result.status, 409);
  assert.match(result.message, /tidak menerima pesanan baru/);
});

test("BK001 (di luar jam kerja) -> 409, pesan jam kerja", () => {
  const result = mapBookingError("BK001");
  assert.equal(result.status, 409);
  assert.match(result.message, /di luar jam kerja/);
});

test("P0005 (layanan tidak ditemukan/nonaktif) -> 404", () => {
  const result = mapBookingError("P0005");
  assert.equal(result.status, 404);
  assert.match(result.message, /Layanan tidak ditemukan/);
});

test("P0006 (slot sudah lewat) -> 409, pesan jam sudah lewat", () => {
  const result = mapBookingError("P0006");
  assert.equal(result.status, 409);
  assert.match(result.message, /sudah lewat/);
});

test("errcode tak dikenal -> 500, pesan generik (tidak membocorkan detail Postgres)", () => {
  const result = mapBookingError("42P01");
  assert.equal(result.status, 500);
  assert.equal(result.message, "Gagal membuat booking, silakan coba lagi.");
});

test("errcode null/undefined -> 500, pesan generik", () => {
  assert.equal(mapBookingError(null).status, 500);
  assert.equal(mapBookingError(undefined).status, 500);
});
