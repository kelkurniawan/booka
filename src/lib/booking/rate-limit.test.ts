// Test unit untuk src/lib/booking/rate-limit.ts.
//
// "server-only" (dipakai transitif lewat serverEnv()) hanya aman dengan
// --conditions=react-server, lihat package.json script test:unit dan
// komentar serupa di src/lib/crypto/secret-box.test.ts. hashClientIp juga
// memanggil serverEnv(), yang memvalidasi env var Supabase wajib walaupun
// tidak dipakai langsung di sini -- lihat pola yang sama di
// secret-box.test.ts.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { before, test } from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "test-anon-key-unit-test";
process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");

let extractClientIp: (headers: Pick<Headers, "get">) => string;
let hashClientIp: (ip: string) => string;

before(async () => {
  ({ extractClientIp, hashClientIp } = await import("./rate-limit"));
});

function headersFrom(values: Record<string, string>): Pick<Headers, "get"> {
  return {
    get: (name: string) => values[name.toLowerCase()] ?? null,
  };
}

// --- extractClientIp ---------------------------------------------------

test("extractClientIp: mengambil entri PERTAMA x-forwarded-for (client asli, bukan proxy)", () => {
  const headers = headersFrom({ "x-forwarded-for": "203.0.113.5, 10.0.0.1, 10.0.0.2" });
  assert.equal(extractClientIp(headers), "203.0.113.5");
});

test("extractClientIp: memangkas spasi di sekitar entri pertama", () => {
  const headers = headersFrom({ "x-forwarded-for": "  203.0.113.5  , 10.0.0.1" });
  assert.equal(extractClientIp(headers), "203.0.113.5");
});

test("extractClientIp: x-forwarded-for dengan satu entri (tanpa koma)", () => {
  const headers = headersFrom({ "x-forwarded-for": "203.0.113.9" });
  assert.equal(extractClientIp(headers), "203.0.113.9");
});

test("extractClientIp: fallback ke x-real-ip kalau x-forwarded-for tidak ada", () => {
  const headers = headersFrom({ "x-real-ip": "198.51.100.7" });
  assert.equal(extractClientIp(headers), "198.51.100.7");
});

test("extractClientIp: x-forwarded-for menang atas x-real-ip kalau keduanya ada", () => {
  const headers = headersFrom({
    "x-forwarded-for": "203.0.113.5",
    "x-real-ip": "198.51.100.7",
  });
  assert.equal(extractClientIp(headers), "203.0.113.5");
});

test("extractClientIp: kedua header tidak ada -> string kosong, bukan throw", () => {
  const headers = headersFrom({});
  assert.doesNotThrow(() => {
    assert.equal(extractClientIp(headers), "");
  });
});

test("extractClientIp: x-forwarded-for kosong -> fallback ke x-real-ip", () => {
  const headers = headersFrom({ "x-forwarded-for": "", "x-real-ip": "198.51.100.7" });
  assert.equal(extractClientIp(headers), "198.51.100.7");
});

// --- hashClientIp --------------------------------------------------------

test("hashClientIp: stabil -- IP yang sama menghasilkan hash yang sama", () => {
  assert.equal(hashClientIp("203.0.113.5"), hashClientIp("203.0.113.5"));
});

test("hashClientIp: IP berbeda menghasilkan hash berbeda", () => {
  assert.notEqual(hashClientIp("203.0.113.5"), hashClientIp("203.0.113.6"));
});

test("hashClientIp: hasil hex SHA-256 (64 karakter hex), bukan IP mentah", () => {
  const hash = hashClientIp("203.0.113.5");
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(hash, /203\.0\.113\.5/);
});

test("hashClientIp: bukan sekadar SHA-256(ip) polos -- salt TOKEN_ENCRYPTION_KEY ikut memengaruhi hasil", () => {
  const unsaltedHash = createHash("sha256").update("203.0.113.5").digest("hex");
  assert.notEqual(hashClientIp("203.0.113.5"), unsaltedHash);
});

test("hashClientIp: string kosong (header proxy hilang) tetap menghasilkan hash yang stabil, tidak throw", () => {
  assert.doesNotThrow(() => {
    const hash = hashClientIp("");
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(hash, hashClientIp(""));
  });
});
