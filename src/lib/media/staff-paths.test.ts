import assert from "node:assert/strict";
import test from "node:test";

import {
  clipPosterPath,
  clipUploadExtension,
  isClipUploadPath,
  isStaffPhotoPath,
} from "./staff-paths";

const M = "11111111-1111-1111-1111-111111111111";
const S = "22222222-2222-2222-2222-222222222222";
const M_LAIN = "33333333-3333-3333-3333-333333333333";
const S_LAIN = "44444444-4444-4444-4444-444444444444";

test("tipe klip mentah dipetakan ke ekstensi path", () => {
  assert.equal(clipUploadExtension("video/quicktime"), "mov");
  assert.equal(clipUploadExtension("image/gif"), "gif");
  assert.equal(clipUploadExtension("image/png"), null);
});

test("foto staf hanya diterima di folder merchant dan staf sendiri", () => {
  assert.equal(isStaffPhotoPath(`${M}/staff/${S}/photo-a1b2.webp`, M, S), true);
  assert.equal(
    isStaffPhotoPath(`${M}/staff/${S_LAIN}/photo-a1b2.webp`, M, S),
    false,
  );
  assert.equal(
    isStaffPhotoPath(`${M_LAIN}/staff/${S}/photo-a1b2.webp`, M, S),
    false,
  );
  assert.equal(isStaffPhotoPath(`${M}/staff/${S}/photo-a1b2.png`, M, S), false);
  assert.equal(isStaffPhotoPath(`${M}/staff/${S}/photo-a"b.webp`, M, S), false);
  assert.equal(
    isStaffPhotoPath(`${M}/staff/${S}/../photo-a.webp`, M, S),
    false,
  );
});

test("berkas mentah hanya diterima di folder staf dengan ekstensi klip", () => {
  assert.equal(isClipUploadPath(`${M}/${S}/abc-123.gif`, M, S), true);
  assert.equal(isClipUploadPath(`${M}/${S}/a.exe`, M, S), false);
  assert.equal(isClipUploadPath(`${M}/${S_LAIN}/a.gif`, M, S), false);
  assert.equal(isClipUploadPath(`${M}/${S}/../a.gif`, M, S), false);
});

test("poster JPG memakai nama dasar klip MP4", () => {
  assert.equal(
    clipPosterPath("m/staff/s/clip-ab.mp4"),
    "m/staff/s/clip-ab.jpg",
  );
});
