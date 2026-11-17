import test from "node:test";
import assert from "node:assert/strict";
import {
  checkUsernameClaim,
  httpStatusFor,
  USERNAME_CHECK_MESSAGES,
} from "@/lib/marketing/username-check";

function fakeRpc(reply: string | Error) {
  const calls: string[] = [];
  return {
    calls,
    rpc: async (u: string) => {
      calls.push(u);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
}

test("format tidak valid tidak memanggil rpc", async () => {
  for (const raw of ["ab", "-mawar", "studio mawar"]) {
    const f = fakeRpc("available");
    const r = await checkUsernameClaim(raw, f.rpc);
    assert.equal(r.status, "invalid");
    assert.ok(r.message.length > 0);
    assert.equal(f.calls.length, 0);
  }
});

test("masukan dinormalkan sebelum rpc", async () => {
  const f = fakeRpc("available");
  await checkUsernameClaim("  Studio-Mawar ", f.rpc);
  assert.deepEqual(f.calls, ["studio-mawar"]);
});

test("balasan rpc dipetakan", async () => {
  for (const s of ["available", "taken", "reserved", "rate_limited"] as const) {
    const r = await checkUsernameClaim("studio-mawar", fakeRpc(s).rpc);
    assert.deepEqual(r, { status: s, message: USERNAME_CHECK_MESSAGES[s] });
  }
});

test("balasan aneh atau rpc melempar jadi error", async () => {
  assert.equal((await checkUsernameClaim("studio-mawar", fakeRpc("aneh").rpc)).status, "error");
  assert.equal((await checkUsernameClaim("studio-mawar", fakeRpc(new Error("x")).rpc)).status, "error");
});

test("httpStatusFor", () => {
  assert.equal(httpStatusFor("rate_limited"), 429);
  assert.equal(httpStatusFor("error"), 503);
  assert.equal(httpStatusFor("available"), 200);
  assert.equal(httpStatusFor("invalid"), 200);
});
