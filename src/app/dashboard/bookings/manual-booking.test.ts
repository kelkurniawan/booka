import assert from "node:assert/strict";
import { test } from "node:test";

import { mapBookingError } from "@/lib/booking/errors";

import { manualBookingErrorMessage, manualBookingSchema, rescheduleErrorMessage } from "./manual-booking";

test("kode khusus punya pesan persis", () => {
  assert.equal(
    manualBookingErrorMessage("P0002"),
    "Kuota transaksi bulan ini sudah habis. Upgrade paket di menu Langganan untuk menambah booking.",
  );
  assert.equal(manualBookingErrorMessage("23P01"), "Jam itu sudah terisi. Pilih jam lain.");
  assert.equal(manualBookingErrorMessage("BK001"), "Jam itu di luar jam buka. Pilih jam lain.");
  assert.equal(manualBookingErrorMessage("P0006"), "Jam itu sudah lewat. Pilih jam lain.");
  assert.equal(
    manualBookingErrorMessage("BK035"),
    "Batas 50 booking manual per hari tercapai. Coba lagi besok.",
  );
});

test("kode lain jatuh ke mapBookingError", () => {
  assert.equal(manualBookingErrorMessage("BK002"), mapBookingError("BK002").message);
  assert.equal(manualBookingErrorMessage(undefined), mapBookingError(undefined).message);
});

const valid = {
  serviceId: "5f0c4d3e-1b2a-4c5d-8e9f-0a1b2c3d4e5f",
  staffId: null,
  startISO: "2030-01-07T02:00:00.000Z",
  customerName: "Budi",
  customerWhatsapp: "081234567890",
};

test("skema menerima staffId null", () => {
  assert.equal(manualBookingSchema.safeParse(valid).success, true);
});

test("skema menolak startISO tanpa offset dan serviceId bukan uuid", () => {
  assert.equal(manualBookingSchema.safeParse({ ...valid, startISO: "2030-01-07T09:00:00" }).success, false);
  assert.equal(manualBookingSchema.safeParse({ ...valid, serviceId: "abc" }).success, false);
});

test("rescheduleErrorMessage memetakan kode jadwal ulang", () => {
  assert.equal(rescheduleErrorMessage("BK034"), "Booking ini tidak bisa dijadwal ulang.");
  assert.equal(rescheduleErrorMessage("BK036"), "Booking ini sudah dijadwal ulang 3 kali.");
  assert.equal(rescheduleErrorMessage("BK001"), "Jam itu di luar jam buka. Pilih jam lain.");
  assert.equal(rescheduleErrorMessage("BK003"), "Staf untuk booking ini sudah tidak aktif.");
  assert.equal(rescheduleErrorMessage("23P01"), "Jam itu sudah terisi. Pilih jam lain.");
  assert.equal(rescheduleErrorMessage("P0006"), "Jam itu sudah lewat. Pilih jam lain.");
  assert.equal(rescheduleErrorMessage("XX"), "Gagal menyimpan. Coba lagi.");
  assert.equal(rescheduleErrorMessage(undefined), "Gagal menyimpan. Coba lagi.");
});
