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

// Objek polos tanpa refinement: wizard onboarding memakai .omit()/.shape, yang
// ditolak Zod 4 pada skema ber-refinement. serviceSchema di bawah menambahkan
// aturan DP yang bergantung pada beberapa kolom sekaligus.
export const serviceFieldsSchema = z.object({
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
  payment_mode: z.enum(["FULL", "DEPOSIT", "ON_SITE", "REQUEST"]).default("FULL"),
  // Kosong dari form berarti "tanpa DP" (null).
  deposit_type: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.enum(["PERCENT", "FIXED"]).nullable(),
  ),
  deposit_value: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    z.coerce.number().int("DP harus bilangan bulat").nullable(),
  ),
});

/**
 * Mencerminkan constraint services_deposit_* (migration 20261115000200):
 * persen 1..90, tetap >= 1 dan < harga, tipe+nilai berpasangan, DEPOSIT wajib
 * DP. DP dibuang untuk FULL dan ON_SITE.
 */
export const serviceSchema = serviceFieldsSchema.transform((v, ctx) => {
  if (v.payment_mode === "FULL" || v.payment_mode === "ON_SITE") {
    return { ...v, deposit_type: null, deposit_value: null };
  }
  const kosong = v.deposit_type === null || v.deposit_value === null;
  if (kosong) {
    if (v.payment_mode === "DEPOSIT") {
      ctx.addIssue({ code: "custom", path: ["deposit_value"], message: "Isi besar DP" });
    }
    // REQUEST tanpa DP: minta bayar penuh setelah disetujui.
    return { ...v, deposit_type: null, deposit_value: null };
  }
  const nilai = v.deposit_value as number;
  if (v.deposit_type === "PERCENT" && (nilai < 1 || nilai > 90)) {
    ctx.addIssue({ code: "custom", path: ["deposit_value"], message: "DP persen 1 sampai 90" });
  } else if (v.deposit_type === "FIXED" && (nilai < 1 || nilai >= v.price)) {
    ctx.addIssue({
      code: "custom",
      path: ["deposit_value"],
      message: nilai < 1 ? "Isi besar DP" : "DP harus lebih kecil dari harga",
    });
  }
  return v;
});

export type ServiceInput = z.input<typeof serviceSchema>;
export type ServiceValues = z.output<typeof serviceSchema>;
