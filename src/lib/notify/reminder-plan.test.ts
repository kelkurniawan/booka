import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_REMINDER_SETTINGS, reachableOffsets, reminderChannels } from "./reminder-plan";

const S = DEFAULT_REMINDER_SETTINGS;

test("tanpa prefs: WA saja untuk H-1, hari H mati", () => {
  assert.deepEqual(reminderChannels("DAY_BEFORE", S, null, false), ["WHATSAPP"]);
  assert.deepEqual(reminderChannels("SAME_DAY", S, null, true), []);
});

test("prefs menimpa default merchant, null ikut merchant", () => {
  const p = { whatsapp: false, email: "a@b.co", day_before: null, same_day: true };
  assert.deepEqual(reminderChannels("DAY_BEFORE", S, p, true), ["EMAIL", "PUSH"]);
  assert.deepEqual(reminderChannels("SAME_DAY", S, p, false), ["EMAIL"]);
});

test("kanal yang dimatikan merchant tidak pernah dipakai", () => {
  const off = { ...S, reminder_whatsapp: false, reminder_push: false };
  assert.deepEqual(reminderChannels("DAY_BEFORE", off, null, true), []);
});

// Booking mulai Sabtu 21 Nov 2026 14:00 WIB (07:00 UTC), selesai 15:00 WIB.
const START = "2026-11-21T07:00:00Z";
const END = "2026-11-21T08:00:00Z";
const at = (iso: string) => Date.parse(iso);

test("reachableOffsets: dibuat sebelum 08.00 hari sebelumnya, kedua offset terjangkau", () => {
  // Jumat 20 Nov 07:59 WIB
  assert.deepEqual(reachableOffsets(START, END, at("2026-11-20T00:59:00Z")), { dayBefore: true, sameDay: true });
});

test("reachableOffsets: dibuat setelah 08.00 hari sebelumnya, H-1 sudah lewat", () => {
  // Jumat 20 Nov 08:01 WIB
  assert.deepEqual(reachableOffsets(START, END, at("2026-11-20T01:01:00Z")), { dayBefore: false, sameDay: true });
});

test("reachableOffsets: hari H sebelum 08.30, mulai 08.30 atau lebih lambat masih terjangkau", () => {
  // Sabtu 21 Nov 06:00 WIB; booking mulai 08:30 WIB (01:30 UTC)
  const now = at("2026-11-20T23:00:00Z");
  assert.deepEqual(reachableOffsets("2026-11-21T01:30:00Z", "2026-11-21T02:30:00Z", now), { dayBefore: false, sameDay: true });
});

test("reachableOffsets: mulai sebelum 08.30 WIB, hari H tidak pernah terkirim", () => {
  // mulai 08:29 WIB; dibuat hari sebelumnya 07:00 WIB
  const now = at("2026-11-19T00:00:00Z");
  assert.deepEqual(reachableOffsets("2026-11-21T01:29:00Z", "2026-11-21T02:29:00Z", now), { dayBefore: true, sameDay: false });
});

test("reachableOffsets: hari H lewat jam kirim 08.00 -> mati", () => {
  // Sabtu 21 Nov 08:10 WIB
  assert.deepEqual(reachableOffsets(START, END, at("2026-11-21T01:10:00Z")), { dayBefore: false, sameDay: false });
});

test("reachableOffsets: booking sudah selesai -> keduanya mati", () => {
  assert.deepEqual(reachableOffsets(START, END, at("2026-11-21T08:00:00Z")), { dayBefore: false, sameDay: false });
});
