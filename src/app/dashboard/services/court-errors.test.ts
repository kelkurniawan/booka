import assert from "node:assert/strict";
import { test } from "node:test";

import { COURT_ERROR_GENERIC, mapCourtError } from "./court-errors";

const cases: [string, string, RegExp][] = [
  ["23P01", "23P01", /tumpang tindih/],
  ["42501", "42501", /tidak punya akses/],
  ["22023", "22023", /tidak valid/],
  ["23514 (CHECK sewa)", "23514", /Pengaturan sewa tidak valid/],
  ["23503 (FK lapangan)", "23503", /Lapangan yang dipilih tidak cocok/],
  ["23505 (nama lapangan ganda)", "23505", /sudah dipakai/],
  ["P0001 (batas layanan)", "P0001", /Paket Starter/],
];

for (const [nama, kode, pola] of cases) {
  test(`mapCourtError ${nama}`, () => {
    assert.match(mapCourtError(kode), pola);
  });
}

test("mapCourtError kode tak dikenal memberi pesan umum tanpa teks mentah", () => {
  assert.equal(mapCourtError("XX000"), COURT_ERROR_GENERIC);
  assert.equal(mapCourtError(undefined), COURT_ERROR_GENERIC);
});
