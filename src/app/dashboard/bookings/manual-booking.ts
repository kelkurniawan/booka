import { z } from "zod";

import { mapBookingError } from "@/lib/booking/errors";
import { customerNameSchema, customerWhatsappSchema } from "@/lib/validations/booking";

export const manualBookingSchema = z.object({
  serviceId: z.uuid(),
  staffId: z.uuid().nullable(),
  startISO: z.iso.datetime({ offset: true }),
  customerName: customerNameSchema,
  customerWhatsapp: customerWhatsappSchema,
  partySize: z.number().int().min(1).max(200).nullable().default(null),
  tableId: z.uuid().nullable().default(null),
  customerNote: z.string().trim().max(300).nullable().default(null),
  // Sewa lapangan: lapangan null = "Mana saja"; lama main wajib untuk layanan sewa (dicek RPC, BK071).
  courtId: z.uuid().nullable().default(null),
  durationMinutes: z.number().int().min(1).max(480).nullable().default(null),
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
  BK060: "Kursi atau meja di jam itu sudah penuh. Pilih jam lain.",
  BK061: "Meja itu sudah terisi di jam baru. Pilih jam lain.",
  BK072: "Semua lapangan penuh di jam baru. Pilih jam lain.",
  BK070: "Lapangan yang dipilih tidak tersedia di jam baru. Pilih lapangan atau jam lain.",
  BK063: "Jumlah tamu di luar batas layanan ini.",
};

/** Pesan jadwal ulang oleh merchant; kode lain jatuh ke pesan umum. */
export function rescheduleErrorMessage(code: string | null | undefined): string {
  return (code && RESCHEDULE_ERRORS[code]) || "Gagal menyimpan. Coba lagi.";
}

export type ManualPrefill = { courtId: string | null; dateISO: string | null; timeHHMM: string | null };

/** Prefill dari ketukan sel kosong jadwal lapangan (?court=&date=&time=); nilai tak valid jadi null. */
export function parseManualPrefill(params: { court?: string; date?: string; time?: string }): ManualPrefill {
  const okDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) && !Number.isNaN(Date.parse(`${params.date}T00:00:00Z`));
  return {
    courtId: params.court && z.uuid().safeParse(params.court).success ? params.court : null,
    dateISO: okDate ? params.date! : null,
    timeHHMM: params.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(params.time) ? params.time : null,
  };
}
