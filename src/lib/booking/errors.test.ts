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

test("BK020 (batas booking aktif per nomor) -> 409", () => {
  assert.equal(mapBookingError("BK020").status, 409);
});

test("BK021 (pembayaran belum diaktifkan) -> 409, pesan pembayaran", () => {
  const result = mapBookingError("BK021");
  assert.equal(result.status, 409);
  assert.equal(result.message, "Merchant belum mengaktifkan pembayaran");
});

test("BK022 (nominal di bawah minimum QRIS) -> 409", () => {
  const result = mapBookingError("BK022");
  assert.equal(result.status, 409);
  assert.equal(result.message, "Nominal pembayaran terlalu kecil untuk QRIS. Hubungi merchant.");
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

test("BK050-BK056 (voucher) -> status dan pesan sesuai", () => {
  assert.equal(mapBookingError("BK050").status, 404);
  assert.equal(mapBookingError("BK050").message, "Kode voucher tidak ditemukan atau sudah tidak berlaku.");
  assert.equal(mapBookingError("BK051").status, 409);
  assert.equal(mapBookingError("BK052").message, "Kuota voucher ini sudah habis.");
  assert.equal(mapBookingError("BK053").message, "Nomor WhatsApp ini sudah memakai voucher ini.");
  assert.equal(mapBookingError("BK054").message, "Harga layanan belum memenuhi minimal transaksi voucher ini.");
  assert.equal(mapBookingError("BK055").status, 409);
  assert.equal(mapBookingError("BK055").message, "Voucher ini tidak berlaku untuk layanan yang dipilih.");
  assert.equal(mapBookingError("BK056").message, "Voucher ini khusus pelanggan baru.");
});

test("BK057-BK058 (target banner) -> 409 dan pesan sesuai", () => {
  assert.equal(mapBookingError("BK057").status, 409);
  assert.equal(
    mapBookingError("BK057").message,
    "Target banner harus voucher publik atau layanan milik Anda sendiri.",
  );
  assert.equal(mapBookingError("BK058").status, 409);
  assert.equal(
    mapBookingError("BK058").message,
    "Voucher ini dipakai banner. Ganti target banner dulu sebelum menjadikannya rahasia.",
  );
});
