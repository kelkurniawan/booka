import assert from "node:assert/strict";
import test from "node:test";

import { discardableDraftPath, replacedMediaPaths } from "./theme-media";

const kosong = { background_image_path: null, logo_path: null, cover_path: null };

test("berkas yang sudah tidak dipakai setelah simpan ikut dihapus", () => {
  const hasil = replacedMediaPaths(
    { background_image_path: "m/bg-1.webp", logo_path: "m/logo-1.webp", cover_path: null },
    { background_image_path: "m/bg-1.webp", logo_path: "m/logo-2.webp", cover_path: "m/cover-1.webp" },
  );
  assert.deepEqual(hasil, ["m/logo-1.webp"]);
});

test("menghapus sampul mengembalikan path sampul lama", () => {
  const hasil = replacedMediaPaths(
    { ...kosong, cover_path: "m/cover-1.webp" },
    { ...kosong, cover_path: null },
  );
  assert.deepEqual(hasil, ["m/cover-1.webp"]);
});

test("nilai yang sama tidak menghasilkan penghapusan", () => {
  const tema = { background_image_path: "m/bg-1.webp", logo_path: "m/logo-1.webp", cover_path: null };
  assert.deepEqual(replacedMediaPaths(tema, { ...tema }), []);
});

test("draf yang berbeda dari tersimpan dan tidak null boleh dibuang", () => {
  const saved = { ...kosong, logo_path: "m/logo-1.webp" };
  assert.equal(
    discardableDraftPath(saved, { ...kosong, logo_path: "m/logo-2.webp" }, "logo_path"),
    "m/logo-2.webp",
  );
  assert.equal(discardableDraftPath(saved, { ...kosong, logo_path: "m/logo-1.webp" }, "logo_path"), null);
  assert.equal(discardableDraftPath(saved, { ...kosong, logo_path: null }, "logo_path"), null);
});
