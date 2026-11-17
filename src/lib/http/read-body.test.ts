import { test } from "node:test";
import assert from "node:assert/strict";

import { readBodyText } from "./read-body";

function chunked(parts: string[]): Request {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of parts) controller.enqueue(enc.encode(p));
      controller.close();
    },
  });
  // Tanpa content-length: body chunked.
  return new Request("http://x/", { method: "POST", body: stream, duplex: "half" } as RequestInit);
}

test("readBodyText membaca body kecil", async () => {
  assert.equal(await readBodyText(chunked(['{"a":', "1}"]), 4096), '{"a":1}');
});

test("readBodyText berhenti saat body chunked melewati batas", async () => {
  assert.equal(await readBodyText(chunked(["x".repeat(3000), "y".repeat(3000)]), 4096), null);
});

test("readBodyText menolak content-length yang melewati batas", async () => {
  const req = new Request("http://x/", {
    method: "POST",
    body: "z",
    headers: { "content-length": "999999" },
  });
  assert.equal(await readBodyText(req, 4096), null);
});
