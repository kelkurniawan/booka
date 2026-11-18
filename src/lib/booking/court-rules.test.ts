import assert from "node:assert/strict";
import { test } from "node:test";

import { findRuleOverlap, formatRuleOverlap, groupRuleRows, parseClock } from "./court";

const SAT_SUN = [6, 7];

test("findRuleOverlap: Sabtu dan Minggu 17.00-18.00 vs 16.30-17.30 tumpang tindih", () => {
  const hit = findRuleOverlap([
    { days: SAT_SUN, start: "17:00", end: "18:00" },
    { days: SAT_SUN, start: "16:30", end: "17:30" },
  ]);
  assert.ok(hit);
  assert.equal(hit.ruleIndex, 1);
  assert.equal(hit.with, 0);
  assert.equal(hit.day, 6);
  assert.deepEqual(hit.days, [6, 7]);
  assert.equal(formatRuleOverlap(hit), "Sabtu dan Minggu 17.00 sampai 17.30 sudah masuk aturan 1. Ubah jam selesainya atau lepas harinya.");
});

test("findRuleOverlap: hari berbeda lolos", () => {
  assert.equal(
    findRuleOverlap([
      { days: [6], start: "17:00", end: "18:00" },
      { days: [7], start: "16:30", end: "17:30" },
    ]),
    null,
  );
});

test("findRuleOverlap: batas bersentuhan lolos", () => {
  assert.equal(
    findRuleOverlap([
      { days: SAT_SUN, start: "17:00", end: "18:00" },
      { days: SAT_SUN, start: "18:00", end: "19:00" },
    ]),
    null,
  );
});

test("findRuleOverlap: hanya sebagian hari yang sama dilaporkan", () => {
  const hit = findRuleOverlap([
    { days: [1, 6], start: "10:00", end: "12:00" },
    { days: [6, 7], start: "11:00", end: "13:00" },
  ]);
  assert.deepEqual(hit?.days, [6]);
  assert.equal(formatRuleOverlap(hit!), "Sabtu 11.00 sampai 12.00 sudah masuk aturan 1. Ubah jam selesainya atau lepas harinya.");
});

test("findRuleOverlap: daftar kosong atau satu aturan lolos", () => {
  assert.equal(findRuleOverlap([]), null);
  assert.equal(findRuleOverlap([{ days: [1], start: "08:00", end: "09:00" }]), null);
});

test("parseClock menerima titik dan titik dua, menolak sisanya", () => {
  assert.equal(parseClock("17.00"), "17:00");
  assert.equal(parseClock("7:30"), "07:30");
  assert.equal(parseClock("24.00"), null);
  assert.equal(parseClock("17.60"), null);
  assert.equal(parseClock("abc"), null);
});

test("groupRuleRows menggabungkan hari dengan jam dan harga sama", () => {
  const rows = [
    { day_of_week: 1, start_time: "17:00:00", end_time: "22:00:00", price_per_hour: 250000 },
    { day_of_week: 2, start_time: "17:00:00", end_time: "22:00:00", price_per_hour: 250000 },
    { day_of_week: 6, start_time: "07:00:00", end_time: "10:00:00", price_per_hour: 200000 },
  ] as const;
  assert.deepEqual(groupRuleRows([...rows]), [
    { days: [1, 2], start: "17:00", end: "22:00", pricePerHour: 250000 },
    { days: [6], start: "07:00", end: "10:00", pricePerHour: 200000 },
  ]);
});
