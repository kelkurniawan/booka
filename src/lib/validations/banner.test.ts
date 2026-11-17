import assert from "node:assert/strict";
import { test } from "node:test";

import { bannerFormSchema } from "./banner";

const template = { source: "TEMPLATE", title: "Promo Desember" };
const image = { source: "IMAGE", image_path: "m/banner/a.webp", alt_text: "Diskon 20 persen" };
const has = (actual: Record<string, unknown>, expected: Record<string, unknown>) =>
  assert.deepEqual(Object.fromEntries(Object.keys(expected).map((k) => [k, actual[k]])), expected);
const uuid = "3f2b7c1e-8a4d-4b6e-9c1a-0d5e6f7a8b9c";

test("bannerFormSchema: menerima template dengan judul saja", () => {
  const r = bannerFormSchema.safeParse(template);
  assert.equal(r.success, true);
  if (r.success) has(r.data, { color: "ACCENT", published: false, target_kind: null });
});

test("bannerFormSchema: menolak template tanpa judul", () => {
  assert.equal(bannerFormSchema.safeParse({ source: "TEMPLATE", title: "   " }).success, false);
});

test("bannerFormSchema: menolak gambar tanpa teks alternatif", () => {
  assert.equal(bannerFormSchema.safeParse({ ...image, alt_text: "" }).success, false);
});

test("bannerFormSchema: menolak tautan http", () => {
  const r = bannerFormSchema.safeParse({ ...template, target_kind: "URL", cta_text: "Buka", target_url: "http://a.test" });
  assert.equal(r.success, false);
});

test("bannerFormSchema: menerima tautan https", () => {
  const r = bannerFormSchema.safeParse({ ...template, target_kind: "URL", cta_text: "Buka", target_url: "https://a.test/x" });
  assert.equal(r.success, true);
});

test("bannerFormSchema: menolak target tanpa teks tombol", () => {
  const r = bannerFormSchema.safeParse({ ...template, target_kind: "VOUCHER", target_voucher_id: uuid });
  assert.equal(r.success, false);
});

test("bannerFormSchema: menolak target voucher tanpa voucher dipilih", () => {
  const r = bannerFormSchema.safeParse({ ...template, target_kind: "VOUCHER", cta_text: "Pakai" });
  assert.equal(r.success, false);
});

test("bannerFormSchema: menolak tanggal selesai sebelum mulai", () => {
  const r = bannerFormSchema.safeParse({ ...template, starts_on: "2026-12-10", ends_on: "2026-12-01" });
  assert.equal(r.success, false);
});

test("bannerFormSchema: mengosongkan teks template untuk banner gambar", () => {
  const r = bannerFormSchema.safeParse({ ...image, title: "Sisa", tag_text: "x", body: "y" });
  assert.equal(r.success, true);
  if (r.success) has(r.data, { title: null, tag_text: null, body: null });
});

test("bannerFormSchema: mengosongkan gambar untuk banner template", () => {
  const r = bannerFormSchema.safeParse({ ...template, image_path: "m/banner/a.webp", alt_text: "x" });
  assert.equal(r.success, true);
  if (r.success) has(r.data, { image_path: null, alt_text: null });
});

test("bannerFormSchema: mengosongkan target dan teks tombol bila tanpa target", () => {
  const r = bannerFormSchema.safeParse({ ...template, cta_text: "Sisa", target_url: "https://a.test" });
  assert.equal(r.success, true);
  if (r.success) has(r.data, { cta_text: null, target_url: null });
});
