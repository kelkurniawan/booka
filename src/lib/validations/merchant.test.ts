// Test unit untuk src/lib/validations/merchant.ts.
//
// Memastikan aturan Zod tetap sinkron dengan constraint tabel `merchants` di
// supabase/migrations/20260729000100_init_schema.sql.
import assert from "node:assert/strict";
import { test } from "node:test";

import { bioSchema, BIO_MAX, fullNameSchema, settingsSchema } from "./merchant";

const VALID_SETTINGS = {
  full_name: "Studio Mawar",
  bio: "Kami melayani riasan pengantin sejak 2018.",
  whatsapp_number: "0812-3456-7890",
  username: "studio-mawar",
};

test("bio kosong (string kosong/spasi) dinormalkan ke null", () => {
  assert.equal(bioSchema.parse(""), null);
  assert.equal(bioSchema.parse("   "), null);
});

test(`bio lebih dari ${BIO_MAX} karakter ditolak (merchants_bio_length)`, () => {
  const result = bioSchema.safeParse("A".repeat(BIO_MAX + 1));
  assert.equal(result.success, false);
});

test("bio tepat pada batas maksimal diterima", () => {
  const result = bioSchema.safeParse("A".repeat(BIO_MAX));
  assert.equal(result.success, true);
});

test("nama usaha kurang dari 2 karakter ditolak (merchants_full_name_length)", () => {
  const result = fullNameSchema.safeParse("A");
  assert.equal(result.success, false);
});

test("nama usaha lebih dari 80 karakter ditolak (merchants_full_name_length)", () => {
  const result = fullNameSchema.safeParse("A".repeat(81));
  assert.equal(result.success, false);
});

test("settingsSchema menerima input valid dan menormalkan whatsapp ke E.164", () => {
  const parsed = settingsSchema.parse(VALID_SETTINGS);
  assert.equal(parsed.whatsapp_number, "+6281234567890");
  assert.equal(parsed.bio, "Kami melayani riasan pengantin sejak 2018.");
  assert.equal(parsed.username, "studio-mawar");
});

test("settingsSchema menerima bio kosong sebagai opsional", () => {
  const parsed = settingsSchema.parse({ ...VALID_SETTINGS, bio: "" });
  assert.equal(parsed.bio, null);
});

test("settingsSchema menolak username tidak valid (merchants_username_format)", () => {
  const result = settingsSchema.safeParse({ ...VALID_SETTINGS, username: "-invalid" });
  assert.equal(result.success, false);
});
