// Test unit untuk src/lib/payments/select-connection.ts.
import assert from "node:assert/strict";
import { test } from "node:test";

import { selectActiveConnection } from "./select-connection";

type Candidate = { provider: "MIDTRANS" | "XENDIT"; connected_at: string };

const MIDTRANS_FIRST: Candidate = { provider: "MIDTRANS", connected_at: "2026-01-01T00:00:00Z" };
const XENDIT_SECOND: Candidate = { provider: "XENDIT", connected_at: "2026-02-01T00:00:00Z" };

test("active_payment_provider diset dan koneksinya ACTIVE -> dipilih, walau bukan yang paling lama tersambung", () => {
  const result = selectActiveConnection([MIDTRANS_FIRST, XENDIT_SECOND], "XENDIT");
  assert.equal(result?.provider, "XENDIT");
});

test("active_payment_provider diset tapi koneksi itu TIDAK ada di daftar ACTIVE (mis. sudah dicabut) -> jatuh balik ke earliest-connected", () => {
  // Pemanggil hanya boleh memasukkan koneksi yang benar-benar ACTIVE ke sini
  // (lihat komentar fungsi) -- jadi "XENDIT" yang tidak ACTIVE lagi tidak
  // akan ada dalam array, persis skenario ini.
  const result = selectActiveConnection([MIDTRANS_FIRST], "XENDIT");
  assert.equal(result?.provider, "MIDTRANS");
});

test("active_payment_provider belum pernah diset (null) -> earliest-connected (elemen pertama)", () => {
  const result = selectActiveConnection([MIDTRANS_FIRST, XENDIT_SECOND], null);
  assert.equal(result?.provider, "MIDTRANS");
});

test("daftar koneksi kosong -> null, walau active_payment_provider diset", () => {
  const result = selectActiveConnection([], "MIDTRANS");
  assert.equal(result, null);
});

test("hanya satu koneksi ACTIVE, active_payment_provider diset ke provider lain (belum pernah menyimpan ulang) -> tetap jatuh balik ke satu-satunya koneksi", () => {
  const result = selectActiveConnection([XENDIT_SECOND], "MIDTRANS");
  assert.equal(result?.provider, "XENDIT");
});
