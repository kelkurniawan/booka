import type { BusinessCategory, DayOfWeek } from "@/types/database";

/**
 * Mesin langkah wizard onboarding: urutan, prasyarat, preset jam buka, dan
 * cadangan sessionStorage.
 *
 * Modul MURNI, tanpa React -- mengikuti pola service-state.ts dan
 * availability-state.ts, supaya logika langkah bisa diuji `npm run test:unit`
 * yang hanya menjalankan berkas .ts.
 */

export const WIZARD_STEPS = [
  "usaha",
  "layanan",
  "jam",
  "identitas",
  "sukses",
  "profil",
  "kebutuhan",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

/**
 * Hanya empat langkah ini yang dihitung progres. Kalau progres menyebut tujuh
 * langkah lalu tiga di antaranya opsional, merchant yang melewatinya merasa
 * meninggalkan pekerjaan setengah jadi -- lihat spec bagian 5.2.
 */
export const REQUIRED_STEPS = ["usaha", "layanan", "jam", "identitas"] as const;
export const REQUIRED_STEP_COUNT = REQUIRED_STEPS.length;

export type WizardServiceAnswer = {
  name: string;
  durationMinutes: number;
  /** String karena berasal langsung dari <input>; divalidasi Zod saat kirim. */
  price: string;
};

export type WizardHoursAnswer = {
  days: number[];
  startTime: string;
  endTime: string;
};

export type WizardAnswers = {
  category: BusinessCategory | null;
  typeSlug: string | null;
  service: WizardServiceAnswer | null;
  hours: WizardHoursAnswer | null;
};

export const EMPTY_ANSWERS: WizardAnswers = {
  category: null,
  typeSlug: null,
  service: null,
  hours: null,
};

export type HoursPresetId = "kerja" | "senin-sabtu" | "setiap-hari";

export const HOURS_PRESETS: readonly {
  id: HoursPresetId;
  label: string;
  description: string;
  days: DayOfWeek[];
  startTime: string;
  endTime: string;
}[] = [
  {
    id: "kerja",
    label: "Senin - Jumat",
    description: "09.00 - 17.00",
    days: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "17:00",
  },
  {
    id: "senin-sabtu",
    label: "Senin - Sabtu",
    description: "09.00 - 18.00",
    days: [1, 2, 3, 4, 5, 6],
    startTime: "09:00",
    endTime: "18:00",
  },
  {
    id: "setiap-hari",
    label: "Setiap hari",
    description: "10.00 - 20.00",
    days: [1, 2, 3, 4, 5, 6, 7],
    startTime: "10:00",
    endTime: "20:00",
  },
];

export function requiredStepNumber(step: WizardStep): number | null {
  const index = (REQUIRED_STEPS as readonly WizardStep[]).indexOf(step);
  return index === -1 ? null : index + 1;
}

/**
 * Langkah 1 selalu terbuka. Langkah berikutnya terbuka hanya bila seluruh
 * jawaban sebelumnya sudah ada. Kategori LAINNYA sengaja tanpa sub-kategori,
 * jadi `typeSlug` null di sana bukan berarti belum terjawab.
 */
export function isStepUnlocked(step: WizardStep, answers: WizardAnswers): boolean {
  const usahaTerjawab =
    answers.category !== null &&
    (answers.category === "LAINNYA" || answers.typeSlug !== null);

  switch (step) {
    case "usaha":
      return true;
    case "layanan":
      return usahaTerjawab;
    case "jam":
      return usahaTerjawab && answers.service !== null;
    case "identitas":
      return usahaTerjawab && answers.service !== null && answers.hours !== null;
    // Layar sukses dan blok opsional hanya dicapai lewat penyimpanan yang
    // berhasil, tidak pernah lewat tautan langsung.
    case "sukses":
    case "profil":
    case "kebutuhan":
      return false;
  }
}

/**
 * Memetakan `?langkah=` ke langkah yang benar-benar boleh ditampilkan. Bila
 * prasyaratnya belum terjawab -- tautan langsung, atau state klien yang hilang
 * -- kembalikan langkah valid TERAKHIR, bukan langkah pertama secara buta.
 */
export function resolveStep(
  requested: string | null,
  answers: WizardAnswers,
): WizardStep {
  const step = (WIZARD_STEPS as readonly string[]).includes(requested ?? "")
    ? (requested as WizardStep)
    : "usaha";

  if (isStepUnlocked(step, answers)) return step;

  const terbuka = (REQUIRED_STEPS as readonly WizardStep[]).filter((candidate) =>
    isStepUnlocked(candidate, answers),
  );

  return terbuka.at(-1) ?? "usaha";
}

export function nextStep(step: WizardStep): WizardStep | null {
  const index = WIZARD_STEPS.indexOf(step);
  return WIZARD_STEPS[index + 1] ?? null;
}

/**
 * Mundur hanya berlaku di dalam langkah wajib. Dari layar sukses tidak ada
 * jalan kembali ke identitas: akun sudah tersimpan, dan mengirim ulang form
 * itu hanya akan menabrak username miliknya sendiri.
 */
export function previousStep(step: WizardStep): WizardStep | null {
  const index = (REQUIRED_STEPS as readonly WizardStep[]).indexOf(step);
  if (index <= 0) return null;
  return REQUIRED_STEPS[index - 1];
}

export function hoursToRows(hours: WizardHoursAnswer): {
  day_of_week: number;
  start_time: string;
  end_time: string;
}[] {
  return [...hours.days]
    .sort((a, b) => a - b)
    .map((day) => ({
      day_of_week: day,
      start_time: hours.startTime,
      end_time: hours.endTime,
    }));
}

/**
 * Kunci menyertakan id user supaya akun lain di perangkat yang sama tidak
 * mewarisi jawaban orang sebelumnya.
 */
export function storageKey(userId: string): string {
  return `booka:onboarding:${userId}`;
}

/** Isi cadangan tidak dipercaya: apa pun yang tidak berbentuk benar jadi kosong. */
export function parseStoredAnswers(raw: string | null): WizardAnswers {
  if (!raw) return EMPTY_ANSWERS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_ANSWERS;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return EMPTY_ANSWERS;
  }

  const value = parsed as Record<string, unknown>;

  const category =
    typeof value.category === "string" ? (value.category as BusinessCategory) : null;
  const typeSlug = typeof value.typeSlug === "string" ? value.typeSlug : null;

  const service =
    typeof value.service === "object" && value.service !== null
      ? (value.service as WizardServiceAnswer)
      : null;
  const hours =
    typeof value.hours === "object" && value.hours !== null
      ? (value.hours as WizardHoursAnswer)
      : null;

  if (value.category !== undefined && value.category !== null && category === null) {
    return EMPTY_ANSWERS;
  }

  return { category, typeSlug, service, hours };
}
