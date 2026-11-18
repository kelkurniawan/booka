import assert from "node:assert/strict";
import { test } from "node:test";

import { venueLayout } from "@/lib/booking/court-ui";

import { canvasSize, clampBox, courtSize, defaultCourtSpot, nudge, rotateAria, rotateCourt } from "./geometry";

const canvas = { w: 720, h: 560 };

test("ukuran lapangan sama dengan peta publik, putaran 0 dan 90", () => {
  for (const rotation of [0, 90] as const) {
    const { w, h } = courtSize(rotation);
    const { aspect } = venueLayout({
      courts: [{ id: "a", name: "L1", pos_x: 100, pos_y: 100, rotation }],
      areas: [],
      markers: [],
    });
    // aspect publik = (w + 2*PAD) / (h + 2*PAD), PAD = 12
    assert.equal(aspect, (w + 24) / (h + 24));
  }
});

test("clampBox menahan di kanvas dan membulatkan", () => {
  assert.deepEqual(clampBox({ x: -5, y: 900, w: 86, h: 210 }, canvas), { x: 0, y: 350 });
  assert.deepEqual(clampBox({ x: 10.6, y: 20.2, w: 86, h: 210 }, canvas), { x: 11, y: 20 });
});

test("nudge: panah 10, Shift 50, batas, tombol lain null", () => {
  const b = { x: 100, y: 100, w: 86, h: 210 };
  assert.deepEqual(nudge(b, "ArrowRight", false, canvas), { x: 110, y: 100 });
  assert.deepEqual(nudge(b, "ArrowUp", true, canvas), { x: 100, y: 50 });
  assert.deepEqual(nudge({ ...b, x: 0 }, "ArrowLeft", false, canvas), { x: 0, y: 100 });
  assert.equal(nudge(b, "Enter", false, canvas), null);
});

test("rotateCourt bolak-balik dan tidak keluar kanvas", () => {
  const r = rotateCourt({ x: 600, y: 400 }, 0, canvas);
  assert.equal(r.rotation, 90);
  assert.ok(r.x + 210 <= 720 && r.y + 86 <= 560);
  assert.equal(rotateCourt({ x: 0, y: 0 }, 90, canvas).rotation, 0);
});

test("canvasSize membesar untuk benda jauh, minimal 720x560", () => {
  assert.deepEqual(canvasSize([]), canvas);
  assert.equal(canvasSize([{ x: 1000, y: 0, w: 100, h: 100 }]).w, 1124);
});

test("defaultCourtSpot tidak menumpuk dan aria putar sesuai L6", () => {
  assert.notDeepEqual(defaultCourtSpot(0), defaultCourtSpot(1));
  assert.equal(rotateAria("Lapangan 2"), "Putar Lapangan 2 90 derajat");
});
