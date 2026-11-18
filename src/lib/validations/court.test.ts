import assert from "node:assert/strict";
import { test } from "node:test";

import { courtPhotoSchema, courtProfileSchema, isPhotoPublishable, venueLayoutSchema } from "./court";

const ID = "11111111-1111-4111-8111-111111111111";
const base = { name: "Lapangan 1", sport: "PADEL", environment: "INDOOR", surface: "", description: "", features: [] };

test("profil sah: kosong jadi null, ciri kosong dibuang", () => {
  const r = courtProfileSchema.parse({ ...base, features: ["Lampu LED", "  "] });
  assert.equal(r.surface, null);
  assert.equal(r.description, null);
  assert.deepEqual(r.features, ["Lampu LED"]);
});

test("nama 41 karakter ditolak, 40 diterima, kosong ditolak", () => {
  assert.equal(courtProfileSchema.safeParse({ ...base, name: "a".repeat(41) }).success, false);
  assert.equal(courtProfileSchema.safeParse({ ...base, name: "a".repeat(40) }).success, true);
  assert.equal(courtProfileSchema.safeParse({ ...base, name: "  " }).success, false);
});

test("6 ciri ditolak, 5 diterima, ciri 41 karakter ditolak", () => {
  const f = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);
  assert.equal(courtProfileSchema.safeParse({ ...base, features: f(6) }).success, false);
  assert.equal(courtProfileSchema.safeParse({ ...base, features: f(5) }).success, true);
  assert.equal(courtProfileSchema.safeParse({ ...base, features: ["x".repeat(41)] }).success, false);
});

test("olahraga, tempat, permukaan 61, deskripsi 281 ditolak", () => {
  assert.equal(courtProfileSchema.safeParse({ ...base, sport: "GOLF" }).success, false);
  assert.equal(courtProfileSchema.safeParse({ ...base, environment: "ATAP" }).success, false);
  assert.equal(courtProfileSchema.safeParse({ ...base, surface: "s".repeat(61) }).success, false);
  assert.equal(courtProfileSchema.safeParse({ ...base, description: "d".repeat(281) }).success, false);
  assert.equal(courtProfileSchema.safeParse({ ...base, description: "d".repeat(280) }).success, true);
});

test("alt kosong ditandai tidak terbit", () => {
  assert.equal(isPhotoPublishable(""), false);
  assert.equal(isPhotoPublishable("   "), false);
  assert.equal(isPhotoPublishable(null), false);
  assert.equal(isPhotoPublishable("Lapangan malam"), true);
});

test("foto: ukuran di luar 1..4096 dan alt 141 ditolak, alt kosong boleh disimpan", () => {
  const ok = { courtId: ID, path: "u/court/c/a.webp", width: 800, height: 600, altText: "" };
  assert.equal(courtPhotoSchema.safeParse(ok).success, true);
  assert.equal(courtPhotoSchema.safeParse({ ...ok, width: 0 }).success, false);
  assert.equal(courtPhotoSchema.safeParse({ ...ok, height: 5000 }).success, false);
  assert.equal(courtPhotoSchema.safeParse({ ...ok, altText: "a".repeat(141) }).success, false);
  assert.equal(courtPhotoSchema.safeParse({ ...ok, courtId: "x" }).success, false);
});

const area = { id: ID, label: "Kantin", pos_x: 10, pos_y: 10, width: 100, height: 60, sort_order: 0 };
const layout = { courts: [{ id: ID, pos_x: 24, pos_y: 24, rotation: 0 }], areas: [area], markers: [] };

test("label 30 karakter diterima, 31 ditolak", () => {
  assert.equal(venueLayoutSchema.safeParse({ ...layout, areas: [{ ...area, label: "k".repeat(30) }] }).success, true);
});

test("layout sah diterima", () => {
  assert.equal(venueLayoutSchema.safeParse(layout).success, true);
});

test("layout: posisi negatif, rotation 45, label 0 dan 41, id ganda ditolak", () => {
  const c = layout.courts[0];
  assert.equal(venueLayoutSchema.safeParse({ ...layout, courts: [{ ...c, pos_x: -1 }] }).success, false);
  assert.equal(venueLayoutSchema.safeParse({ ...layout, courts: [{ ...c, rotation: 45 }] }).success, false);
  assert.equal(venueLayoutSchema.safeParse({ ...layout, areas: [{ ...area, label: " " }] }).success, false);
  assert.equal(venueLayoutSchema.safeParse({ ...layout, areas: [{ ...area, label: "k".repeat(31) }] }).success, false);
  assert.equal(venueLayoutSchema.safeParse({ ...layout, courts: [c, c] }).success, false);
  assert.equal(venueLayoutSchema.safeParse({ ...layout, areas: [{ ...area, pos_y: 4001 }] }).success, false);
  assert.equal(venueLayoutSchema.safeParse({ ...layout, areas: [{ ...area, width: 10 }] }).success, false);
});
