import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { completeOnboardingSchema } from "@/lib/validations/onboarding";

import { answersToPayload, matchHoursPreset } from "./wizard-payload";
import { EMPTY_ANSWERS, HOURS_PRESETS, type WizardAnswers } from "./wizard-state";

const LENGKAP: WizardAnswers = {
  category: "KECANTIKAN",
  typeSlug: "barbershop",
  service: { name: "Potong rambut", durationMinutes: 45, price: "50000" },
  hours: { days: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "17:00" },
};

describe("answersToPayload", () => {
  it("memetakan camelCase wizard ke snake_case schema", () => {
    assert.deepEqual(answersToPayload(LENGKAP), {
      business_category: "KECANTIKAN",
      business_type_slug: "barbershop",
      service: { name: "Potong rambut", duration_minutes: 45, price: "50000" },
      hours: { days: [1, 2, 3, 4, 5], start_time: "09:00", end_time: "17:00" },
    });
  });

  it("mempertahankan harga sebagai string, bukan angka", () => {
    const payload = answersToPayload(LENGKAP);
    assert.equal(typeof payload.service?.price, "string");
  });

  it("hasilnya diterima completeOnboardingSchema", () => {
    const hasil = completeOnboardingSchema.safeParse({
      full_name: "Studio Mawar",
      username: "studio-mawar",
      whatsapp_number: "081234567890",
      ...answersToPayload(LENGKAP),
    });

    assert.equal(hasil.success, true);
  });

  it("harga kosong ditolak, tidak diam-diam jadi layanan gratis", () => {
    const hasil = completeOnboardingSchema.safeParse({
      full_name: "Studio Mawar",
      username: "studio-mawar",
      whatsapp_number: "081234567890",
      ...answersToPayload({
        ...LENGKAP,
        service: { ...LENGKAP.service!, price: "   " },
      }),
    });

    assert.equal(hasil.success, false);
  });

  it("jawaban kosong menjadi null, bukan objek setengah jadi", () => {
    assert.deepEqual(answersToPayload(EMPTY_ANSWERS), {
      business_category: null,
      business_type_slug: null,
      service: null,
      hours: null,
    });
  });
});

describe("matchHoursPreset", () => {
  it("mengenali setiap preset apa pun urutan harinya", () => {
    for (const preset of HOURS_PRESETS) {
      assert.equal(
        matchHoursPreset({
          days: [...preset.days].reverse(),
          startTime: preset.startTime,
          endTime: preset.endTime,
        }),
        preset.id,
      );
    }
  });

  it("jam kustom tidak dicocokkan ke preset mana pun", () => {
    assert.equal(
      matchHoursPreset({ days: [2, 4], startTime: "08:00", endTime: "12:00" }),
      null,
    );
  });

  it("hari sama tetapi jam beda bukan preset", () => {
    assert.equal(
      matchHoursPreset({ days: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "18:00" }),
      null,
    );
  });

  it("null saat jam belum dijawab", () => {
    assert.equal(matchHoursPreset(null), null);
  });
});
