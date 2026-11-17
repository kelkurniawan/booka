import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDateStrip, groupSlotsByPeriod, monthLabel, nearestSlotText, nextOpenDate } from "./schedule";

test("buildDateStrip menandai hari tutup tanpa membuangnya", () => {
  // 2026-11-16 adalah Senin. Buka Senin sampai Jumat.
  const strip = buildDateStrip(new Set([1, 2, 3, 4, 5]), "2026-11-16", 7);
  assert.equal(strip.length, 7);
  assert.deepEqual(strip.map((d) => d.open), [true, true, true, true, true, false, false]);
  assert.equal(strip[6].dateISO, "2026-11-22");
});

test("buildDateStrip melewati akhir bulan", () => {
  const strip = buildDateStrip(new Set([1, 2, 3, 4, 5, 6, 7]), "2026-11-29", 3);
  assert.deepEqual(strip.map((d) => d.dateISO), ["2026-11-29", "2026-11-30", "2026-12-01"]);
});

test("buildDateStrip tanpa hari buka mengembalikan semua tutup", () => {
  const strip = buildDateStrip(new Set(), "2026-11-16");
  assert.equal(strip.length, 14);
  assert.ok(strip.every((d) => !d.open));
});

test("nextOpenDate mencari hari buka setelah tanggal tertentu", () => {
  const strip = buildDateStrip(new Set([1]), "2026-11-16", 14);
  assert.equal(nextOpenDate(strip, "2026-11-16"), "2026-11-23");
  assert.equal(nextOpenDate(strip, "2026-11-23"), null);
});

test("groupSlotsByPeriod mengelompokkan dan membuang kelompok kosong", () => {
  const slot = (label: string) => ({ startUtc: label, endUtc: label, label });
  const groups = groupSlotsByPeriod(["09:00", "10:30", "11:00", "18:00"].map(slot));
  assert.deepEqual(
    groups.map((g) => [g.period, g.slots.map((s) => s.label)]),
    [["PAGI", ["09:00", "10:30"]], ["SIANG", ["11:00"]], ["MALAM", ["18:00"]]],
  );
  assert.deepEqual(groupSlotsByPeriod([]), []);
});

test("monthLabel memakai bahasa Indonesia", () => {
  assert.equal(monthLabel("2026-11-21"), "November 2026");
});

test("nearestSlotText: hari ini, besok, nama hari, kosong", () => {
  const today = "2026-11-16";
  assert.equal(nearestSlotText({ dateISO: "2026-11-16", label: "14:00" }, today), "Hari ini 14:00");
  assert.equal(nearestSlotText({ dateISO: "2026-11-17", label: "09:00" }, today), "Besok 09:00");
  assert.equal(nearestSlotText({ dateISO: "2026-11-21", label: "10:00" }, today), "Sab 10:00");
  assert.equal(nearestSlotText(null, today), "Belum ada jadwal");
});
