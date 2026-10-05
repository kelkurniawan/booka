import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  businessStepSchema,
  completeOnboardingSchema,
  hoursStepSchema,
  optionalProfileSchema,
  wizardServiceSchema,
} from "./onboarding";

const IDENTITAS = {
  full_name: "Barbershop Uji",
  username: "barbershop-uji",
  whatsapp_number: "0812-3456-7890",
};

const LAYANAN = { name: "Potong rambut", duration_minutes: 45, price: "50000" };

const JAM = {
  days: [1, 2, 3],
  start_time: "09:00",
  end_time: "17:00",
};

describe("businessStepSchema", () => {
  it("menerima kategori dengan sub-kategori dari katalog", () => {
    const hasil = businessStepSchema.safeParse({
      business_category: "KECANTIKAN",
      business_type_slug: "barbershop",
    });
    assert.equal(hasil.success, true);
  });

  it("menolak slug di luar katalog", () => {
    const hasil = businessStepSchema.safeParse({
      business_category: "KECANTIKAN",
      business_type_slug: "kuliner-padang",
    });
    assert.equal(hasil.success, false);
  });

  it("menolak slug yang bukan milik kategori terpilih", () => {
    const hasil = businessStepSchema.safeParse({
      business_category: "OTOMOTIF",
      business_type_slug: "barbershop",
    });
    assert.equal(hasil.success, false);
  });

  it("menerima kategori LAINNYA tanpa sub-kategori", () => {
    const hasil = businessStepSchema.safeParse({
      business_category: "LAINNYA",
      business_type_slug: null,
    });
    assert.equal(hasil.success, true);
  });

  it("menolak kategori selain LAINNYA tanpa sub-kategori", () => {
    const hasil = businessStepSchema.safeParse({
      business_category: "KECANTIKAN",
      business_type_slug: null,
    });
    assert.equal(hasil.success, false);
  });
});

describe("wizardServiceSchema", () => {
  it("menerima layanan yang valid", () => {
    assert.equal(wizardServiceSchema.safeParse(LAYANAN).success, true);
  });

  it("menolak durasi di luar 5-480", () => {
    assert.equal(
      wizardServiceSchema.safeParse({ ...LAYANAN, duration_minutes: 600 }).success,
      false,
    );
  });

  it("menolak harga negatif", () => {
    assert.equal(
      wizardServiceSchema.safeParse({ ...LAYANAN, price: "-1" }).success,
      false,
    );
  });

  it("menolak harga kosong, BUKAN mengubahnya jadi nol", () => {
    // z.coerce.number() mengubah "" menjadi 0 yang lolos nonnegative(). Tanpa
    // penolakan eksplisit, merchant yang melewati kolom harga diam-diam
    // menyimpan layanan gratis.
    assert.equal(wizardServiceSchema.safeParse({ ...LAYANAN, price: "" }).success, false);
    assert.equal(wizardServiceSchema.safeParse({ ...LAYANAN, price: "   " }).success, false);
  });

  it("menghasilkan harga bertipe number setelah divalidasi", () => {
    const hasil = wizardServiceSchema.safeParse(LAYANAN);
    assert.equal(hasil.success, true);
    assert.equal(hasil.data?.price, 50000);
  });
});

describe("hoursStepSchema", () => {
  it("menerima hari dan jam yang valid", () => {
    assert.equal(hoursStepSchema.safeParse(JAM).success, true);
  });

  it("menolak daftar hari kosong", () => {
    assert.equal(hoursStepSchema.safeParse({ ...JAM, days: [] }).success, false);
  });

  it("menolak hari ganda", () => {
    assert.equal(
      hoursStepSchema.safeParse({ ...JAM, days: [1, 1, 2] }).success,
      false,
    );
  });

  it("menolak hari di luar 1-7", () => {
    assert.equal(hoursStepSchema.safeParse({ ...JAM, days: [0] }).success, false);
    assert.equal(hoursStepSchema.safeParse({ ...JAM, days: [8] }).success, false);
  });

  it("menolak jam selesai sebelum jam mulai", () => {
    assert.equal(
      hoursStepSchema.safeParse({ ...JAM, start_time: "17:00", end_time: "09:00" })
        .success,
      false,
    );
  });
});

describe("completeOnboardingSchema", () => {
  it("menerima seluruh jawaban wajib dan menormalkan nomor WhatsApp", () => {
    const hasil = completeOnboardingSchema.safeParse({
      ...IDENTITAS,
      business_category: "KECANTIKAN",
      business_type_slug: "barbershop",
      service: LAYANAN,
      hours: JAM,
    });
    assert.equal(hasil.success, true);
    assert.equal(hasil.data?.whatsapp_number, "+6281234567890");
  });

  it("ikut menolak slug yang bukan milik kategori terpilih", () => {
    const hasil = completeOnboardingSchema.safeParse({
      ...IDENTITAS,
      business_category: "OTOMOTIF",
      business_type_slug: "barbershop",
      service: LAYANAN,
      hours: JAM,
    });
    assert.equal(hasil.success, false);
  });

  it("menolak bila salah satu bagian wajib hilang", () => {
    const hasil = completeOnboardingSchema.safeParse({
      ...IDENTITAS,
      business_category: "KECANTIKAN",
      business_type_slug: "barbershop",
      hours: JAM,
    });
    assert.equal(hasil.success, false);
  });
});

describe("optionalProfileSchema", () => {
  it("menerima jawaban yang kosong seluruhnya", () => {
    const hasil = optionalProfileSchema.safeParse({});
    assert.equal(hasil.success, true);
  });

  it("menerima jawaban sebagian", () => {
    const hasil = optionalProfileSchema.safeParse({
      team_size: "SENDIRI",
      province: "DKI_JAKARTA",
    });
    assert.equal(hasil.success, true);
  });

  it("menolak lebih dari tiga goals", () => {
    const hasil = optionalProfileSchema.safeParse({
      goals: ["NO_SHOW", "DP_SULIT", "JADWAL_BENTROK", "CHAT_BERULANG"],
    });
    assert.equal(hasil.success, false);
  });

  it("menolak goals ganda", () => {
    const hasil = optionalProfileSchema.safeParse({
      goals: ["NO_SHOW", "NO_SHOW"],
    });
    assert.equal(hasil.success, false);
  });

  it("menolak nilai enum yang tidak dikenal", () => {
    assert.equal(
      optionalProfileSchema.safeParse({ province: "JAWA_TENGGARA" }).success,
      false,
    );
    assert.equal(
      optionalProfileSchema.safeParse({ team_size: "BANYAK" }).success,
      false,
    );
  });

  it("mengubah array kosong menjadi null agar lolos constraint database", () => {
    const hasil = optionalProfileSchema.safeParse({ goals: [], current_channels: [] });
    assert.equal(hasil.success, true);
    assert.equal(hasil.data?.goals, null);
    assert.equal(hasil.data?.current_channels, null);
  });
});
