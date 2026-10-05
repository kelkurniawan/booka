import assert from "node:assert/strict";
import { test } from "node:test";

import { computeStaffSlots, type StaffSchedule } from "./slots";

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
