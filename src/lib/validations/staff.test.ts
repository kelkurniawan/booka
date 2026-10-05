import assert from "node:assert/strict";
import { test } from "node:test";

import { staffHoursSchema, staffNameSchema } from "./staff";

test("nama staf di-trim dan tidak boleh kosong", () => {
  assert.equal(staffNameSchema.parse("  Dewi "), "Dewi");
  assert.equal(staffNameSchema.safeParse("   ").success, false);
});

test("jam staf kosong berarti ikut jam usaha", () => {
  assert.deepEqual(staffHoursSchema.parse([]), []);
});

test("jam staf menolak dua rentang di hari yang sama", () => {
  const result = staffHoursSchema.safeParse([
    { day_of_week: 1, start_time: "09:00", end_time: "12:00" },
    { day_of_week: 1, start_time: "13:00", end_time: "17:00" },
  ]);
  assert.equal(result.success, false);
});

test("jam staf menolak jam selesai sebelum jam mulai", () => {
  const result = staffHoursSchema.safeParse([
    { day_of_week: 2, start_time: "17:00", end_time: "09:00" },
  ]);
  assert.equal(result.success, false);
});
