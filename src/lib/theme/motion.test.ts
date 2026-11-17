import assert from "node:assert/strict";
import test from "node:test";

import {
  BENTUK_SHAPES,
  PARTIKEL_DOTS,
  easeInOutCubic,
  keyframes,
  motionAllowed,
  seekBentuk,
} from "./motion";

test("easeInOutCubic", () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(0.5), 0.5);
  assert.equal(easeInOutCubic(1), 1);
  assert.equal(easeInOutCubic(0.25), 0.0625);
  assert.equal(easeInOutCubic(-1), 0);
  assert.equal(easeInOutCubic(2), 1);
});

test("keyframes menjepit di luar rentang dan memakai easing di dalamnya", () => {
  const f = keyframes([[0, 0], [4, 100]]);
  assert.equal(f(-1), 0);
  assert.equal(f(2), 50);
  assert.equal(f(1), 6.25);
  assert.equal(f(9), 100);
});

test("seekBentuk loop mulus: seek(12) dan seek(-3) sama dengan seek(0) dan seek(9)", () => {
  assert.deepEqual(seekBentuk(12), seekBentuk(0));
  assert.deepEqual(seekBentuk(24), seekBentuk(0));
  assert.deepEqual(seekBentuk(-3), seekBentuk(9));
  assert.equal(seekBentuk(0)[0], "translate(40.0px, 60.0px) rotate(0.0deg) scale(1.000)");
});

test("seekBentuk hanya transform", () => {
  const pola = /^translate\(-?\d+\.\dpx, -?\d+\.\dpx\) rotate\(-?\d+\.\ddeg\) scale\(\d+\.\d{3}\)$/;
  for (const t of [0, 1.5, 6, 11.9]) {
    const hasil = seekBentuk(t);
    assert.equal(hasil.length, BENTUK_SHAPES.length);
    for (const s of hasil) assert.match(s, pola);
  }
  assert.match(seekBentuk(3)[1], /rotate\(-90\.0deg\)/);
});

test("PARTIKEL_DOTS", () => {
  assert.equal(PARTIKEL_DOTS.length, 14);
  for (const d of PARTIKEL_DOTS) {
    assert.ok(d.leftPercent >= 0 && d.leftPercent < 100);
    assert.ok(d.durationSeconds >= 7);
  }
  assert.deepEqual(PARTIKEL_DOTS[1], { leftPercent: (53 / 370) * 100, size: 13, durationSeconds: 9, delaySeconds: -0.9, tone: "a" });
});

test("motionAllowed", () => {
  assert.equal(motionAllowed({ reducedMotion: false, saveData: false }), true);
  assert.equal(motionAllowed({ reducedMotion: true, saveData: false }), false);
  assert.equal(motionAllowed({ reducedMotion: false, saveData: true }), false);
});
