import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bookingCode, customerManageErrorMessage, DEFAULT_MANAGE_SETTINGS, manageState, policyLines,
} from "./customer-manage";

// 10:00 WIB.
const NOW = Date.parse("2026-11-16T03:00:00Z");
const s = { ...DEFAULT_MANAGE_SETTINGS, allow_customer_reschedule: true, allow_customer_cancel: true };
const b = { id: "7f3a9c00-1111-2222-3333-444444444444", status: "CONFIRMED", attended_at: null, no_show_at: null,
  reschedule_count: 0, amount_due_now: 0, start_datetime: "2026-11-21T03:00:00Z" } as const;

test("ubah jadwal: deadline, sisa, jadwal baru paling cepat", () => {
  assert.deepEqual(manageState(b, s, NOW).reschedule, {
    allowed: true, deadline: "2026-11-20T03:00:00.000Z", left: 1, earliestNewStart: "2026-11-17T03:00:00.000Z" });
});
test("ubah jadwal ditolak: OFF, STATUS, DEADLINE, LIMIT", () => {
  assert.deepEqual(manageState(b, DEFAULT_MANAGE_SETTINGS, NOW).reschedule, { allowed: false, reason: "OFF" });
  assert.deepEqual(manageState({ ...b, attended_at: "2026-11-16T00:00:00Z" }, s, NOW).reschedule, { allowed: false, reason: "STATUS" });
  assert.deepEqual(manageState({ ...b, status: "REQUESTED" }, s, NOW).reschedule, { allowed: false, reason: "STATUS" });
  assert.deepEqual(manageState({ ...b, start_datetime: "2026-11-16T20:00:00Z" }, s, NOW).reschedule, { allowed: false, reason: "DEADLINE" });
  assert.deepEqual(manageState({ ...b, reschedule_count: 1 }, s, NOW).reschedule, { allowed: false, reason: "LIMIT" });
});
test("batal: REQUESTED selalu boleh sebelum mulai, PENDING tidak", () => {
  assert.deepEqual(manageState({ ...b, status: "REQUESTED" }, DEFAULT_MANAGE_SETTINGS, NOW).cancel, { allowed: true, deadline: null });
  assert.deepEqual(manageState({ ...b, status: "PENDING" }, s, NOW).cancel, { allowed: false, reason: "STATUS" });
  assert.deepEqual(manageState(b, s, NOW).cancel, { allowed: true, deadline: "2026-11-20T03:00:00.000Z" });
  assert.deepEqual(manageState({ ...b, start_datetime: "2026-11-16T20:00:00Z" }, s, NOW).cancel, { allowed: false, reason: "DEADLINE" });
});
test("policyLines REQUESTED hanya menyebut belum ada pembayaran", () => {
  assert.deepEqual(policyLines({ ...b, status: "REQUESTED" }, { ...s, allow_customer_cancel: false }, "X"), ["Belum ada pembayaran."]);
});

test("policyLines memakai policy_text atau baris pengembalian", () => {
  assert.equal(policyLines({ ...b, amount_due_now: 100000 }, s, "Rias by Sekar").at(-1), "Soal pengembalian pembayaran, hubungi Rias by Sekar.");
  assert.equal(policyLines(b, { ...s, policy_text: "DP tidak dikembalikan." }, "X").at(-1), "DP tidak dikembalikan.");
  assert.equal(policyLines(b, s, "X").length, 2);
});
test("bookingCode", () => assert.equal(bookingCode(b.id), "BK-7F3A9C"));
test("customerManageErrorMessage", () => {
  assert.equal(customerManageErrorMessage("BK043"), "Anda sudah memakai semua kesempatan ubah jadwal.");
  assert.equal(customerManageErrorMessage("BK044"), "Merchant tidak mengizinkan pembatalan lewat halaman ini.");
  assert.equal(customerManageErrorMessage("BK072"), "Semua lapangan penuh di jam itu. Pilih jam lain.");
  assert.equal(customerManageErrorMessage("BK073"), "Jam baru harganya lebih tinggi. Hubungi merchant untuk pindah ke jam ini.");
  assert.equal(customerManageErrorMessage("zzz"), "Gagal menyimpan. Coba lagi.");
  assert.equal(customerManageErrorMessage(undefined), "Gagal menyimpan. Coba lagi.");
});
