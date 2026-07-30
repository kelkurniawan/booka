// Test unit untuk src/lib/crypto/secret-box.ts.
//
// Dijalankan dengan `npm run test:unit`, yang memanggil tsx sebagai loader
// Node. Dua hal butuh tsx (bukan cukup `node --test` polos):
//   1. Import alias "@/..." — tsx membaca `paths` dari tsconfig.json.
//   2. Paket "server-only" hanya aman di-import di bawah kondisi export
//      "react-server" (lihat --conditions=react-server di package.json);
//      tanpa itu, index.js paket tersebut langsung throw.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, test } from "node:test";

// serverEnv() memvalidasi seluruh env server, jadi variabel Supabase yang
// wajib (bukan cuma TOKEN_ENCRYPTION_KEY) harus terisi walaupun tidak dipakai
// langsung oleh secret-box.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "test-anon-key-unit-test";
process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");

// Import dinamis di dalam `before` (bukan top-level await) supaya file ini
// tetap kompatibel dengan output CJS yang dipakai tsx ketika package.json
// project tidak mendeklarasikan "type": "module".
type SecretContext = {
  merchantId: string;
  provider: "MIDTRANS" | "XENDIT";
  field: "access_token" | "refresh_token";
};
let encryptSecret: (plaintext: string, context: SecretContext) => string;
let decryptSecret: (payload: string, context: SecretContext) => string;

before(async () => {
  ({ encryptSecret, decryptSecret } = await import("./secret-box"));
});

const CTX: SecretContext = {
  merchantId: "11111111-1111-1111-1111-111111111111",
  provider: "MIDTRANS",
  field: "access_token",
};

test("round-trip: decryptSecret(encryptSecret(x)) === x", () => {
  const plaintext = "sk_live_rahasia_midtrans_12345";
  const payload = encryptSecret(plaintext, CTX);
  assert.equal(decryptSecret(payload, CTX), plaintext);
});

test("format payload: prefiks versi v1 dan 4 bagian dipisah titik", () => {
  const payload = encryptSecret("token-apa-saja", CTX);
  const parts = payload.split(".");
  assert.equal(parts.length, 4);
  assert.equal(parts[0], "v1");
});

test("IV acak: dua enkripsi plaintext sama menghasilkan ciphertext berbeda", () => {
  const plaintext = "token-yang-sama-persis";
  const payloadA = encryptSecret(plaintext, CTX);
  const payloadB = encryptSecret(plaintext, CTX);

  assert.notEqual(payloadA, payloadB);

  // Tapi keduanya tetap harus balik ke plaintext yang sama.
  assert.equal(decryptSecret(payloadA, CTX), plaintext);
  assert.equal(decryptSecret(payloadB, CTX), plaintext);
});

test("payload rusak (ciphertext diutak-atik) ditolak", () => {
  const payload = encryptSecret("token-rahasia", CTX);
  const [version, iv, ciphertext, authTag] = payload.split(".");

  // Balik urutan karakter base64 ciphertext supaya isinya berubah tapi
  // panjangnya (dan validitas base64-nya) tetap sama.
  const tamperedCiphertext = ciphertext.split("").reverse().join("");
  const tampered = [version, iv, tamperedCiphertext, authTag].join(".");

  assert.throws(() => decryptSecret(tampered, CTX));
});

test("payload dengan authTag salah (tapi panjangnya tetap 16 byte) ditolak", () => {
  const payload = encryptSecret("token-rahasia-lain", CTX);
  const [version, iv, ciphertext] = payload.split(".");
  const fakeAuthTag = Buffer.alloc(16, 9).toString("base64");

  assert.throws(() =>
    decryptSecret([version, iv, ciphertext, fakeAuthTag].join("."), CTX),
  );
});

