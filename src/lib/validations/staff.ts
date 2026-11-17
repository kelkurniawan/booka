import { z } from "zod";

import { availabilitySchema } from "./availability";

/** Sama dengan constraint `staff_name_length` (1..60 setelah trim). */
export const staffNameSchema = z
  .string()
  .trim()
  .min(1, "Nama staf wajib diisi")
  .max(60, "Nama staf maksimal 60 karakter");

/**
 * Jam kerja staf: daftar kosong = ikut jam kerja usaha. Maksimal satu
 * rentang per hari (constraint `staff_availability_one_per_day`).
 */
export const staffHoursSchema = z
  .array(availabilitySchema)
  .max(7)
  .refine(
    (rows) => new Set(rows.map((row) => row.day_of_week)).size === rows.length,
    "Satu hari hanya boleh punya satu rentang jam",
  );

export type StaffHoursInput = z.input<typeof staffHoursSchema>;

/** Batas isian profil staf. Sejalan dengan constraint `staff_profile_length` di migration 20261119000100. */
export const STAFF_PROFILE_LIMITS = { roleMax: 40, bioMax: 140, tagsMax: 5, tagMax: 24 } as const;

/** Teks kosong disimpan sebagai null, bukan string kosong. */
const teksOpsional = (max: number, pesan: string) =>
  z
    .string()
    .trim()
    .max(max, pesan)
    .transform((nilai) => (nilai === "" ? null : nilai));

export const staffProfileSchema = z.object({
  role: teksOpsional(STAFF_PROFILE_LIMITS.roleMax, "Peran maksimal 40 karakter"),
  bio: teksOpsional(STAFF_PROFILE_LIMITS.bioMax, "Perkenalan maksimal 140 karakter"),
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Keahlian tidak boleh kosong")
        .max(STAFF_PROFILE_LIMITS.tagMax, "Keahlian maksimal 24 karakter")
        .refine((tag) => !/[\r\n]/.test(tag), "Keahlian tidak boleh berisi baris baru"),
    )
    .max(STAFF_PROFILE_LIMITS.tagsMax, "Maksimal 5 keahlian")
    .refine(
      (tags) => new Set(tags.map((tag) => tag.toLowerCase())).size === tags.length,
      "Keahlian tidak boleh dobel",
    ),
  // Path diperiksa cakupan folder-nya di aksi, karena butuh merchant_id dan staff_id.
  photo_path: z
    .string()
    .nullable()
    .transform((path) => (path ? path : null)),
  show_motion: z.boolean(),
});

export type StaffProfileInput = z.input<typeof staffProfileSchema>;
export type StaffProfile = z.output<typeof staffProfileSchema>;
