import { z } from "zod";

/**
 * Aturan di sini harus persis sama dengan constraint tabel `services` di
 * supabase/migrations/20260729000100_init_schema.sql:
 *   - services_name_length: nama (trim) 2..80 karakter
 *   - services_description_length: deskripsi <= 500 karakter atau null
 *   - services_price_non_negative: harga >= 0
 *   - services_duration_range: durasi 5..480 menit
 * Validasi di sini hanya untuk pesan error yang ramah — database tetap
 * penjaga terakhirnya.
 */

// Kolom price bertipe numeric(12, 2): 12 digit total, 2 di antaranya desimal.
export const MAX_SERVICE_PRICE = 9_999_999_999.99;

export const serviceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nama layanan minimal 2 karakter")
    .max(80, "Nama layanan maksimal 80 karakter"),
  // Textarea kosong dianggap "tanpa deskripsi", bukan string kosong.
  description: z
    .string()
    .max(500, "Deskripsi maksimal 500 karakter")
    .transform((value) => value.trim())
    .transform((value) => (value.length > 0 ? value : null)),
  price: z.coerce
    .number("Harga wajib diisi dengan angka")
    .nonnegative("Harga tidak boleh negatif")
    .max(MAX_SERVICE_PRICE, "Harga terlalu besar"),
  duration_minutes: z.coerce
    .number("Durasi wajib diisi dengan angka")
    .int("Durasi harus bilangan bulat menit")
    .min(5, "Durasi minimal 5 menit")
    .max(480, "Durasi maksimal 480 menit (8 jam)"),
});

export type ServiceInput = z.input<typeof serviceSchema>;
export type ServiceValues = z.output<typeof serviceSchema>;
