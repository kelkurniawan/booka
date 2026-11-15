import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_REMINDER_SETTINGS, reminderChannels } from "./reminder-plan";

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
