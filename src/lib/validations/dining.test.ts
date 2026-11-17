import assert from "node:assert/strict";
import { test } from "node:test";

import { capacitySettingsSchema } from "./dining";

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
