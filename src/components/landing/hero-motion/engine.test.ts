import assert from "node:assert/strict";
import test from "node:test";

import { LAYOUTS, SETTLED_T, frameStyles, seek, stageScale, type LayoutName } from "./engine";

const names: LayoutName[] = ["wide", "compact"];

for (const name of names) {
  const L = LAYOUTS[name];

  test(`${name}: loop mulus dan murni`, () => {
    assert.deepStrictEqual(seek(0, L), seek(12, L));
    assert.deepStrictEqual(seek(-0.5, L), seek(11.5, L));
    assert.deepStrictEqual(seek(5.3, L), seek(5.3, L));
  });

  test(`${name}: lintasan kontinu`, () => {
    for (const t of [1, 2.6, 4.6, 6.6, 7.6, 8.8, 9.8, 12]) {
      const a = seek(t - 0.001, L).p;
      const b = seek(t + 0.001, L).p;
      assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 2, `loncat di t=${t}`);
    }
  });

  test(`${name}: jam`, () => {
    assert.equal(seek(2.6, L).time, "08.00");
    assert.equal(seek(4.6, L).time, "10.00");
  });

  test(`${name}: frame diam slip Lunas`, () => {
    const f = seek(SETTLED_T, L);
    assert.equal(f.stamp, 1);
    assert.equal(f.stampO, 1);
    assert.equal(f.c1, 1);
    assert.equal(f.c2, 1);
    assert.equal(f.time, "10.00");
    assert.ok(Math.abs(f.stampS - 1) < 0.05);
  });

  test(`${name}: hanya transform dan opacity`, () => {
    for (const t of [0, 3, 7, 9.2, 11]) {
      for (const style of Object.values(frameStyles(seek(t, L), L))) {
        for (const key of Object.keys(style)) assert.ok(key === "transform" || key === "opacity", key);
      }
    }
  });
}

test("skala panggung", () => {
  assert.ok(Math.abs(stageScale(1280, "wide") - 0.889) < 0.001);
  assert.equal(stageScale(1600, "wide"), 1);
  assert.equal(stageScale(390, "compact"), 1);
  assert.equal(stageScale(600, "compact"), 1.2);
});
