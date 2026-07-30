/**
 * Bentuk state form jam kerja, konstanta hari, dan tipe hasil aksi non-form,
 * dipisah dari `actions.ts`.
 *
 * File bertanda `"use server"` hanya boleh mengekspor async function — setiap
 * export lain, termasuk konstanta objek seperti INITIAL_AVAILABILITY_FORM_STATE
 * dan DAY_LABELS, membuat Next.js melempar "A 'use server' file can only
 * export async functions". Karena itu tipe dan nilai tinggal di modul biasa
 * ini.
 */

import type { DayOfWeek } from "@/types/database";

type FieldName = "day_of_week" | "start_time" | "end_time";

export type AvailabilityFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<FieldName, string>>;
};

export const INITIAL_AVAILABILITY_FORM_STATE: AvailabilityFormState = { status: "idle" };

/** Hasil aksi "salin ke semua hari kerja". */
export type CopyToWeekdaysResult = {
  ok: boolean;
  /** Hari kerja yang dilewati karena rentangnya tumpang tindih dengan yang sudah ada. */
  skippedDays: DayOfWeek[];
  message: string;
};

/** ISO-8601: 1 = Senin ... 7 = Minggu, sama dengan kolom `day_of_week`. */
export const ALL_DAYS: readonly DayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];

/** Hari kerja (Senin-Jumat) — target aksi "salin ke semua hari kerja". */
export const WEEKDAYS: readonly DayOfWeek[] = [1, 2, 3, 4, 5];

export const DAY_LABELS: Record<DayOfWeek, string> = {
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
  6: "Sabtu",
  7: "Minggu",
};
