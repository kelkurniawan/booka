import assert from "node:assert/strict";
import { test } from "node:test";

import { mapBookingError } from "@/lib/booking/errors";

import { manualBookingErrorMessage, manualBookingSchema, parseManualPrefill, rescheduleErrorMessage } from "./manual-booking";

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
  assert.equal(rescheduleErrorMessage("BK072"), "Semua lapangan penuh di jam baru. Pilih jam lain.");
  assert.equal(rescheduleErrorMessage("BK003"), "Staf untuk booking ini sudah tidak aktif.");
  assert.equal(rescheduleErrorMessage("23P01"), "Jam itu sudah terisi. Pilih jam lain.");
  assert.equal(rescheduleErrorMessage("P0006"), "Jam itu sudah lewat. Pilih jam lain.");
  assert.equal(rescheduleErrorMessage("XX"), "Gagal menyimpan. Coba lagi.");
  assert.equal(rescheduleErrorMessage(undefined), "Gagal menyimpan. Coba lagi.");
});

const court = { courtId: "6f0c4d3e-1b2a-4c5d-8e9f-0a1b2c3d4e5f", durationMinutes: 90 };

test("skema sewa: courtId dan durationMinutes diterima; bawaan null", () => {
  const ok = manualBookingSchema.safeParse({ ...valid, ...court });
  assert.equal(ok.success, true);
  const plain = manualBookingSchema.parse(valid);
  assert.equal(plain.courtId, null);
  assert.equal(plain.durationMinutes, null);
  // "Mana saja": lapangan null tetapi lama main terisi.
  assert.equal(manualBookingSchema.safeParse({ ...valid, courtId: null, durationMinutes: 60 }).success, true);
});

test("skema sewa menolak courtId bukan uuid dan durasi tak wajar", () => {
  assert.equal(manualBookingSchema.safeParse({ ...valid, courtId: "x", durationMinutes: 60 }).success, false);
  assert.equal(manualBookingSchema.safeParse({ ...valid, durationMinutes: 0 }).success, false);
  assert.equal(manualBookingSchema.safeParse({ ...valid, durationMinutes: 45.5 }).success, false);
  assert.equal(manualBookingSchema.safeParse({ ...valid, durationMinutes: 481 }).success, false);
});

test("manualBookingErrorMessage: kode sewa dan RPC bersesi punya pesan Indonesia spesifik", () => {
  assert.match(manualBookingErrorMessage("BK070"), /Lapangan yang dipilih tidak tersedia/);
  assert.match(manualBookingErrorMessage("BK071"), /Lama main tidak valid/);
  assert.match(manualBookingErrorMessage("BK072"), /Semua lapangan penuh/);
  assert.match(manualBookingErrorMessage("23P01"), /sudah terisi/);
  assert.match(manualBookingErrorMessage("42501"), /tidak punya akses/);
  assert.match(manualBookingErrorMessage("22023"), /Data tidak valid/);
  assert.match(manualBookingErrorMessage("23503"), /tidak cocok/);
});

test("manualBookingErrorMessage: kode tak dikenal tidak membocorkan teks mentah", () => {
  assert.equal(manualBookingErrorMessage("XX999"), "Gagal membuat booking, silakan coba lagi.");
  assert.equal(manualBookingErrorMessage(undefined), "Gagal membuat booking, silakan coba lagi.");
});

test("parseManualPrefill: nilai valid lolos", () => {
  assert.deepEqual(parseManualPrefill({ court: court.courtId, date: "2026-11-21", time: "16:30" }), {
    courtId: court.courtId,
    dateISO: "2026-11-21",
    timeHHMM: "16:30",
  });
});

test("parseManualPrefill: nilai tak valid atau kosong jadi null", () => {
  assert.deepEqual(parseManualPrefill({}), { courtId: null, dateISO: null, timeHHMM: null });
  assert.deepEqual(parseManualPrefill({ court: "x", date: "21-11-2026", time: "25:00" }), {
    courtId: null,
    dateISO: null,
    timeHHMM: null,
  });
  assert.equal(parseManualPrefill({ date: "2026-13-45" }).dateISO, null);
  assert.equal(parseManualPrefill({ time: "9:00" }).timeHHMM, null);
});
