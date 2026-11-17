import assert from "node:assert/strict";
import { test } from "node:test";

import { bookingSettingsSchema, contactSettingsSchema, customerPolicySchema } from "./merchant-settings";

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

const emptyContact = {
  contact_phone: "", contact_email: "", contact_instagram: "", contact_threads: "",
  contact_x: "", contact_tiktok: "", reply_from: "", reply_until: "",
  show_PHONE: "on", show_EMAIL: "on", show_INSTAGRAM: "on", show_THREADS: "on",
  show_X: "on", show_TIKTOK: "on", show_WHATSAPP: "on",
};

test("kontak: normalisasi dan kosong jadi null", () => {
  const r = contactSettingsSchema.parse({
    ...emptyContact, contact_instagram: "@riasbysekar", contact_phone: "0812-9876-5432", show_TIKTOK: undefined,
  });
  assert.equal(r.contact_instagram, "riasbysekar");
  assert.equal(r.contact_phone, "+6281298765432");
  assert.equal(r.contact_email, null);
  assert.equal(r.reply_from, null);
  assert.deepEqual(r.contact_hidden, ["TIKTOK"]);
});

test("kontak: jam balas harus berpasangan dan berurutan", () => {
  assert.equal(contactSettingsSchema.safeParse({ ...emptyContact, reply_from: "20:00", reply_until: "09:00" }).success, false);
  assert.equal(contactSettingsSchema.safeParse({ ...emptyContact, reply_from: "09:00" }).success, false);
  assert.equal(contactSettingsSchema.safeParse({ ...emptyContact, reply_from: "09:00", reply_until: "20:00" }).success, true);
});

test("kebijakan: batas angka dan teks kosong", () => {
  const base = {
    allow_customer_reschedule: "on", reschedule_min_hours: "24", max_reschedules: "1",
    allow_customer_cancel: "", cancel_min_hours: "24", policy_text: "",
  };
  assert.equal(customerPolicySchema.safeParse({ ...base, max_reschedules: "0" }).success, false);
  assert.equal(customerPolicySchema.safeParse({ ...base, reschedule_min_hours: "169" }).success, false);
  assert.equal(customerPolicySchema.parse(base).policy_text, null);
});
