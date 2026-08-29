import { z } from "zod";

import { findCategory } from "@/lib/business/catalog";
import type {
  AcquisitionSource,
  BookingChannel,
  BusinessCategory,
  IdProvince,
  MerchantGoal,
  TeamSize,
} from "@/types/database";

import { availabilitySchema } from "./availability";
import { onboardingSchema } from "./merchant";
import { serviceSchema } from "./service";

/**
 * Validasi jawaban kuesioner onboarding.
 *
 * Aturan identitas, layanan, dan jam kerja TIDAK ditulis ulang di sini -- modul
 * ini memakai ulang skema yang sudah ada supaya panjang nama, rentang durasi
 * 5..480, harga non-negatif, dan format E.164 tetap punya satu sumber kebenaran.
 */

/** Harus sama persis dengan enum di 20260829000100_onboarding_profile.sql. */
export const BUSINESS_CATEGORY_VALUES = [
  "KECANTIKAN", "KESEHATAN", "FOTOGRAFI", "ACARA", "PENDIDIKAN",
  "HEWAN", "OTOMOTIF", "SERVIS", "KONSULTASI", "LAINNYA",
] as const satisfies readonly BusinessCategory[];

export const TEAM_SIZE_VALUES = [
  "SENDIRI", "KECIL_2_5", "MENENGAH_6_15", "BESAR_15_PLUS",
] as const satisfies readonly TeamSize[];

export const ID_PROVINCE_VALUES = [
  "ACEH", "SUMATERA_UTARA", "SUMATERA_BARAT", "RIAU", "KEPULAUAN_RIAU",
  "JAMBI", "SUMATERA_SELATAN", "KEPULAUAN_BANGKA_BELITUNG", "BENGKULU",
  "LAMPUNG", "DKI_JAKARTA", "JAWA_BARAT", "BANTEN", "JAWA_TENGAH",
  "DI_YOGYAKARTA", "JAWA_TIMUR", "BALI", "NUSA_TENGGARA_BARAT",
  "NUSA_TENGGARA_TIMUR", "KALIMANTAN_BARAT", "KALIMANTAN_TENGAH",
  "KALIMANTAN_SELATAN", "KALIMANTAN_TIMUR", "KALIMANTAN_UTARA",
  "SULAWESI_UTARA", "GORONTALO", "SULAWESI_TENGAH", "SULAWESI_BARAT",
  "SULAWESI_SELATAN", "SULAWESI_TENGGARA", "MALUKU", "MALUKU_UTARA",
  "PAPUA", "PAPUA_BARAT", "PAPUA_BARAT_DAYA", "PAPUA_TENGAH",
  "PAPUA_PEGUNUNGAN", "PAPUA_SELATAN",
] as const satisfies readonly IdProvince[];

export const BOOKING_CHANNEL_VALUES = [
  "WHATSAPP", "INSTAGRAM_DM", "TELEPON", "DATANG_LANGSUNG",
  "APLIKASI_LAIN", "BELUM_ADA",
] as const satisfies readonly BookingChannel[];

export const MERCHANT_GOAL_VALUES = [
  "NO_SHOW", "DP_SULIT", "JADWAL_BENTROK", "CHAT_BERULANG",
  "HALAMAN_RAPI", "LAPORAN_PEMASUKAN",
] as const satisfies readonly MerchantGoal[];

export const ACQUISITION_SOURCE_VALUES = [
  "INSTAGRAM", "TIKTOK", "TEMAN", "GOOGLE", "KOMUNITAS", "LAINNYA",
] as const satisfies readonly AcquisitionSource[];

/** Sama dengan constraint merchant_profiles_goals_sane. */
export const MAX_GOALS = 3;
/** Sama dengan constraint merchant_profiles_channels_sane. */
export const MAX_CHANNELS = 6;

/**
 * Langkah 1. Sub-kategori divalidasi terhadap katalog TypeScript, bukan enum
 * database -- lihat spec bagian 6.1. Kategori LAINNYA sengaja tanpa
 * sub-kategori, jadi slug-nya wajib null; kategori lain wajib mengisinya.
 */
const businessFields = {
  business_category: z.enum(BUSINESS_CATEGORY_VALUES, {
    message: "Pilih bidang usaha Anda",
  }),
  business_type_slug: z.string().nullable(),
};

/**
 * Dipakai BERSAMA oleh businessStepSchema (langkah 1) dan
 * completeOnboardingSchema (kiriman akhir). Kalau hanya langkah 1 yang
 * memeriksanya, klien yang menyusun payload sendiri bisa mengirim slug milik
 * kategori lain dan database menerimanya -- kolomnya cuma `text`.
 */
function refineBusinessType(
  data: { business_category: BusinessCategory; business_type_slug: string | null },
  ctx: z.RefinementCtx,
): void {
  const tersedia = findCategory(data.business_category)?.types ?? [];

  if (tersedia.length === 0) {
    if (data.business_type_slug !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["business_type_slug"],
        message: "Kategori ini tidak punya sub-kategori",
      });
    }
    return;
  }

  if (data.business_type_slug === null) {
    ctx.addIssue({
      code: "custom",
      path: ["business_type_slug"],
      message: "Pilih jenis usaha yang paling mendekati",
    });
    return;
  }

  if (!tersedia.some((type) => type.slug === data.business_type_slug)) {
    ctx.addIssue({
      code: "custom",
      path: ["business_type_slug"],
      message: "Jenis usaha tidak sesuai bidang yang dipilih",
    });
  }
}

