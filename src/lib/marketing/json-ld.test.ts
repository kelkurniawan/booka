import test from "node:test";
import assert from "node:assert/strict";

import { PLANS } from "@/lib/plans";
import { contactLinks } from "@/lib/marketing/contact";
import { LANDING_FAQS } from "@/lib/marketing/content";
import { landingJsonLd } from "@/lib/marketing/json-ld";

const siteUrl = new URL("https://marky.id");
const filled = contactLinks({
  whatsapp: "6281234567890",
  email: "halo@contoh.id",
  instagram: "akun",
  threads: "akun",
  x: "akun",
  tiktok: "akun",
  discord: "https://discord.gg/abc123",
});

type Node = Record<string, unknown>;
const build = (contact = filled) => landingJsonLd({ siteUrl, plans: PLANS, faqs: LANDING_FAQS, contact }) as Node[];

test("tiga objek berurutan", () => {
  assert.deepEqual(build().map((n) => n["@type"]), ["SoftwareApplication", "Organization", "FAQPage"]);
});

test("offers dari paket, harga rupiah per bulan", () => {
  const offers = build()[0].offers as { price: string; priceCurrency: string }[];
  assert.deepEqual(offers.map((o) => o.price), ["0", "79000", "199000"]);
  assert.ok(offers.every((o) => o.priceCurrency === "IDR"));
});

test("FAQPage sama dengan daftar yang dirender", () => {
  const entity = build()[2].mainEntity as { name: string; acceptedAnswer: { text: string } }[];
  assert.equal(entity.length, LANDING_FAQS.length);
  entity.forEach((q, i) => {
    assert.equal(q.name, LANDING_FAQS[i].question);
    assert.equal(q.acceptedAnswer.text, LANDING_FAQS[i].answer);
  });
});

test("kontak kosong: tanpa sameAs dan email", () => {
  const org = build([])[1];
  assert.ok(!("sameAs" in org));
  assert.ok(!("email" in org));
});

test("kontak terisi: sameAs empat URL (tanpa WhatsApp dan email), email ikut", () => {
  const org = build()[1];
  assert.equal((org.sameAs as string[]).length, 5);
  assert.equal(org.email, "halo@contoh.id");
});

test("tanpa aggregateRating, review, ratingValue", () => {
  const json = JSON.stringify(build());
  for (const word of ["aggregateRating", "review", "ratingValue"]) assert.ok(!json.includes(word), word);
});
