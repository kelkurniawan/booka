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
