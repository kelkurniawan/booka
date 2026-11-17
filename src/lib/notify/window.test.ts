import assert from "node:assert/strict";
import { test } from "node:test";

import { sameDayRange, tomorrowJakartaRange } from "./window";

test("cron 01:00 UTC (08:00 WIB) 5 Okt -> seluruh 6 Okt WIB", () => {
  const { from, to } = tomorrowJakartaRange(new Date("2026-10-05T01:00:00Z"));
  // 6 Okt 00:00 WIB = 5 Okt 17:00 UTC.
  assert.equal(from.toISOString(), "2026-10-05T17:00:00.000Z");
  assert.equal(to.toISOString(), "2026-10-06T17:00:00.000Z");
});

test("instant 20:00 UTC 5 Okt sudah 6 Okt 03:00 WIB -> besoknya 7 Okt WIB", () => {
  const { from } = tomorrowJakartaRange(new Date("2026-10-05T20:00:00Z"));
  assert.equal(from.toISOString(), "2026-10-06T17:00:00.000Z");
});

test("sameDayRange 08:50 WIB -> mulai now + 30 menit, sampai awal besok WIB", () => {
  const { from, to } = sameDayRange(new Date("2026-11-16T01:50:00Z"));
  assert.equal(from.toISOString(), "2026-11-16T02:20:00.000Z");
  assert.equal(to.toISOString(), "2026-11-16T17:00:00.000Z");
});

test("sameDayRange 23:50 WIB -> jendela kosong (from melewati to)", () => {
  const now = new Date("2026-11-16T16:50:00Z");
  const { from, to } = sameDayRange(now);
  assert.equal(from.getTime(), now.getTime() + 30 * 60 * 1000);
  assert.ok(from.getTime() > to.getTime());
});
