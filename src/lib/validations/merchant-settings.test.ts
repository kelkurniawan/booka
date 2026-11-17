import assert from "node:assert/strict";
import { test } from "node:test";

import { bookingSettingsSchema } from "./merchant-settings";

test("max_active_per_phone '0' ditolak", () => {
  assert.equal(bookingSettingsSchema.safeParse({ max_active_per_phone: "0" }).success, false);
});

test("max_active_per_phone '11' ditolak", () => {
  assert.equal(bookingSettingsSchema.safeParse({ max_active_per_phone: "11" }).success, false);
});

test("max_active_per_phone kosong jadi null, '2' jadi 2", () => {
  assert.equal(bookingSettingsSchema.parse({ max_active_per_phone: "" }).max_active_per_phone, null);
  assert.equal(bookingSettingsSchema.parse({ max_active_per_phone: "2" }).max_active_per_phone, 2);
});

test("checkbox 'on' jadi true, absen jadi false", () => {
  const p = bookingSettingsSchema.parse({ allow_pay_on_site: "on", max_active_per_phone: "" });
  assert.equal(p.allow_pay_on_site, true);
  assert.equal(p.auto_confirm_on_site, false);
  assert.equal(p.deposit_after_no_show, false);
});
