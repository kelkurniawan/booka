import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_ANSWERS,
  HOURS_PRESETS,
  REQUIRED_STEP_COUNT,
  hoursToRows,
  isStepUnlocked,
  nextStep,
  parseStoredAnswers,
  previousStep,
  requiredStepNumber,
  resolveStep,
  storageKey,
  type WizardAnswers,
} from "./wizard-state";

const USAHA: WizardAnswers = {
  ...EMPTY_ANSWERS,
  category: "KECANTIKAN",
  typeSlug: "barbershop",
};

const LAYANAN: WizardAnswers = {
  ...USAHA,
  service: { name: "Potong rambut", durationMinutes: 45, price: "50000" },
};

const JAM: WizardAnswers = {
  ...LAYANAN,
  hours: { days: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "17:00" },
};

describe("progres", () => {
  it("menghitung empat langkah wajib saja", () => {
    assert.equal(REQUIRED_STEP_COUNT, 4);
    assert.equal(requiredStepNumber("usaha"), 1);
    assert.equal(requiredStepNumber("layanan"), 2);
    assert.equal(requiredStepNumber("jam"), 3);
    assert.equal(requiredStepNumber("identitas"), 4);
  });

  it("tidak memberi nomor progres pada layar sukses dan blok opsional", () => {
    assert.equal(requiredStepNumber("sukses"), null);
    assert.equal(requiredStepNumber("profil"), null);
    assert.equal(requiredStepNumber("kebutuhan"), null);
  });
});

describe("isStepUnlocked", () => {
  it("selalu membuka langkah pertama", () => {
    assert.equal(isStepUnlocked("usaha", EMPTY_ANSWERS), true);
  });

  it("mengunci langkah yang prasyaratnya belum terjawab", () => {
    assert.equal(isStepUnlocked("layanan", EMPTY_ANSWERS), false);
    assert.equal(isStepUnlocked("jam", USAHA), false);
    assert.equal(isStepUnlocked("identitas", LAYANAN), false);
  });

  it("membuka langkah begitu prasyaratnya terpenuhi", () => {
    assert.equal(isStepUnlocked("layanan", USAHA), true);
    assert.equal(isStepUnlocked("jam", LAYANAN), true);
    assert.equal(isStepUnlocked("identitas", JAM), true);
  });

  it("membuka kategori LAINNYA tanpa sub-kategori", () => {
    const lainnya: WizardAnswers = {
      ...EMPTY_ANSWERS,
      category: "LAINNYA",
      typeSlug: null,
    };
    assert.equal(isStepUnlocked("layanan", lainnya), true);
  });
});

describe("resolveStep", () => {
  it("memakai langkah yang diminta bila terbuka", () => {
    assert.equal(resolveStep("jam", JAM), "jam");
  });

  it("memundurkan ke langkah valid terakhir bila prasyarat belum terjawab", () => {
    assert.equal(resolveStep("identitas", EMPTY_ANSWERS), "usaha");
    assert.equal(resolveStep("identitas", USAHA), "layanan");
    assert.equal(resolveStep("jam", USAHA), "layanan");
  });

  it("jatuh ke langkah pertama untuk nilai yang tidak dikenal atau kosong", () => {
    assert.equal(resolveStep(null, EMPTY_ANSWERS), "usaha");
    assert.equal(resolveStep("langkah-palsu", JAM), "usaha");
  });
});

describe("navigasi", () => {
  it("maju mengikuti urutan langkah", () => {
    assert.equal(nextStep("usaha"), "layanan");
    assert.equal(nextStep("identitas"), "sukses");
    assert.equal(nextStep("kebutuhan"), null);
  });

  it("mundur mengikuti urutan langkah", () => {
    assert.equal(previousStep("layanan"), "usaha");
    assert.equal(previousStep("usaha"), null);
  });

  it("tidak memundurkan dari layar sukses ke identitas -- akun sudah tersimpan", () => {
    assert.equal(previousStep("sukses"), null);
  });
});

describe("preset jam buka", () => {
  it("menyediakan tiga preset dan satu pilihan kustom", () => {
    assert.equal(HOURS_PRESETS.length, 3);
    for (const preset of HOURS_PRESETS) {
      assert.ok(preset.days.length >= 1);
      assert.ok(preset.endTime > preset.startTime);
    }
  });

  it("mengubah jawaban jam menjadi baris availability", () => {
    const rows = hoursToRows({ days: [1, 3], startTime: "09:00", endTime: "17:00" });
    assert.deepEqual(rows, [
      { day_of_week: 1, start_time: "09:00", end_time: "17:00" },
      { day_of_week: 3, start_time: "09:00", end_time: "17:00" },
    ]);
  });

  it("mengurutkan hari agar baris availability stabil", () => {
    const rows = hoursToRows({ days: [5, 1, 3], startTime: "09:00", endTime: "17:00" });
    assert.deepEqual(
      rows.map((r) => r.day_of_week),
      [1, 3, 5],
    );
  });
});

describe("cadangan sessionStorage", () => {
  it("memisahkan kunci per user", () => {
    assert.notEqual(storageKey("user-a"), storageKey("user-b"));
    assert.match(storageKey("user-a"), /user-a/);
  });

  it("mengembalikan jawaban kosong untuk isi yang rusak atau hilang", () => {
    assert.deepEqual(parseStoredAnswers(null), EMPTY_ANSWERS);
    assert.deepEqual(parseStoredAnswers("bukan json"), EMPTY_ANSWERS);
    assert.deepEqual(parseStoredAnswers("[]"), EMPTY_ANSWERS);
    assert.deepEqual(parseStoredAnswers('{"category":123}'), EMPTY_ANSWERS);
  });

  it("memulihkan jawaban yang tersimpan", () => {
    assert.deepEqual(parseStoredAnswers(JSON.stringify(JAM)), JAM);
  });
});
