// Test unit untuk src/lib/booking/slots.ts — algoritma murni penghitung slot
// kosong. Tanggal contoh (2026-08-03) sengaja Senin (day_of_week 1) di masa
// depan supaya "past-time" bisa diuji lewat parameter `now` yang disuntikkan,
// bukan jam sistem saat test jalan.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeFreeSlots,
  isoDayOfWeek,
  jakartaWallClockToUtc,
  type AvailabilityWindow,
} from "./slots";

const SENIN_09_17: AvailabilityWindow = {
  day_of_week: 1,
  start_time: "09:00:00",
  end_time: "17:00:00",
};

test("isoDayOfWeek: 2026-08-03 (Senin) -> 1, 2026-08-09 (Minggu) -> 7", () => {
  assert.equal(isoDayOfWeek("2026-08-03"), 1);
  assert.equal(isoDayOfWeek("2026-08-09"), 7);
});

test("kasus normal: jam kerja 09:00-17:00 dipotong slot 90 menit", () => {
  const slots = computeFreeSlots({
    dateISO: "2026-08-03",
    durationMinutes: 90,
    availability: [SENIN_09_17],
    bookedRanges: [],
    // "now" jauh sebelum tanggal slot supaya tidak ada yang kena filter masa lalu.
    now: jakartaWallClockToUtc("2026-08-01", "00:00"),
  });

  assert.deepEqual(
    slots.map((s) => s.label),
    ["09:00", "10:30", "12:00", "13:30", "15:00"],
  );
  // Slot terakhir (15:00-16:30) masih di dalam 09:00-17:00; 16:30-18:00 sudah
  // lewat jam tutup jadi tidak boleh ikut ditawarkan.
  assert.equal(slots.length, 5);
});

test("batas setengah terbuka: slot yang berakhir tepat saat booking lain mulai tetap kosong", () => {
  const availability: AvailabilityWindow = {
    day_of_week: 1,
    start_time: "09:00:00",
    end_time: "11:00:00",
  };

  const slots = computeFreeSlots({
    dateISO: "2026-08-03",
    durationMinutes: 60,
    availability: [availability],
    bookedRanges: [
      {
        // Mulai tepat saat slot 09:00-10:00 berakhir.
        start_datetime: jakartaWallClockToUtc("2026-08-03", "10:00").toISOString(),
        end_datetime: jakartaWallClockToUtc("2026-08-03", "10:30").toISOString(),
      },
    ],
    now: jakartaWallClockToUtc("2026-08-01", "00:00"),
  });

  const labels = slots.map((s) => s.label);
  // 09:00-10:00 tidak beririsan (batas '[)') -> tetap tersedia.
  assert.ok(labels.includes("09:00"), "slot 09:00 harus tetap tersedia");
  // 10:00-11:00 beririsan dengan booking 10:00-10:30 -> harus hilang.
  assert.ok(!labels.includes("10:00"), "slot 10:00 harus dibuang karena bentrok");
});

test("slot yang jamnya sudah lewat hari ini (Jakarta) tidak ditawarkan", () => {
  const slots = computeFreeSlots({
    dateISO: "2026-08-03",
    durationMinutes: 90,
    availability: [SENIN_09_17],
    bookedRanges: [],
    // "Sekarang" jam 10:00 WIB tanggal yang sama -> slot 09:00 sudah lewat,
    // 10:30 dan seterusnya belum.
    now: jakartaWallClockToUtc("2026-08-03", "10:00"),
  });

  const labels = slots.map((s) => s.label);
  assert.ok(!labels.includes("09:00"), "slot yang sudah lewat harus dibuang");
  assert.ok(labels.includes("10:30"), "slot yang belum lewat harus tetap ada");
});

test("tanggal yang sudah lewat sama sekali tidak menghasilkan slot", () => {
  const slots = computeFreeSlots({
    dateISO: "2026-08-01",
    durationMinutes: 90,
    availability: [{ ...SENIN_09_17, day_of_week: isoDayOfWeek("2026-08-01") }],
    bookedRanges: [],
    now: jakartaWallClockToUtc("2026-08-03", "00:00"),
  });

  assert.equal(slots.length, 0);
});