export const businessStepSchema = z.object(businessFields).superRefine(refineBusinessType);

/**
 * Langkah 2. Layanan wizard tidak punya deskripsi -- merchant mengisinya nanti
 * di /dashboard/services -- jadi kolom itu dibuang dari serviceSchema.
 *
 * Harga di-override menjadi string-dulu. `z.coerce.number()` milik
 * serviceSchema mengubah string kosong menjadi 0, yang lolos
 * `nonnegative()` -- artinya merchant yang tidak mengisi harga diam-diam
 * menyimpan layanan gratis. Di sini string kosong ditolak lebih dulu, baru
 * dialirkan ke aturan angka yang sama supaya batas 0..MAX tetap satu sumber.
 *
 * Catatan adaptasi Zod 4.4.3: `.pipe(serviceSchema.shape.price)` gagal
 * typecheck -- generic `pipe()` mensyaratkan input target persis `string`,
 * sedangkan `z.coerce.number()` bertipe input `unknown`, dan TypeScript
 * memeriksa posisi itu secara invarian di versi ini. `.transform()` yang
 * memanggil `safeParse` tidak kena batasan generic itu, jadi tetap memakai
 * ulang objek skema harga yang sama sebagai satu sumber kebenaran.
 */
export const wizardServiceSchema = serviceSchema
  .omit({ description: true })
  .extend({
    price: z
      .string()
      .trim()
      .min(1, "Harga wajib diisi")
      .transform((value, ctx) => {
        const hasil = serviceSchema.shape.price.safeParse(value);
        if (!hasil.success) {
          for (const issue of hasil.error.issues) {
            ctx.addIssue({
              code: "custom",
              path: issue.path,
              message: issue.message,
            });
          }
          return z.NEVER;
        }
        return hasil.data;
      }),
  });

/**
 * Langkah 3. Satu rentang jam berlaku untuk seluruh hari terpilih. Rentangnya
 * divalidasi lewat availabilitySchema agar aturan format HH:mm dan
 * "selesai setelah mulai" tidak ditulis dua kali.
 */
export const hoursStepSchema = z
  .object({
    days: z
      .array(z.number().int().min(1, "Hari tidak valid").max(7, "Hari tidak valid"))
      .min(1, "Pilih minimal satu hari"),
    start_time: z.string(),
    end_time: z.string(),
  })
  .superRefine((data, ctx) => {
    if (new Set(data.days).size !== data.days.length) {
      ctx.addIssue({ code: "custom", path: ["days"], message: "Hari tidak boleh ganda" });
    }

    const rentang = availabilitySchema.safeParse({
      day_of_week: data.days[0] ?? 1,
      start_time: data.start_time,
      end_time: data.end_time,
    });

    if (!rentang.success) {
      for (const issue of rentang.error.issues) {
        ctx.addIssue({
          code: "custom",
          path: issue.path.length > 0 ? issue.path : ["end_time"],
          message: issue.message,
        });
      }
    }
  });

/** Seluruh jawaban wajib, dikirim ke RPC complete_onboarding sebagai satu unit. */
export const completeOnboardingSchema = onboardingSchema
  .extend({
    ...businessFields,
    service: wizardServiceSchema,
    hours: hoursStepSchema,
  })
  .superRefine(refineBusinessType);

export type CompleteOnboardingInput = z.input<typeof completeOnboardingSchema>;
export type CompleteOnboardingValues = z.output<typeof completeOnboardingSchema>;

/**
 * Blok opsional. Setiap field boleh hilang. Array kosong diubah menjadi null:
 * constraint merchant_profiles_goals_sane dan _channels_sane menolak array
 * kosong, dan "tidak menjawab" memang seharusnya null, bukan '{}'.
 */
const emptyArrayToNull = <T extends string>(values: readonly [T, ...T[]], max: number) =>
  z
    .array(z.enum(values))
    .max(max)
    .refine((items) => new Set(items).size === items.length, "Pilihan tidak boleh ganda")
    .transform((items) => (items.length > 0 ? items : null))
    .nullish()
    .transform((items) => items ?? null);

export const optionalProfileSchema = z.object({
  team_size: z.enum(TEAM_SIZE_VALUES).nullish().transform((v) => v ?? null),
  province: z.enum(ID_PROVINCE_VALUES).nullish().transform((v) => v ?? null),
  current_channels: emptyArrayToNull(BOOKING_CHANNEL_VALUES, MAX_CHANNELS),
  goals: emptyArrayToNull(MERCHANT_GOAL_VALUES, MAX_GOALS),
  acquisition_source: z
    .enum(ACQUISITION_SOURCE_VALUES)
    .nullish()
    .transform((v) => v ?? null),
});

export type OptionalProfileInput = z.input<typeof optionalProfileSchema>;
export type OptionalProfileValues = z.output<typeof optionalProfileSchema>;
