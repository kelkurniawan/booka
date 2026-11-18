import { z } from "zod";

import { findRuleOverlap, formatRuleOverlap } from "@/lib/booking/court";
import { computeAmounts, MAX_ONLINE_CHARGE, MIN_ONLINE_CHARGE } from "@/lib/booking/payment-mode";

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

export const ONLINE_PRICE_MESSAGE = "Harga minimal Rp1.500 untuk pembayaran QRIS, atau Rp0 untuk gratis.";

export const MAX_ONLINE_MESSAGE =
  "Pembayaran QRIS maksimal Rp10.000.000 per transaksi. Pakai DP yang lebih kecil, atau bayar di tempat.";

/** Harga yang bisa ditagih lewat QRIS: gratis, atau minimal MIN_ONLINE_CHARGE. Hanya Zod, tanpa constraint DB. */
export function isChargeablePrice(price: number): boolean {
  return price === 0 || price >= MIN_ONLINE_CHARGE;
}

/**
 * Mencerminkan constraint services_deposit_* (migration 20261115000200):
 * persen 1..90, tetap >= 1 dan < harga, tipe+nilai berpasangan, DEPOSIT wajib
 * DP. DP dibuang untuk FULL dan ON_SITE. Selain ON_SITE, harga harus 0 atau
 * minimal MIN_ONLINE_CHARGE (create_booking menolak sisanya dengan BK022).
 */
// Kosong dari form berarti "tidak diisi" (null).
const optionalInt = (min: number, max: number, label: string) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    z
      .coerce.number(`${label} harus berupa angka`)
      .int(`${label} harus bilangan bulat`)
      .min(min, `${label} minimal ${min}`)
      .max(max, `${label} maksimal ${max}`)
      .nullable(),
  );

export const serviceSchema = serviceFieldsSchema
  .extend({
    partyMin: optionalInt(1, 200, "Jumlah tamu minimal"),
    partyMax: optionalInt(1, 200, "Jumlah tamu maksimal"),
    seatDurationMinutes: optionalInt(15, 480, "Lama duduk"),
  })
  .transform((v, ctx) => {
  // Mencerminkan constraint rentang tamu dan lama duduk di tabel services.
  if ((v.partyMin === null) !== (v.partyMax === null)) {
    ctx.addIssue({
      code: "custom",
      path: [v.partyMin === null ? "partyMin" : "partyMax"],
      message: "Isi jumlah tamu minimal dan maksimal, atau kosongkan keduanya",
    });
  } else if (v.partyMin !== null && v.partyMax !== null && v.partyMin > v.partyMax) {
    ctx.addIssue({
      code: "custom",
      path: ["partyMax"],
      message: "Jumlah tamu maksimal tidak boleh lebih kecil dari minimal",
    });
  }
  if (v.seatDurationMinutes !== null && v.partyMax === null) {
    ctx.addIssue({
      code: "custom",
      path: ["partyMax"],
      message: "Isi rentang jumlah tamu untuk layanan reservasi meja",
    });
  }
  if (v.payment_mode !== "ON_SITE" && !isChargeablePrice(v.price)) {
    ctx.addIssue({ code: "custom", path: ["price"], message: ONLINE_PRICE_MESSAGE });
  }
  // Mencerminkan trigger BK037; REQUEST ikut karena ditagih lewat QRIS setelah disetujui.
  if (computeAmounts(v, v.payment_mode).dueNow > MAX_ONLINE_CHARGE) {
    ctx.addIssue({
      code: "custom",
      path: [v.payment_mode === "FULL" || v.deposit_type === null || v.deposit_value === null ? "price" : "deposit_value"],
      message: MAX_ONLINE_MESSAGE,
    });
  }
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

/**
 * Bidang sewa lapangan. Mencerminkan services_court_* (unit 30/60, maksimum
 * <= 480 dan kelipatan unit, minimum kelipatan unit dan <= maksimum) serta
 * save_court_pricing (jam mulai < selesai, tanpa tumpang tindih, maksimal 50
 * baris per-hari).
 */
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

const courtRuleSchema = z
  .object({
    days: z.array(z.number().int().min(1).max(7)).min(1, "Pilih minimal satu hari"),
    start: z.string().regex(CLOCK, "Jam mulai tidak valid"),
    end: z.string().regex(CLOCK, "Jam selesai tidak valid"),
    pricePerHour: z.number("Harga wajib diisi").int("Harga harus bilangan bulat").positive("Harga harus lebih dari 0").max(MAX_SERVICE_PRICE, "Harga terlalu besar"),
  })
  .refine((r) => r.start < r.end, { path: ["end"], message: "Jam selesai harus setelah jam mulai" });

export const courtServiceSchema = z
  .object({
    unit: z.coerce.number().pipe(z.union([z.literal(30), z.literal(60)], "Jam mulai tiap 30 menit atau 1 jam")),
    minMinutes: z.coerce.number("Lama main minimum wajib diisi").int().positive("Lama main minimum wajib diisi"),
    maxMinutes: z.coerce.number("Lama main maksimum wajib diisi").int().max(480, "Lama main maksimal 8 jam"),
    courtIds: z.array(z.uuid()).min(1, "Pilih minimal satu lapangan"),
    rules: z.array(courtRuleSchema).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.minMinutes % v.unit !== 0) {
      ctx.addIssue({ code: "custom", path: ["minMinutes"], message: "Lama main minimum harus kelipatan jam mulai" });
    }
    if (v.maxMinutes % v.unit !== 0) {
      ctx.addIssue({ code: "custom", path: ["maxMinutes"], message: "Lama main maksimum harus kelipatan jam mulai" });
    }
    if (v.maxMinutes < v.minMinutes) {
      ctx.addIssue({ code: "custom", path: ["maxMinutes"], message: "Lama main maksimum tidak boleh lebih singkat dari minimum" });
    }
    if (v.rules.reduce((n, r) => n + r.days.length, 0) > 50) {
      ctx.addIssue({ code: "custom", path: ["rules"], message: "Aturan jam ramai terlalu banyak. Gabungkan hari yang jam dan harganya sama." });
    }
    const overlap = findRuleOverlap(v.rules);
    if (overlap) {
      ctx.addIssue({ code: "custom", path: ["rules", overlap.ruleIndex], message: formatRuleOverlap(overlap) });
    }
  });

export type CourtServiceValues = z.output<typeof courtServiceSchema>;
