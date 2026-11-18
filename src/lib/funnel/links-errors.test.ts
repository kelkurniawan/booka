import assert from "node:assert/strict";
import { test } from "node:test";

import { linksErrorMessage } from "./links-errors";

test("BK080, BK081, 42501 dipetakan ke pesan khusus", () => {
  assert.match(linksErrorMessage("BK080"), /Maksimal 8 tautan/);
  assert.match(linksErrorMessage("BK081"), /Tautan tidak valid/);
  assert.match(linksErrorMessage("42501"), /bukan milik akun ini/);
});

test("kode tak dikenal atau kosong: pesan umum, teks Postgres tidak bocor", () => {
  const generic = "Perubahan gagal disimpan. Coba lagi sebentar lagi.";
  assert.equal(linksErrorMessage("XX000"), generic);
  assert.equal(linksErrorMessage(undefined), generic);
});
