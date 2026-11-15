import assert from "node:assert/strict";
import { test } from "node:test";

import { reminderPrefsSchema } from "./reminder-prefs";

const BASE = { whatsapp: true, email: null, day_before: true, same_day: false };

test("email kosong menjadi null", () => {
  const r = reminderPrefsSchema.safeParse({ ...BASE, email: "" });
  assert.ok(r.success);
  assert.equal(r.data.email, null);
});

test("email valid diterima, tidak valid ditolak", () => {
  assert.ok(reminderPrefsSchema.safeParse({ ...BASE, email: "a@b.co" }).success);
  assert.equal(reminderPrefsSchema.safeParse({ ...BASE, email: "bukan" }).success, false);
  assert.equal(reminderPrefsSchema.safeParse({ ...BASE, email: `${"a".repeat(250)}@b.co` }).success, false);
});

test("day_before wajib boolean", () => {
  assert.equal(reminderPrefsSchema.safeParse({ ...BASE, day_before: undefined }).success, false);
  assert.equal(reminderPrefsSchema.safeParse({ ...BASE, day_before: "true" }).success, false);
});
