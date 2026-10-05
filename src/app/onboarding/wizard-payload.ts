import { HOURS_PRESETS, type HoursPresetId, type WizardAnswers } from "./wizard-state";

/**
 * Jembatan antara bentuk jawaban wizard (camelCase, dipegang komponen React)
 * dan bentuk yang dituntut `completeOnboardingSchema` (snake_case, sama dengan
 * nama kolom database).
 *
 * Modul MURNI, tanpa React -- supaya pemetaan nama field ini bisa diuji
 * `npm run test:unit` yang hanya menjalankan berkas .ts.
 */

export type WizardAnswersPayload = {
  business_category: string | null;
  business_type_slug: string | null;
  service: { name: string; duration_minutes: number; price: string } | null;
  hours: { days: number[]; start_time: string; end_time: string } | null;
};

/**
 * `service.price` SENGAJA tetap string mentah dari <input>. `z.coerce.number()`
 * mengubah string kosong menjadi 0 yang lolos `nonnegative()`, jadi harga yang
 * belum diisi akan diam-diam tersimpan sebagai layanan gratis. Schema-nya
 * menolak string kosong sebelum coercion -- itu hanya berfungsi kalau nilainya
 * sampai ke sana MASIH berupa string.
 */
export function answersToPayload(answers: WizardAnswers): WizardAnswersPayload {
  return {
    business_category: answers.category,
    business_type_slug: answers.typeSlug,
    service: answers.service
      ? {
          name: answers.service.name,
          duration_minutes: answers.service.durationMinutes,
          price: answers.service.price,
        }
      : null,
    hours: answers.hours
      ? {
          days: answers.hours.days,
          start_time: answers.hours.startTime,
          end_time: answers.hours.endTime,
        }
      : null,
  };
}

/**
 * Preset mana yang cocok dengan jawaban jam tersimpan, kalau ada. Dipakai saat
 * merchant kembali ke langkah `jam` supaya pilihannya tetap tersorot -- urutan
 * hari tidak dianggap penting, jadi dibandingkan sebagai himpunan.
 */
export function matchHoursPreset(
  hours: WizardAnswers["hours"],
): HoursPresetId | null {
  if (!hours) return null;

  const dipilih = new Set(hours.days);

  const cocok = HOURS_PRESETS.find(
    (preset) =>
      preset.startTime === hours.startTime &&
      preset.endTime === hours.endTime &&
      preset.days.length === dipilih.size &&
      preset.days.every((day) => dipilih.has(day)),
  );

  return cocok?.id ?? null;
}
