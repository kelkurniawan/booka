import assert from "node:assert/strict";
import { test } from "node:test";

import { buildIco } from "./ico";

test("buildIco: header ICO dan satu entri per ukuran berisi PNG", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const ico = buildIco([
    { size: 16, png },
    { size: 32, png },
  ]);
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 2);
  assert.equal(ico[6], 16);
  assert.equal(ico[22], 32);
  assert.equal(ico.readUInt16LE(6 + 4), 1);
  assert.equal(ico.readUInt16LE(6 + 6), 32);
  assert.equal(ico.readUInt32LE(6 + 8), 4);
  assert.equal(ico.readUInt32LE(6 + 12), 6 + 16 * 2);
  assert.equal(ico.readUInt32LE(22 + 12), 6 + 16 * 2 + 4);
  assert.deepEqual([...ico.subarray(38, 42)], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal(ico.length, 38 + 8);
});

test("buildIco: ukuran 256 ditulis 0 sesuai format ICO", () => {
  const ico = buildIco([{ size: 256, png: Buffer.from([1]) }]);
  assert.equal(ico[6], 0);
  assert.equal(ico[7], 0);
});
