import assert from "node:assert/strict";
import { test } from "node:test";

import { computeStaffSlots, nearestStaffSlots, type StaffSchedule } from "./slots";

// Tanggal jauh di depan supaya tidak pernah dianggap "sudah lewat".
const dateISO = "2030-01-07"; // Senin
const now = new Date("2030-01-01T00:00:00Z");
const merchantAvailability = [{ day_of_week: 1 as const, start_time: "09:00", end_time: "12:00" }];
const dewi: StaffSchedule = { id: "dewi", availability: [] };
const andi: StaffSchedule = {
  id: "andi",
  availability: [{ day_of_week: 1, start_time: "10:00", end_time: "12:00" }],
};
// 09:00-10:00 WIB = 02:00-03:00 UTC.
const dewiAt9 = { start_datetime: "2030-01-07T02:00:00Z", end_datetime: "2030-01-07T03:00:00Z", staff_id: "dewi" };

const labels = (slots: { label: string }[]) => slots.map((s) => s.label);

test("tanpa staf: satu kalender, semua booking mengunci", () => {
  const slots = computeStaffSlots({
    dateISO, durationMinutes: 60, merchantAvailability, staff: [],
    bookedRanges: [{ ...dewiAt9, staff_id: null }], staffId: null, now,
  });
  assert.deepEqual(labels(slots), ["10:00", "11:00"]);
});

test("staf tanpa jam sendiri mengikuti jam usaha, dikurangi bookingnya sendiri", () => {
  const slots = computeStaffSlots({
    dateISO, durationMinutes: 60, merchantAvailability, staff: [dewi, andi],
    bookedRanges: [dewiAt9], staffId: "dewi", now,
  });
  assert.deepEqual(labels(slots), ["10:00", "11:00"]);
});

test("staf dengan jam sendiri hanya memakai jamnya", () => {
  const slots = computeStaffSlots({
    dateISO, durationMinutes: 60, merchantAvailability, staff: [dewi, andi],
    bookedRanges: [], staffId: "andi", now,
  });
  assert.deepEqual(labels(slots), ["10:00", "11:00"]);
});

test("siapa saja: slot tetap ada bila satu staf masih kosong", () => {
  const slots = computeStaffSlots({
    dateISO, durationMinutes: 60, merchantAvailability, staff: [dewi, andi],
    bookedRanges: [dewiAt9], staffId: null, now,
  });
  // 09:00 hanya Dewi yang bekerja dan ia sudah dipesan -> hilang.
  assert.deepEqual(labels(slots), ["10:00", "11:00"]);
});

test("siapa saja: gabungan jam semua staf, urut dan tanpa duplikat", () => {
  const slots = computeStaffSlots({
    dateISO, durationMinutes: 60, merchantAvailability, staff: [andi, dewi],
    bookedRanges: [], staffId: null, now,
  });
  assert.deepEqual(labels(slots), ["09:00", "10:00", "11:00"]);
});

test("booking tanpa staf tidak mengunci kalender staf", () => {
  const slots = computeStaffSlots({
    dateISO, durationMinutes: 60, merchantAvailability, staff: [dewi],
    bookedRanges: [{ ...dewiAt9, staff_id: null }], staffId: "dewi", now,
  });
  assert.deepEqual(labels(slots), ["09:00", "10:00", "11:00"]);
});

// Senin 2026-11-16 08:00 WIB = 01:00 UTC.
const nearestBase = {
  fromDateISO: "2026-11-16",
  days: 14,
  durationMinutes: 60,
  merchantAvailability: [1, 2, 3, 4, 5, 6].map((d) => ({
    day_of_week: d as 1 | 2 | 3 | 4 | 5 | 6,
    start_time: "09:00",
    end_time: "17:00",
  })),
};
const staffA: StaffSchedule = { id: "a", availability: [{ day_of_week: 1, start_time: "09:00", end_time: "12:00" }] };
const staffB: StaffSchedule = { id: "b", availability: [] };
const staffC: StaffSchedule = { id: "c", availability: [{ day_of_week: 7, start_time: "09:00", end_time: "10:00" }] };
const aMonday9 = { start_datetime: "2026-11-16T02:00:00Z", end_datetime: "2026-11-16T03:00:00Z", staff_id: "a" };
const cSundays = ["2026-11-22", "2026-11-29"].map((d) => ({
  start_datetime: `${d}T02:00:00Z`, end_datetime: `${d}T03:00:00Z`, staff_id: "c",
}));

test("nearestStaffSlots: per staf, siapa saja, dan staf penuh", () => {
  const nearest = nearestStaffSlots({
    ...nearestBase, staff: [staffA, staffB, staffC], bookedRanges: [aMonday9, ...cSundays],
    now: new Date("2026-11-16T01:00:00Z"),
  });
  assert.equal(nearest.a?.label, "10:00");
  assert.equal(nearest.a?.dateISO, "2026-11-16");
  assert.equal(nearest.any?.label, "09:00");
  assert.equal(nearest.c, null);
});

test("nearestStaffSlots: tanpa staf hanya kunci any", () => {
  const nearest = nearestStaffSlots({
    ...nearestBase, staff: [], bookedRanges: [], now: new Date("2026-11-16T01:00:00Z"),
  });
  assert.deepEqual(Object.keys(nearest), ["any"]);
});

test("nearestStaffSlots: lewat jam kerja hari ini pindah ke Senin berikutnya", () => {
  const nearest = nearestStaffSlots({
    ...nearestBase, staff: [staffA], bookedRanges: [aMonday9], now: new Date("2026-11-16T05:30:00Z"),
  });
  assert.equal(nearest.a?.dateISO, "2026-11-23");
  assert.equal(nearest.a?.label, "09:00");
});
