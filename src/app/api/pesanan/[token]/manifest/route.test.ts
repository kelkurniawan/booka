import assert from "node:assert/strict";
import { test } from "node:test";

import type { NextRequest } from "next/server";

import { GET } from "./route";

const TOKEN = "a".repeat(48);

function call(token: string) {
  return GET({} as NextRequest, { params: Promise.resolve({ token }) });
}

test("manifest pesanan memakai ikon Marky 192 dan 512", async () => {
  const res = await call(TOKEN);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { icons: { src: string; sizes: string; type: string }[]; start_url: string };
  assert.deepEqual(body.icons, [
    { src: "/brand/marky-192.png", sizes: "192x192", type: "image/png" },
    { src: "/brand/marky-512.png", sizes: "512x512", type: "image/png" },
  ]);
  assert.equal(body.start_url, `/pesanan/${TOKEN}`);
});

test("token bukan 48 hex tetap 404", async () => {
  const res = await call("bukan-token");
  assert.equal(res.status, 404);
});
