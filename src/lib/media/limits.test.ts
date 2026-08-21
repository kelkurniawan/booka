import assert from "node:assert/strict";
import test from "node:test";

import { MEDIA_LIMITS, validateImageFile, validateVideoFile } from "./limits";

test("gambar dengan tipe dan ukuran wajar diterima", () => {
  assert.equal(validateImageFile({ type: "image/jpeg", size: 2_000_000 }), null);
});

test("gambar bertipe asing ditolak dengan pesan berbahasa Indonesia", () => {
  const pesan = validateImageFile({ type: "image/gif", size: 1000 });
  assert.ok(pesan);
  assert.match(pesan, /JPG|PNG|WebP/);
});

test("gambar melampaui batas unggah ditolak", () => {
  const pesan = validateImageFile({
    type: "image/png",
    size: MEDIA_LIMITS.imageMaxUploadBytes + 1,
  });
  assert.ok(pesan);
});

test("video melampaui 20MB ditolak", () => {
  const pesan = validateVideoFile(
    { type: "video/mp4", size: MEDIA_LIMITS.videoMaxBytes + 1 },
    10,
  );
  assert.ok(pesan);
  assert.match(pesan, /20 ?MB/);
});

test("video lebih panjang dari 30 detik ditolak", () => {
  const pesan = validateVideoFile({ type: "video/mp4", size: 1_000_000 }, 45);
  assert.ok(pesan);
  assert.match(pesan, /30 detik/);
});

test("video mp4 pendek diterima", () => {
  assert.equal(validateVideoFile({ type: "video/mp4", size: 5_000_000 }, 12), null);
});

test("batas di sini sejalan dengan setelan bucket di migration", () => {
  // 20971520 adalah file_size_limit bucket merchant-media.
  assert.equal(MEDIA_LIMITS.videoMaxBytes, 20971520);
});
