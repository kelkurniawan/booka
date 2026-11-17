import assert from "node:assert/strict";
import { test } from "node:test";

import { capacitySettingsSchema, diningLayoutSchema } from "./dining";

const BASE = { tableMode: "NONE", seatsPerSlot: null, tableHoldMinutes: 15, autoJoinTables: false } as const;

test("AREA tanpa kursi ditolak dengan pesan di seatsPerSlot", () => {
  const r = capacitySettingsSchema.safeParse({ ...BASE, tableMode: "AREA" });
  assert.equal(r.success, false);
  if (!r.success) assert.equal(r.error.issues[0].message, "Isi kapasitas kursi per jam");
});

test("AREA dengan kursi dan NONE tanpa kursi diterima", () => {
  assert.equal(capacitySettingsSchema.safeParse({ ...BASE, tableMode: "AREA", seatsPerSlot: "40" }).success, true);
  assert.equal(capacitySettingsSchema.safeParse(BASE).success, true);
});

test("waktu tahan di luar 0 sampai 120 ditolak", () => {
  assert.equal(capacitySettingsSchema.safeParse({ ...BASE, tableHoldMinutes: 121 }).success, false);
  assert.equal(capacitySettingsSchema.safeParse({ ...BASE, tableHoldMinutes: -1 }).success, false);
  assert.equal(capacitySettingsSchema.safeParse({ ...BASE, tableHoldMinutes: 0 }).success, true);
});

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const area = (n: number, name: string) => ({ id: id(n), name, sort_order: n });
const table = (n: number, areaN: number, name: string, over: Record<string, unknown> = {}) => ({
  id: id(100 + n),
  area_id: id(areaN),
  name,
  min_seats: 2,
  max_seats: 4,
  shape: "RECT" as const,
  grid_x: n * 4,
  grid_y: 0,
  grid_w: 3,
  grid_h: 3,
  note: null,
  bookable_online: true,
  joinable_with: [] as string[],
  sort_order: n,
  ...over,
});
const LAYOUT = {
  areas: [area(1, "Dalam"), area(2, "Teras")],
  tables: [table(1, 1, "D1"), table(2, 1, "D2"), table(3, 2, "T1"), table(4, 2, "T2")],
};

test("denah contoh lolos", () => {
  assert.equal(diningLayoutSchema.safeParse(LAYOUT).success, true);
});

test("nama meja ganda tanpa beda huruf besar ditolak", () => {
  const tables = [table(1, 1, "d1"), table(2, 1, "D1")];
  assert.equal(diningLayoutSchema.safeParse({ ...LAYOUT, tables }).success, false);
});

test("gabungan ke meja area lain ditolak", () => {
  const tables = [table(1, 1, "D1", { joinable_with: [id(103)] }), table(3, 2, "T1")];
  assert.equal(diningLayoutSchema.safeParse({ ...LAYOUT, tables }).success, false);
});

test("meja keluar kanvas ditolak", () => {
  const tables = [table(1, 1, "D1", { grid_x: 22, grid_w: 3 })];
  assert.equal(diningLayoutSchema.safeParse({ ...LAYOUT, tables }).success, false);
});

test("101 meja ditolak", () => {
  const tables = Array.from({ length: 101 }, (_, i) => table(i + 1, 1, `M${i}`));
  assert.equal(diningLayoutSchema.safeParse({ ...LAYOUT, tables }).success, false);
});

test("meja bertumpuk di area yang sama ditolak, di area lain boleh", () => {
  const tumpuk = [table(1, 1, "D1"), table(2, 1, "D2", { grid_x: 5, grid_y: 1 })];
  const hasil = diningLayoutSchema.safeParse({ ...LAYOUT, tables: tumpuk });
  assert.equal(hasil.success, false);
  assert.match(hasil.error!.issues[0].message, /D1 dan D2 bertumpuk/);
  const beda = [table(1, 1, "D1"), table(3, 2, "T1", { grid_x: 5, grid_y: 1 })];
  assert.equal(diningLayoutSchema.safeParse({ ...LAYOUT, tables: beda }).success, true);
  const bersebelahan = [table(1, 1, "D1"), table(2, 1, "D2", { grid_x: 7 })];
  assert.equal(diningLayoutSchema.safeParse({ ...LAYOUT, tables: bersebelahan }).success, true);
});
