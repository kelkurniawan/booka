// Tabel kasus harga di sini HARUS identik dengan bagian 79 di supabase/tests/99_verify.sql.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeCourtSlots,
  courtPrice,
  durationOptions,
  formatDuration,
  pickCourt,
  startingPrice,
  type CourtPriceRule,
} from "./court";

const MON = "2026-11-23"; // Senin
const SAT = "2026-11-28"; // Sabtu
const rules: CourtPriceRule[] = [{ dayOfWeek: 1, start: "17:00", end: "22:00", pricePerHour: 250000 }];
const p = (dateISO: string, startHHMM: string, durationMinutes: number, unitMinutes: 30 | 60 = 30, base = 150000, r = rules) =>
  courtPrice({ basePerHour: base, rules: r, dateISO, startHHMM, durationMinutes, unitMinutes });

test("courtPrice: kasus tabel bersama SQL", () => {
  assert.equal(p(MON, "16:30", 90).total, 325000);
  assert.equal(p(MON, "16:00", 60).total, 150000);
  assert.equal(p(MON, "17:00", 60).total, 250000);
  assert.equal(p(SAT, "16:00", 90).total, 225000);
  assert.equal(p(MON, "16:00", 120, 60).total, 400000);
  assert.equal(p(MON, "10:00", 30, 30, 100000, []).total, 50000);
  assert.equal(p(MON, "10:00", 30, 30, 99999, []).total, 50000); // 49999,5 dibulatkan naik
  assert.equal(p(MON, "21:30", 60).total, 200000); // t79.1h
});

test("courtPrice: segmen biasa lalu ramai", () => {
  assert.deepEqual(p(MON, "16:30", 90).segments, [
    { fromHHMM: "16:30", toHHMM: "17:00", pricePerHour: 150000, minutes: 30, peak: false },
    { fromHHMM: "17:00", toHHMM: "18:00", pricePerHour: 250000, minutes: 60, peak: true },
  ]);
});

test("startingPrice: terendah dari dasar dan aturan", () => {
  assert.equal(startingPrice(150000, rules), 150000);
  assert.equal(startingPrice(150000, [{ ...rules[0], pricePerHour: 100000 }]), 100000);
});

test("durationOptions dan formatDuration", () => {
  assert.deepEqual(durationOptions({ minMinutes: 60, maxMinutes: 120, unitMinutes: 30 }), [60, 90, 120]);
  assert.equal(formatDuration(60), "1 jam");
  assert.equal(formatDuration(90), "1,5 jam");
  assert.equal(formatDuration(120), "2 jam");
  assert.equal(formatDuration(30), "0,5 jam");
});

const courts = [
  { id: "c2", name: "Lapangan 2", sortOrder: 2 },
  { id: "c1", name: "Lapangan 1", sortOrder: 1 },
  { id: "c3", name: "Lapangan 3", sortOrder: 3 },
];
const avail = [{ day_of_week: 1 as const, start_time: "08:00:00", end_time: "10:00:00" }];
const now = new Date("2026-11-20T00:00:00Z");
const bk = (courtId: string, s: string, e: string) => ({
  courtId,
  start_datetime: `${MON}T${s}:00+07:00`,
  end_datetime: `${MON}T${e}:00+07:00`,
});
const slots = (booked: ReturnType<typeof bk>[], durationMinutes = 60) =>
  computeCourtSlots({ dateISO: MON, availability: avail, courts, booked, unitMinutes: 30, durationMinutes, now });

test("computeCourtSlots: grid 30 menit, durasi harus muat", () => {
  assert.deepEqual(slots([]).map((s) => s.time), ["08:00", "08:30", "09:00"]);
  assert.deepEqual(slots([]).map((s) => s.free.map((f) => f.courtId))[0], ["c1", "c2", "c3"]);
  assert.deepEqual(slots([], 90).map((s) => s.time), ["08:00", "08:30"]);
});

test("computeCourtSlots: satu terisi sisakan dua, semua terisi full", () => {
  const one = slots([bk("c1", "08:00", "09:00")]);
  assert.equal(one[0].free.length, 2);
  assert.equal(one[0].full, false);
  const all = slots(courts.map((c) => bk(c.id, "08:00", "09:00")));
  assert.equal(all[0].full, true);
  assert.equal(all[0].free.length, 0);
  assert.equal(all.length, 3); // slot penuh tetap dikembalikan
});

test("computeCourtSlots: irisan sebagian memblokir, ujung bersentuhan tidak", () => {
  const r = slots([bk("c1", "08:30", "09:00")]);
  assert.equal(r[0].free.some((f) => f.courtId === "c1"), false); // 08:00-09:00 beririsan
  assert.equal(r[2].free.some((f) => f.courtId === "c1"), true); // 09:00 mulai tepat saat selesai
});

test("computeCourtSlots: slot lewat dibuang", () => {
  const r = computeCourtSlots({
    dateISO: MON, availability: avail, courts, booked: [], unitMinutes: 30, durationMinutes: 60,
    now: new Date(`${MON}T08:30:00+07:00`),
  });
  assert.deepEqual(r.map((s) => s.time), ["09:00"]);
});

test("pickCourt: diminta, atau urut sort_order lalu nama", () => {
  const free = [
    { courtId: "b", name: "B", sortOrder: 2 },
    { courtId: "a2", name: "Z", sortOrder: 1 },
    { courtId: "a1", name: "A", sortOrder: 1 },
  ];
  assert.equal(pickCourt(free, null), "a1");
  assert.equal(pickCourt(free, "b"), "b");
  assert.equal(pickCourt(free, "x"), null);
  assert.equal(pickCourt([], null), null);
});

test("courtPrice: booking berakhir tepat di akhir aturan semuanya ramai, unit berikutnya dasar", () => {
  assert.equal(p(MON, "21:00", 60).total, 250000); // 21:00-22:00 habis di ujung aturan
  assert.deepEqual(p(MON, "21:00", 60).segments.map((s) => s.peak), [true]);
  assert.equal(p(MON, "21:30", 60).total, 200000); // kembaran t79.1h: 21:30 ramai, 22:00 sudah dasar (ujung eksklusif)
  assert.equal(p(MON, "22:00", 30).total, 75000);
});

test("courtPrice: aturan hari lain tidak memengaruhi hari Senin", () => {
  const tue: CourtPriceRule[] = [{ dayOfWeek: 2, start: "17:00", end: "22:00", pricePerHour: 250000 }];
  assert.equal(p(MON, "17:00", 60, 30, 150000, tue).total, 150000);
  assert.equal(p("2026-11-24", "17:00", 60, 30, 150000, tue).total, 250000);
});

test("computeCourtSlots: unit 60 menit memakai grid per jam", () => {
  const out = computeCourtSlots({
    dateISO: MON, availability: avail, courts, booked: [], unitMinutes: 60, durationMinutes: 60, now,
  });
  assert.deepEqual(out.map((s) => s.time), ["08:00", "09:00"]);
});

test("durationOptions: unit nol atau negatif tidak menggantung", () => {
  assert.deepEqual(durationOptions({ minMinutes: 60, maxMinutes: 120, unitMinutes: 0 }), []);
  assert.deepEqual(durationOptions({ minMinutes: 60, maxMinutes: 120, unitMinutes: -30 }), []);
});
