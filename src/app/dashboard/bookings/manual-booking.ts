import { z } from "zod";

import { mapBookingError } from "@/lib/booking/errors";
import { customerNameSchema, customerWhatsappSchema } from "@/lib/validations/booking";

export const manualBookingSchema = z.object({
  serviceId: z.uuid(),
  staffId: z.uuid().nullable(),
  startISO: z.iso.datetime({ offset: true }),
  customerName: customerNameSchema,
  customerWhatsapp: customerWhatsappSchema,
});

export type ManualBookingInput = z.input<typeof manualBookingSchema>;
export type ManualBookingResult = { ok: true; id: string } | { ok: false; message: string };

const MANUAL_ERRORS: Record<string, string> = {
  P0002: "Kuota transaksi bulan ini sudah habis. Upgrade paket di menu Langganan untuk menambah booking.",
  "23P01": "Jam itu sudah terisi. Pilih jam lain.",
  BK001: "Jam itu di luar jam buka. Pilih jam lain.",
  P0006: "Jam itu sudah lewat. Pilih jam lain.",
  BK035: "Batas 50 booking manual per hari tercapai. Coba lagi besok.",
};

/** Pesan untuk merchant; kode lain jatuh ke mapBookingError(code).message. */
export function manualBookingErrorMessage(code: string | null | undefined): string {
  return (code && MANUAL_ERRORS[code]) || mapBookingError(code).message;
}

const RESCHEDULE_ERRORS: Record<string, string> = {
  BK034: "Booking ini tidak bisa dijadwal ulang.",
  BK036: "Booking ini sudah dijadwal ulang 3 kali.",
  BK001: "Jam itu di luar jam buka. Pilih jam lain.",
  BK003: "Staf untuk booking ini sudah tidak aktif.",
  "23P01": "Jam itu sudah terisi. Pilih jam lain.",
  P0006: "Jam itu sudah lewat. Pilih jam lain.",
};

/** Pesan jadwal ulang oleh merchant; kode lain jatuh ke pesan umum. */
export function rescheduleErrorMessage(code: string | null | undefined): string {
  return (code && RESCHEDULE_ERRORS[code]) || "Gagal menyimpan. Coba lagi.";
}
