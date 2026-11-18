import test from "node:test";
import assert from "node:assert/strict";
import { findSlopChars } from "@/lib/marketing/content";
import { INDUSTRIES, industryBySlug } from "@/lib/marketing/industries";
import { ROUTES } from "@/lib/routes";

test("tujuh slug berurutan dan unik", () => {
  assert.deepEqual(
    INDUSTRIES.map((i) => i.slug),
    ["salon", "barbershop", "restoran", "fotografer", "klinik", "kelas", "lapangan"],
  );
});

test("batas metadata dan jumlah isi", () => {
  for (const i of INDUSTRIES) {
    assert.ok(i.metaTitle.length <= 60, `${i.slug} metaTitle ${i.metaTitle.length}`);
    assert.ok(
      i.metaDescription.length >= 70 && i.metaDescription.length <= 160,
      `${i.slug} metaDescription ${i.metaDescription.length}`,
    );
    assert.equal(i.points.length, 3, i.slug);
    assert.ok(i.faqs.length === 2 || i.faqs.length === 3, i.slug);
  }
});

test("setiap field wajib terisi", () => {
  for (const i of INDUSTRIES) {
    const texts = [
      i.name,
      i.metaTitle,
      i.metaDescription,
      i.h1,
      i.intro,
      i.paymentFit.title,
      i.paymentFit.body,
      i.example.label,
      i.example.name,
      i.example.bio,
      i.example.cta,
      ...i.example.items.flatMap((it) => [it.name, it.price]),
      ...i.points.flatMap((p) => [p.title, p.body]),
      ...i.faqs.flatMap((f) => [f.question, f.answer]),
    ];
    for (const text of texts) {
      assert.ok(text.trim().length > 0, `${i.slug} punya field kosong`);
    }
  }
});

test("lapangan: slug, rute, dan isi sesuai spek sewa lapangan", () => {
  const lapangan = industryBySlug("lapangan");
  assert.ok(lapangan, "slug lapangan harus ada");
  assert.equal(lapangan.name, "Lapangan olahraga");
  assert.equal(ROUTES.industry("lapangan"), "/untuk/lapangan");
  const text = [lapangan.metaDescription, lapangan.h1, lapangan.intro, ...lapangan.points.map((p) => p.body)].join(" ");
  for (const sport of ["padel", "futsal", "mini soccer", "badminton", "tenis"]) {
    assert.ok(text.toLowerCase().includes(sport), `metadeskripsi memuat ${sport}`);
  }
  assert.ok(lapangan.points.some((p) => p.title.includes("jam ramai")), "ada manfaat harga jam ramai");
  assert.ok(lapangan.points.some((p) => p.title.includes("ganda")), "ada manfaat tanpa bentrok");
});

test("sitemap membaca INDUSTRIES, jadi lapangan ikut masuk", () => {
  // sitemap.ts memetakan INDUSTRIES langsung ke URL /untuk/<slug>.
  const urls = INDUSTRIES.map((i) => ROUTES.industry(i.slug));
  assert.ok(urls.includes("/untuk/lapangan"));
});

test("industryBySlug dan ROUTES.industry", () => {
  assert.equal(industryBySlug("salon")?.slug, "salon");
  assert.equal(industryBySlug("spa"), undefined);
  assert.equal(ROUTES.industry("salon"), "/untuk/salon");
});

test("tanpa karakter terlarang", () => {
  assert.deepEqual(findSlopChars(INDUSTRIES), []);
});
