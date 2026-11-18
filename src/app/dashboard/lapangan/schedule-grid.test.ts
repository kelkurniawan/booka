import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BLOCK_LABEL,
  blockKind,
  buildScheduleGrid,
  countsText,
  gridHours,
  peakMatcher,
  holdsSlot,
  shiftDateISO,
  type ScheduleBooking,
} from "./schedule-grid";

// Jakarta = UTC+7: 16.30 WIB = 09:30Z.
const wib = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, 21, h - 7, m)).toISOString();
};

const courts = [
  { id: "c1", name: "Lapangan 1", note: "Indoor" },
  { id: "c2", name: "Lapangan 2", note: "Indoor" },
  { id: "c3", name: "Lapangan 3", note: "Outdoor" },
];

const bk = (over: Partial<ScheduleBooking> & Pick<ScheduleBooking, "id" | "courtId">, s: string, e: string): ScheduleBooking => ({
  customerName: "Dimas",
  startISO: wib(s),
  endISO: wib(e),
  status: "CONFIRMED",
  amountDueOnSite: 0,
  paidOnSiteAt: null,
  ...over,
});

const grid = (bookings: ScheduleBooking[], over: Partial<Parameters<typeof buildScheduleGrid>[0]> = {}) =>
  buildScheduleGrid({ courts, bookings, startHour: 7, endHour: 22, rowMinutes: 30, ...over });

test("blok 16.30 sampai 18.00 pada unit 30 mengisi 3 baris di kolom benar", () => {
  const g = grid([bk({ id: "b1", courtId: "c2" }, "16:30", "18:00")]);
  assert.equal(g.columns[1].blocks.length, 1);
  assert.equal(g.columns[0].blocks.length, 0);
  const b = g.columns[1].blocks[0];
  // (16.30 - 07.00) / 30 menit = baris ke-19.
  assert.equal(b.rowStart, 19);
  assert.equal(b.rowSpan, 3);
  assert.equal(b.bookingId, "b1");
});

test("unit 60: blok 16.00 sampai 18.00 mengisi 2 baris", () => {
  const g = grid([bk({ id: "b1", courtId: "c1" }, "16:00", "18:00")], { rowMinutes: 60 });
  assert.deepEqual([g.columns[0].blocks[0].rowStart, g.columns[0].blocks[0].rowSpan], [9, 2]);
  assert.equal(g.hours.length, 15);
});

test("dua booking jam sama di lapangan berbeda berada di kolom berbeda", () => {
  const g = grid([bk({ id: "a", courtId: "c1" }, "17:00", "18:00"), bk({ id: "b", courtId: "c3" }, "17:00", "18:00")]);
  assert.deepEqual(g.columns.map((c) => c.blocks.map((b) => b.bookingId)), [["a"], [], ["b"]]);
});

test("booking CANCELLED tidak muncul dan tidak dihitung", () => {
  const g = grid([bk({ id: "x", courtId: "c1", status: "CANCELLED" }, "10:00", "11:00")]);
  assert.equal(g.columns[0].blocks.length, 0);
  assert.deepEqual(g.counts, { total: 0, unpaid: 0 });
});

test("booking di lapangan yang tidak ada di daftar dibuang", () => {
  const g = grid([bk({ id: "x", courtId: "zzz" }, "10:00", "11:00")]);
  assert.equal(g.counts.total, 0);
});

test("rentang jam dipotong ke batas grid; di luar grid dibuang", () => {
  const g = grid(
    [bk({ id: "early", courtId: "c1" }, "06:00", "08:00"), bk({ id: "out", courtId: "c1" }, "22:00", "23:00")],
    { startHour: 7, endHour: 22 },
  );
  assert.deepEqual(g.columns[0].blocks.map((b) => [b.bookingId, b.rowStart, b.rowSpan]), [["early", 0, 2]]);
});

test("hitungan papan L4: 8 booking, 4 belum lunas", () => {
  const owes = { amountDueOnSite: 100000 };
  const g = grid([
    bk({ id: "1", courtId: "c1", status: "PAID" }, "07:00", "09:00"),
    bk({ id: "2", courtId: "c1", status: "PAID", ...owes }, "16:00", "18:00"),
    bk({ id: "3", courtId: "c1", status: "CONFIRMED", ...owes }, "19:00", "21:00"),
    bk({ id: "4", courtId: "c2", status: "PAID" }, "08:00", "09:30"),
    bk({ id: "5", courtId: "c2", status: "PENDING" }, "16:30", "18:00"),
    bk({ id: "6", courtId: "c2", status: "PAID" }, "18:00", "19:00"),
    bk({ id: "7", courtId: "c3", status: "REQUESTED" }, "10:00", "11:00"),
    bk({ id: "8", courtId: "c3", status: "PAID", ...owes }, "17:00", "19:00"),
  ]);
  assert.deepEqual(g.counts, { total: 8, unpaid: 4 });
  assert.equal(countsText(g.counts), "8 booking, 4 belum lunas");
  assert.equal(countsText(g.counts, 3), "8 booking di 3 lapangan, 4 belum lunas");
});

