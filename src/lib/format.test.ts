// Test unit untuk src/lib/format.ts -- membuktikan pemformat tanggal/jam
// terpasang ke Asia/Jakarta (WIB), bukan zona waktu host yang menjalankan
// proses (lihat docs/DECISIONS.md butir 17 dan komentar besar di
// format.ts).
//
// Nilai yang diharapkan di bawah dihitung MANUAL (instant UTC + 7 jam,
// dibaca sebagai kalender), bukan disalin dari implementasi -- supaya test
// ini benar-benar independen dari kodenya, bukan sekadar echo balik.
import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDate, formatDateTime, formatTime } from "./format";

test("instant UTC dirender sebagai jam dinding Asia/Jakarta (UTC+7) -- kasus sehari penuh sama", () => {
  // 2026-08-19T10:30:00.000Z + 7 jam = 2026-08-19 17:30 WIB. Tanggal
  // kalendernya (19 Agustus) sama persis di UTC maupun di Jakarta -- hanya
  // jamnya yang beda -- jadi ini kasus dasar (bukan yang melintasi
  // pergantian hari, lihat test berikutnya). 19 Agustus 2026 jatuh hari
  // Rabu (dihitung manual dari kalender, bukan dari kode).
  const instant = "2026-08-19T10:30:00.000Z";
  assert.equal(formatDateTime(instant), "Rabu, 19 Agustus 2026 pukul 17:30");
  assert.equal(formatDate(instant), "19 Agt 2026");
  assert.equal(formatTime(instant), "17:30");
});

test("instant UTC dini hari -- masih tanggal kalender yang sama di WIB (kasus sehari penuh, jam beda)", () => {
  // 2026-08-19T01:00:00.000Z + 7 jam = 2026-08-19 08:00 WIB -- tanggalnya
  // (19 Agustus) tetap sama di kedua zona, membuktikan kasus "sehari penuh"
  // tidak kebetulan lolos hanya karena satu contoh.
  const instant = "2026-08-19T01:00:00.000Z";
  assert.equal(formatDateTime(instant), "Rabu, 19 Agustus 2026 pukul 08:00");
  assert.equal(formatDate(instant), "19 Agt 2026");
  assert.equal(formatTime(instant), "08:00");
});

test("instant UTC malam hari -- melintasi pergantian tanggal saat digeser ke WIB (+7 jam)", () => {
  // 2026-08-19T20:15:00.000Z + 7 jam = 2026-08-20T03:15 WIB -- tanggal
  // kalendernya BERBEDA (19 Agustus di UTC, 20 Agustus di WIB). Kalau
  // pemformat ini diam-diam memakai zona waktu host (bukan dipasang ke
  // Asia/Jakarta), host yang bukan WIB (mis. UTC di produksi) akan
  // menampilkan tanggal 19, bukan 20 -- persis skenario yang diperbaiki C1.
  // 20 Agustus 2026 jatuh hari Kamis (19 Agustus = Rabu, jadi 20 = Kamis).
  const instant = "2026-08-19T20:15:00.000Z";
  assert.equal(formatDateTime(instant), "Kamis, 20 Agustus 2026 pukul 03:15");
  assert.equal(formatDate(instant), "20 Agt 2026");
  assert.equal(formatTime(instant), "03:15");
});

test("menerima objek Date, bukan cuma string ISO", () => {
  const instant = new Date("2026-08-19T10:30:00.000Z");
  assert.equal(formatTime(instant), "17:30");
});
