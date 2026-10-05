import assert from "node:assert/strict";
import { test } from "node:test";

import { isAppHost, routeCustomDomain } from "./routing";

test("akar domain merchant menampilkan halaman booking-nya", () => {
  assert.deepEqual(routeCustomDomain("/", "salon"), { type: "rewrite", pathname: "/salon" });
});

test("gambar OG ikut di-rewrite ke milik merchant", () => {
  assert.deepEqual(routeCustomDomain("/opengraph-image", "salon"), {
    type: "rewrite",
    pathname: "/salon/opengraph-image",
  });
});

test("status pesanan pelanggan lolos apa adanya", () => {
  assert.deepEqual(routeCustomDomain("/pesanan/abc", "salon"), { type: "pass" });
});

test("/{username} di domain sendiri dialihkan ke / supaya tautannya satu", () => {
  assert.deepEqual(routeCustomDomain("/salon", "salon"), { type: "redirect", pathname: "/", toApp: false });
});

test("dashboard, login, dan merchant lain dialihkan ke domain Booka", () => {
  for (const path of ["/dashboard", "/masuk", "/syarat", "/merchant-lain"]) {
    assert.deepEqual(routeCustomDomain(path, "salon"), { type: "redirect", pathname: path, toApp: true });
  }
});

test("isAppHost mengenali domain aplikasi, localhost, dan pratinjau Vercel", () => {
  assert.equal(isAppHost("booka.id", "https://booka.id"), true);
  assert.equal(isAppHost("www.booka.id", "https://booka.id"), true);
  assert.equal(isAppHost("localhost:3000", "https://booka.id"), true);
  assert.equal(isAppHost("booka-git-x.vercel.app", "https://booka.id"), true);
  assert.equal(isAppHost("booking.salon.id", "https://booka.id"), false);
});
