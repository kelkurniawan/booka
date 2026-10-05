import assert from "node:assert/strict";
import { test } from "node:test";

import { aggregateBookings, bucketKeys, type AnalyticsBooking } from "./aggregate";

// Rentang: 1-8 Okt 2026 WIB (1 Okt 00:00 WIB = 30 Sep 17:00 UTC).
const range = {
  from: new Date("2026-09-30T17:00:00Z"),
  to: new Date("2026-10-07T17:00:00Z"),
};

function booking(overrides: Partial<AnalyticsBooking>): AnalyticsBooking {
  return {
    status: "PAID",
    service_name: "Potong",
    service_price: 50000,
    created_at: "2026-10-02T03:00:00Z",
    paid_at: "2026-10-02T03:05:00Z",
    // Senin 5 Okt 10:00 WIB.
    start_datetime: "2026-10-05T03:00:00Z",
    customer_whatsapp: "+6281100000001",
    ...overrides,
  };
}

test("bucketKeys harian mencakup setiap tanggal WIB tepat sekali", () => {
  const keys = bucketKeys(range.from, range.to, "day");
  assert.equal(keys.length, 7);
  assert.equal(keys[0], "2026-10-01");
  assert.equal(keys[6], "2026-10-07");
});

test("bucketKeys mingguan dimulai dari Senin", () => {
  // 1 Okt 2026 hari Kamis -> minggunya dimulai Senin 28 Sep.
  assert.deepEqual(bucketKeys(range.from, range.to, "week"), ["2026-09-28", "2026-10-05"]);
});

test("pendapatan hanya dari PAID dalam rentang, menurut paid_at", () => {
  const summary = aggregateBookings(
    [
      booking({}),
      booking({ status: "CANCELLED", paid_at: null }),
      booking({ paid_at: "2026-09-20T03:00:00Z", created_at: "2026-09-20T03:00:00Z" }),
    ],
    range,
    "day",
  );
  assert.equal(summary.revenue, 50000);
  assert.equal(summary.paidCount, 1);
  // Booking September tidak dihitung sebagai dibuat di periode ini.
  assert.equal(summary.createdCount, 2);
  assert.equal(summary.payRate, 0.5);
  assert.equal(summary.series.find((p) => p.key === "2026-10-02")?.revenue, 50000);
});

test("pelanggan kembali = pelanggan yang membayar lebih dari sekali", () => {
  const summary = aggregateBookings(
    [
      booking({}),
      booking({ paid_at: "2026-10-03T03:00:00Z", created_at: "2026-10-03T03:00:00Z" }),
      booking({ customer_whatsapp: "+6281100000002" }),
    ],
    range,
    "day",
  );
  assert.equal(summary.repeatCustomerRate, 0.5);
});

test("layanan teratas diurutkan menurut pendapatan, staf hanya bila diisi", () => {
  const summary = aggregateBookings(
    [
      booking({ service_name: "Potong", staff_name: "Dewi" }),
      booking({ service_name: "Creambath", service_price: 120000, staff_name: "Andi" }),
      booking({ service_name: "Potong" }),
    ],
    range,
    "day",
  );
  assert.deepEqual(
    summary.topServices.map((s) => s.name),
    ["Creambath", "Potong"],
  );
  assert.deepEqual(
    summary.byStaff.map((s) => [s.name, s.count]),
    [
      ["Andi", 1],
      ["Dewi", 1],
    ],
  );
});

test("hari tersibuk memakai hari jadwal WIB, Senin di indeks 0", () => {
  const summary = aggregateBookings([booking({})], range, "day");
  assert.deepEqual(summary.byWeekday, [1, 0, 0, 0, 0, 0, 0]);
});

test("tanpa booking: rasio null, bukan 0 atau NaN", () => {
  const summary = aggregateBookings([], range, "month");
  assert.equal(summary.payRate, null);
  assert.equal(summary.repeatCustomerRate, null);
  assert.equal(summary.series.length, 1);
});
