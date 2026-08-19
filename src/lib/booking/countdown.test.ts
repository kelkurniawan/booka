// Test unit untuk src/lib/booking/countdown.ts -- fungsi murni pemformat
// label mm:ss hitung mundur pembayaran.
import assert from "node:assert/strict";
import { test } from "node:test";

import { formatCountdown } from "./countdown";

test("lebih dari satu jam -> menit dua digit tanpa dipotong (mm:ss, bukan hh:mm:ss)", () => {
  assert.equal(formatCountdown(90 * 60 * 1000), "90:00");
});

test("kurang dari satu menit -> menit 00, detik dua digit", () => {
  assert.equal(formatCountdown(45 * 1000), "00:45");
});

test("tepat nol -> 00:00", () => {
  assert.equal(formatCountdown(0), "00:00");
});

test("negatif (tenggat sudah lewat) -> di-clamp ke 00:00, bukan angka negatif", () => {
  assert.equal(formatCountdown(-1), "00:00");
  assert.equal(formatCountdown(-90_000), "00:00");
});
