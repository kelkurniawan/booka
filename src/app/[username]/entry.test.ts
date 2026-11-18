import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveEntry } from "./entry";

const services = [{ id: "a" }, { id: "b" }];

test("tanpa tautan: semua null", () => {
  assert.deepEqual(resolveEntry(null, services, null), { serviceId: null, voucherCode: null, notice: null });
});

test("layanan aktif + voucher berlaku", () => {
  assert.deepEqual(resolveEntry({ serviceId: "a", voucherCode: "HEMAT20" }, services, "VALID"), {
    serviceId: "a",
    voucherCode: "HEMAT20",
    notice: "VOUCHER_APPLIED",
  });
});

test("voucher kedaluwarsa: kode dikosongkan", () => {
  assert.deepEqual(resolveEntry({ serviceId: "a", voucherCode: "HEMAT20" }, services, "EXPIRED"), {
    serviceId: "a",
    voucherCode: null,
    notice: "VOUCHER_EXPIRED",
  });
});

test("layanan terhapus: serviceId null", () => {
  const e = resolveEntry({ serviceId: "x", voucherCode: null }, services, null);
  assert.equal(e.serviceId, null);
  assert.equal(e.notice, "SERVICE_GONE");
});

test("belum diperiksa: kode tetap, tanpa pesan", () => {
  assert.deepEqual(resolveEntry({ serviceId: null, voucherCode: "ABCD" }, services, null), {
    serviceId: null,
    voucherCode: "ABCD",
    notice: null,
  });
});

import { voucherFailureMessage } from "./entry";

test("pesan gagal voucher: kedaluwarsa, alasan server, jaringan", () => {
  assert.equal(
    voucherFailureMessage(new Error("Kode voucher tidak ditemukan atau sudah tidak berlaku."), "ABCD").title,
    "Kode ABCD sudah tidak berlaku.",
  );
  assert.match(voucherFailureMessage(new Error("Kuota voucher ini sudah habis."), "ABCD").body, /^Kuota voucher ini sudah habis\. Booking/);
  assert.equal(voucherFailureMessage(new TypeError("Failed to fetch"), "ABCD").title, "Voucher belum bisa dicek.");
});
