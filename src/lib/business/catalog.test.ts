import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BUSINESS_CATEGORIES,
  BUSINESS_TYPE_SLUGS,
  findBusinessType,
  findCategory,
  typesForCategory,
} from "./catalog";

describe("katalog jenis usaha", () => {
  it("memuat sebelas kategori sesuai enum business_category", () => {
    assert.deepEqual(
      BUSINESS_CATEGORIES.map((c) => c.id),
      [
        "KECANTIKAN",
        "KESEHATAN",
        "FOTOGRAFI",
        "ACARA",
        "PENDIDIKAN",
        "HEWAN",
        "OTOMOTIF",
        "SERVIS",
        "KONSULTASI",
        "OLAHRAGA",
        "LAINNYA",
      ],
    );
  });

  it("memberi setiap kategori selain LAINNYA minimal satu sub-kategori", () => {
    for (const category of BUSINESS_CATEGORIES) {
      const jumlah = category.types.length;
      if (category.id === "LAINNYA") {
        assert.equal(jumlah, 0, "LAINNYA tidak boleh punya sub-kategori");
      } else {
        assert.ok(jumlah >= 1, `${category.id} tidak punya sub-kategori`);
      }
    }
  });

  it("memakai slug yang unik di seluruh katalog", () => {
    const unik = new Set(BUSINESS_TYPE_SLUGS);
    assert.equal(unik.size, BUSINESS_TYPE_SLUGS.length, "ada slug ganda");
  });

  it("memakai slug yang lolos constraint merchant_profiles_type_slug_format", () => {
    const pola = /^[a-z0-9](?:[a-z0-9-]{0,38})[a-z0-9]$/;
    for (const slug of BUSINESS_TYPE_SLUGS) {
      assert.match(slug, pola, `slug tidak valid: ${slug}`);
    }
  });

  it("memberi setiap sub-kategori empat sampai enam template layanan", () => {
    for (const category of BUSINESS_CATEGORIES) {
      for (const type of category.types) {
        assert.ok(
          type.sport
            ? type.templates.length === 1
            : type.templates.length >= 4 && type.templates.length <= 6,
          `${type.slug} punya ${type.templates.length} template, harus 4-6 (atau 1 untuk jenis lapangan)`,
        );
      }
    }
  });

  it("menjaga durasi template di dalam constraint services_duration_range", () => {
    for (const category of BUSINESS_CATEGORIES) {
      for (const type of category.types) {
        for (const template of type.templates) {
          assert.ok(
            Number.isInteger(template.durationMinutes) &&
              template.durationMinutes >= 5 &&
              template.durationMinutes <= 480,
            `${type.slug}/${template.name}: durasi ${template.durationMinutes} di luar 5-480`,
          );
        }
      }
    }
  });

  it("menjaga nama template di dalam constraint services_name_length", () => {
    for (const category of BUSINESS_CATEGORIES) {
      for (const type of category.types) {
        for (const template of type.templates) {
          const panjang = template.name.trim().length;
          assert.ok(
            panjang >= 2 && panjang <= 80,
            `${type.slug}/${template.name}: panjang nama ${panjang} di luar 2-80`,
          );
        }
      }
    }
  });

  it("mengisi petunjuk harga untuk setiap template", () => {
    for (const category of BUSINESS_CATEGORIES) {
      for (const type of category.types) {
        for (const template of type.templates) {
          assert.ok(
            template.priceHint.trim().length > 0,
            `${type.slug}/${template.name}: petunjuk harga kosong`,
          );
        }
      }
    }
  });

  it("menemukan sub-kategori berdasarkan slug", () => {
    const type = findBusinessType("barbershop");
    assert.equal(type?.label, "Barbershop");
    assert.equal(findBusinessType("tidak-ada"), undefined);
  });

  it("mengembalikan sub-kategori milik satu kategori", () => {
    const types = typesForCategory("KECANTIKAN");
    assert.ok(types.some((t) => t.slug === "barbershop"));
    assert.equal(typesForCategory("LAINNYA").length, 0);
  });

  it("menemukan kategori berdasarkan id", () => {
    assert.equal(findCategory("HEWAN")?.label, "Perawatan Hewan");
    assert.equal(findCategory("KULINER" as never), undefined);
  });
});

describe("kategori OLAHRAGA", () => {
  const jenis = typesForCategory("OLAHRAGA");

  it("memuat lima jenis lapangan dengan sport sesuai enum court_sport", () => {
    assert.deepEqual(
      jenis.map((t) => [t.slug, t.sport]),
      [
        ["padel", "PADEL"],
        ["futsal", "FUTSAL"],
        ["mini-soccer", "MINI_SOCCER"],
        ["badminton", "BADMINTON"],
        ["tenis", "TENIS"],
      ],
    );
    assert.equal(findCategory("OLAHRAGA")?.icon, "Trophy");
  });

  it("template sewa: nama, unit 30, minimum 60, maksimum 120, petunjuk harga per jam", () => {
    for (const t of jenis) {
      const [template] = t.templates;
      assert.match(template.name, /^Sewa lapangan /);
      assert.deepEqual(template.court, { unitMinutes: 30, minMinutes: 60, maxMinutes: 120 });
      assert.equal(template.durationMinutes, 60);
      assert.match(template.priceHint, /per jam/);
    }
  });

  it("kategori lain tidak punya template sewa", () => {
    for (const c of BUSINESS_CATEGORIES.filter((k) => k.id !== "OLAHRAGA")) {
      for (const t of c.types) {
        assert.equal(t.sport, undefined, t.slug);
        for (const tpl of t.templates) assert.equal(tpl.court, undefined, tpl.name);
      }
    }
  });
});
