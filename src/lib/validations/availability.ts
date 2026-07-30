import { z } from "zod";

/**
 * Aturan di sini harus persis sama dengan constraint tabel `availability` di
 * supabase/migrations/20260729000100_init_schema.sql:
 *   - availability_day_range: day_of_week 1..7 (ISO-8601: 1 = Senin ... 7 = Minggu,
 *     sama dengan `extract(isodow from ...)` di Postgres)
 *   - availability_time_order: end_time > start_time
 *   - availability_no_overlap: exclusion constraint GiST menolak dua rentang jam
 *     yang tumpang tindih pada merchant + hari yang sama. Tidak bisa divalidasi
 *     di sini karena perlu melihat baris lain — database tetap penjaga terakhir,
 *     ditangkap terpisah lewat errcode 23P01 di actions.ts.
 * Validasi di sini hanya untuk pesan error yang ramah.
 */

const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;

export const availabilitySchema = z
  .object({
    day_of_week: z.coerce
      .number("Hari wajib dipilih")
      .int("Hari tidak valid")
      .min(1, "Hari tidak valid")
      .max(7, "Hari tidak valid"),
    start_time: z.string().regex(TIME_FORMAT, "Format jam mulai harus HH:mm"),
    end_time: z.string().regex(TIME_FORMAT, "Format jam selesai harus HH:mm"),
  })
  // HH:mm berdigit tetap (regex di atas menjaminnya), jadi perbandingan string
  // di sini setara dengan perbandingan waktu numerik.
  .refine((data) => data.end_time > data.start_time, {
    message: "Jam selesai harus setelah jam mulai",
    path: ["end_time"],
  });

export type AvailabilityInput = z.input<typeof availabilitySchema>;
export type AvailabilityValues = z.output<typeof availabilitySchema>;
