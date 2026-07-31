import assert from "node:assert/strict";
import { test } from "node:test";

import { isAuthorizedCron } from "./auth";

const SECRET = "a".repeat(64);

test("isAuthorizedCron: cocok persis -> true", () => {
  assert.equal(isAuthorizedCron(`Bearer ${SECRET}`, SECRET), true);
});

test("isAuthorizedCron: secret kosong -> selalu false (fail closed)", () => {
  // Meski header-nya 'benar', tanpa secret terkonfigurasi harus ditolak.
  assert.equal(isAuthorizedCron(`Bearer ${SECRET}`, ""), false);
  assert.equal(isAuthorizedCron(`Bearer ${SECRET}`, undefined), false);
  // Kasus paling berbahaya: header kosong + secret kosong tidak boleh "cocok".
  assert.equal(isAuthorizedCron("", ""), false);
  assert.equal(isAuthorizedCron(null, undefined), false);
});

test("isAuthorizedCron: header hilang atau tanpa prefix Bearer -> false", () => {
  assert.equal(isAuthorizedCron(null, SECRET), false);
  assert.equal(isAuthorizedCron(undefined, SECRET), false);
  assert.equal(isAuthorizedCron(SECRET, SECRET), false); // tanpa "Bearer "
});

test("isAuthorizedCron: token salah -> false", () => {
  assert.equal(isAuthorizedCron(`Bearer ${"b".repeat(64)}`, SECRET), false);
  // Panjang beda ditolak sebelum timingSafeEqual (yang melempar kalau beda panjang).
  assert.equal(isAuthorizedCron(`Bearer ${"a".repeat(32)}`, SECRET), false);
});
