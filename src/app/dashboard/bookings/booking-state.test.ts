// Test unit untuk src/app/dashboard/bookings/booking-state.ts.
//
// BOOKING_LIST_COLUMNS (string literal, dipakai langsung sebagai argumen
// .select() di page.tsx supaya supabase-js bisa menurunkan tipe baris hasil
// query dari teksnya) dan BOOKING_LIST_COLUMN_LIST (array bertipe
// `(keyof BookingListItem)[]`, dipakai supaya kolom yang typo atau sudah
// tidak ada di BookingListItem ketahuan saat compile) HARUS berisi kolom
// yang persis sama -- keduanya tidak bisa saling diturunkan tanpa salah
// satu kehilangan manfaatnya (lihat komentar di booking-state.ts). Test ini
// yang menjaga keduanya tidak diam-diam berbeda.
import assert from "node:assert/strict";
import { test } from "node:test";

import { BOOKING_LIST_COLUMN_LIST, BOOKING_LIST_COLUMNS } from "./booking-state";

test("BOOKING_LIST_COLUMNS persis sama dengan BOOKING_LIST_COLUMN_LIST", () => {
  assert.equal(BOOKING_LIST_COLUMNS, BOOKING_LIST_COLUMN_LIST.join(", "));
});

test("BOOKING_LIST_COLUMN_LIST tidak punya kolom duplikat", () => {
  assert.equal(new Set(BOOKING_LIST_COLUMN_LIST).size, BOOKING_LIST_COLUMN_LIST.length);
});

test("BOOKING_LIST_COLUMN_LIST tidak menyebut access_token, payment_url, merchant_id, atau updated_at", () => {
  // Bukan sekadar duplikasi Omit<> di BookingListItem -- ini pengaman
  // eksplisit spesifik untuk access_token (rahasia /pesanan/[token]) dan
  // payment_url (payload QRIS mentah, tidak berguna bagi merchant), supaya
  // kalau suatu saat ada yang mengubah Omit<> di BookingListItem secara
  // tidak sengaja menghapus salah satu exclusion ini, test ini tetap
  // menangkapnya secara terpisah dari drift check di atas.
  for (const forbidden of ["access_token", "payment_url", "merchant_id", "updated_at"]) {
    assert.ok(
      !BOOKING_LIST_COLUMN_LIST.includes(forbidden as (typeof BOOKING_LIST_COLUMN_LIST)[number]),
      `BOOKING_LIST_COLUMN_LIST tidak boleh menyebut ${forbidden}`,
    );
  }
});