test("countsText tanpa booking", () => {
  assert.equal(countsText({ total: 0, unpaid: 0 }, 3), "Belum ada booking di tanggal ini");
});

test("label jam dan jam ramai", () => {
  const g = grid([], { peak: (m) => m >= 17 * 60 });
  assert.deepEqual(g.hours.slice(0, 3).map((h) => h.label), ["07.00", "07.30", "08.00"]);
  assert.equal(g.hours[0].peak, false);
  assert.equal(g.hours[20].label, "17.00");
  assert.equal(g.hours[20].peak, true);
  assert.equal(g.hours[19].peak, false);
});

test("kolom membawa nama dan catatan lapangan", () => {
  const g = grid([]);
  assert.deepEqual(g.columns.map((c) => [c.court.name, c.court.note]), [["Lapangan 1", "Indoor"], ["Lapangan 2", "Indoor"], ["Lapangan 3", "Outdoor"]]);
});

test("blockKind memetakan status ke empat gaya papan", () => {
  const b = (status: ScheduleBooking["status"], owes = 0, paid: string | null = null) =>
    blockKind({ status, amountDueOnSite: owes, paidOnSiteAt: paid });
  assert.equal(b("PAID"), "paid");
  assert.equal(b("CONFIRMED"), "paid");
  assert.equal(b("PAID", 5000), "dp");
  assert.equal(b("PAID", 5000, "2026-11-21T10:00:00Z"), "paid");
  assert.equal(b("CONFIRMED", 5000), "onsite");
  assert.equal(b("PENDING"), "pending");
  assert.equal(b("REQUESTED"), "request");
  assert.equal(b("CANCELLED"), null);
});

test("aria blok memuat nama, lapangan, jam, dan status", () => {
  const g = grid([bk({ id: "b", courtId: "c1", status: "PAID", amountDueOnSite: 1000 }, "16:00", "18:00")]);
  assert.equal(g.columns[0].blocks[0].aria, `Dimas, Lapangan 1, 16.00 sampai 18.00, ${BLOCK_LABEL.dp}`);
  assert.equal(g.columns[0].blocks[0].time, "16.00 sampai 18.00");
});

test("holdsSlot: PENDING dan REQUESTED kedaluwarsa tidak menahan jam", () => {
  const now = Date.parse("2026-11-21T03:00:00Z");
  assert.equal(holdsSlot({ status: "PENDING", expiresAt: "2026-11-21T02:00:00Z" }, now), false);
  assert.equal(holdsSlot({ status: "PENDING", expiresAt: "2026-11-21T04:00:00Z" }, now), true);
  assert.equal(holdsSlot({ status: "REQUESTED", expiresAt: "2026-11-21T02:00:00Z" }, now), false);
  assert.equal(holdsSlot({ status: "PAID", expiresAt: "2026-11-21T02:00:00Z" }, now), true);
  assert.equal(holdsSlot({ status: "CANCELLED", expiresAt: "2026-11-21T09:00:00Z" }, now), false);
});

test("shiftDateISO maju dan mundur lintas bulan", () => {
  assert.equal(shiftDateISO("2026-11-30", 1), "2026-12-01");
  assert.equal(shiftDateISO("2026-03-01", -1), "2026-02-28");
});

test("gridHours: jam buka dibulatkan ke jam penuh; hari tutup memakai bawaan", () => {
  assert.deepEqual(gridHours([{ start_time: "07:30:00", end_time: "21:15:00" }]), { startHour: 7, endHour: 22 });
  assert.deepEqual(gridHours([{ start_time: "08:00:00", end_time: "12:00:00" }, { start_time: "14:00:00", end_time: "23:00:00" }]), { startHour: 8, endHour: 23 });
  assert.deepEqual(gridHours([]), { startHour: 7, endHour: 22 });
  assert.equal(gridHours([{ start_time: "06:00:00", end_time: "24:00:00" }]).endHour, 24);
});

test("peakMatcher: batas akhir eksklusif", () => {
  const peak = peakMatcher([{ start: "17:00", end: "22:00" }]);
  assert.equal(peak(17 * 60), true);
  assert.equal(peak(16 * 60 + 59), false);
  assert.equal(peak(22 * 60), false);
  assert.equal(peakMatcher([])(18 * 60), false);
});