test("authTag yang dipotong (4 byte) ditolak, bukan diterima diam-diam", () => {
  // Node menerima authTag GCM yang dipotong (4/8/12/13/14/15/16 byte) kalau
  // authTagLength tidak dipatok di createDecipheriv DAN panjangnya tidak
  // diperiksa manual — itu menurunkan biaya forgery dari 2^128 ke 2^32.
  // Tes ini memastikan authTag 4-byte yang valid secara base64 tetap ditolak.
  const payload = encryptSecret("token-untuk-tes-truncation", CTX);
  const [version, iv, ciphertext, authTag] = payload.split(".");
  const truncatedAuthTag = Buffer.from(authTag, "base64")
    .subarray(0, 4)
    .toString("base64");

  assert.throws(
    () => decryptSecret([version, iv, ciphertext, truncatedAuthTag].join("."), CTX),
    /panjang authTag harus 16 byte/,
  );
});

test("payload asal-asalan (bukan hasil encryptSecret) ditolak", () => {
  assert.throws(() => decryptSecret("bukan-payload-yang-valid", CTX));
});

test("prefiks versi asing (v2) ditolak", () => {
  const payload = encryptSecret("token-untuk-tes-versi", CTX);
  const [, iv, ciphertext, authTag] = payload.split(".");
  const foreignVersion = ["v2", iv, ciphertext, authTag].join(".");

  assert.throws(
    () => decryptSecret(foreignVersion, CTX),
    /versi enkripsi/i,
  );
});

test("AAD: dekripsi dengan context yang sama persis berhasil", () => {
  const payload = encryptSecret("token-context-cocok", CTX);
  assert.equal(decryptSecret(payload, { ...CTX }), "token-context-cocok");
});

test("AAD: merchantId berbeda ditolak (ciphertext tidak bisa dipindah ke merchant lain)", () => {
  const payload = encryptSecret("token-milik-merchant-a", CTX);
  const wrongMerchant: SecretContext = {
    ...CTX,
    merchantId: "22222222-2222-2222-2222-222222222222",
  };

  assert.throws(() => decryptSecret(payload, wrongMerchant));
});

test("AAD: provider berbeda ditolak", () => {
  const payload = encryptSecret("token-untuk-midtrans", CTX);
  const wrongProvider: SecretContext = { ...CTX, provider: "XENDIT" };

  assert.throws(() => decryptSecret(payload, wrongProvider));
});

test("AAD: field berbeda ditolak (access_token tidak bisa dibaca sebagai refresh_token)", () => {
  const payload = encryptSecret("token-access", CTX);
  const wrongField: SecretContext = { ...CTX, field: "refresh_token" };

  assert.throws(() => decryptSecret(payload, wrongField));
});

test("tanpa TOKEN_ENCRYPTION_KEY, encryptSecret melempar error berbahasa Indonesia", () => {
  // Dijalankan di proses tsx terpisah (bukan import() langsung) supaya cache
  // serverEnv() (singleton per-proses) yang sudah terisi TOKEN_ENCRYPTION_KEY
  // di proses tes utama tidak ikut mempengaruhi hasil. Proses baru juga
  // dibutuhkan supaya import alias "@/..." di secret-box.ts tetap terselesaikan
  // lewat tsx.
  const dir = mkdtempSync(path.join(tmpdir(), "secret-box-missing-key-"));
  const scriptPath = path.join(dir, "probe.mts");
  writeFileSync(
    scriptPath,
    `
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-anon-key-unit-test";
    delete process.env.TOKEN_ENCRYPTION_KEY;
    const { encryptSecret } = await import(${JSON.stringify(
      new URL("./secret-box.ts", import.meta.url).href,
    )});
    try {
      encryptSecret("apa saja", {
        merchantId: "11111111-1111-1111-1111-111111111111",
        provider: "MIDTRANS",
        field: "access_token",
      });
      console.error("EXPECTED_THROW_DID_NOT_HAPPEN");
      process.exit(1);
    } catch (err) {
      process.stdout.write(String(err.message));
    }
    `,
  );

  try {
    const result = spawnSync(
      "npx",
      ["tsx", "--conditions=react-server", scriptPath],
      { encoding: "utf8", cwd: process.cwd() },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /TOKEN_ENCRYPTION_KEY belum diisi/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
