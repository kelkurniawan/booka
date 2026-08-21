import assert from "node:assert/strict";
import test from "node:test";

import { isScopedMediaPath } from "./path";

const ID = "11111111-1111-1111-1111-111111111111";
const LAIN = "22222222-2222-2222-2222-222222222222";

test("menerima path wajar di folder merchant sendiri", () => {
  assert.equal(isScopedMediaPath(`${ID}/avatar-a1b2c3d4.webp`, ID), true);
  assert.equal(isScopedMediaPath(`${ID}/svc/abc/img-1.webp`, ID), true);
});

test("menolak path milik merchant lain", () => {
  assert.equal(isScopedMediaPath(`${LAIN}/avatar.webp`, ID), false);
});

test("menolak muatan yang memecah url() di CSS", () => {
  assert.equal(
    isScopedMediaPath(`${ID}/a.webp"), url("https://jahat/x.png`, ID),
    false,
  );
  assert.equal(isScopedMediaPath(`${ID}/a.webp'), url('x`, ID), false);
  assert.equal(isScopedMediaPath(`${ID}/a b.webp`, ID), false);
});

test("menolak pemanjatan keluar folder", () => {
  assert.equal(isScopedMediaPath(`${ID}/../avatars/rahasia.png`, ID), false);
  assert.equal(isScopedMediaPath(`${ID}/svc/../../x.webp`, ID), false);
});

test("menolak path kosong dan yang cuma folder", () => {
  assert.equal(isScopedMediaPath(`${ID}/`, ID), false);
  assert.equal(isScopedMediaPath(ID, ID), false);
  assert.equal(isScopedMediaPath("", ID), false);
});

test("menolak path yang melampaui batas kolom", () => {
  assert.equal(isScopedMediaPath(`${ID}/${"a".repeat(400)}.webp`, ID), false);
});
