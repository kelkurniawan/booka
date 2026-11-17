// Test unit untuk src/lib/validations/voucher.ts (cermin constraint tabel `vouchers`).
import assert from "node:assert/strict";
import { test } from "node:test";

import { voucherFormSchema, voucherFormToRow } from "./voucher";

const VALID = {
  code: "wisuda20",
  kind: "PERCENT",
  value: "20",
  is_public: "true",
};

test("kode dinormalkan ke huruf besar", () => {
  assert.equal(voucherFormSchema.parse(VALID).code, "WISUDA20");
});

test("PERCENT di atas 100 ditolak", () => {
  assert.equal(voucherFormSchema.safeParse({ ...VALID, value: "101" }).success, false);
});

test("max_discount dengan FIXED ditolak", () => {
  const r = voucherFormSchema.safeParse({ ...VALID, kind: "FIXED", value: "50000", max_discount: "10000" });
  assert.equal(r.success, false);
});

test("ends_on sebelum starts_on ditolak", () => {
  const r = voucherFormSchema.safeParse({ ...VALID, starts_on: "2026-12-10", ends_on: "2026-12-01" });
  assert.equal(r.success, false);
});

test("kode privat kurang dari 6 karakter ditolak, publik boleh", () => {
  assert.equal(voucherFormSchema.safeParse({ ...VALID, code: "ABCD", is_public: "false" }).success, false);
  assert.equal(voucherFormSchema.safeParse({ ...VALID, code: "ABCD" }).success, true);
});

test("kode kosong atau spasi saja ditolak", () => {
  assert.equal(voucherFormSchema.safeParse({ ...VALID, code: "    " }).success, false);
});

test("isian opsional kosong menjadi null", () => {
  const p = voucherFormSchema.parse({ ...VALID, quota: "", min_spend: " ", starts_on: "" });
  assert.equal(p.quota, null);
  assert.equal(p.min_spend, null);
  assert.equal(p.starts_on, null);
});

test("voucherFormToRow: tanggal WIB, satu kali per nomor, semua layanan = NULL", () => {
  const row = voucherFormToRow(
    voucherFormSchema.parse({
      ...VALID,
      starts_on: "2026-12-01",
      ends_on: "2026-12-31",
      one_per_phone: "on",
    }),
  );
  assert.equal(row.starts_at, "2026-11-30T17:00:00.000Z");
  assert.equal(row.ends_at, "2026-12-31T17:00:00.000Z");
  assert.equal(row.per_phone_limit, 1);
  assert.equal(row.service_ids, null);
  assert.equal(row.visibility, "PUBLIC");
});

test("voucherFormToRow: tanpa one_per_phone per_phone_limit null", () => {
  assert.equal(voucherFormToRow(voucherFormSchema.parse(VALID)).per_phone_limit, null);
});

test("scope 'some' tanpa layanan ditolak, 'some' dengan layanan dan 'all' lolos", () => {
  const none = voucherFormSchema.safeParse({ ...VALID, scope: "some", service_ids: [] });
  assert.equal(none.success, false);
  assert.equal(none.error?.issues[0].message, "Pilih minimal satu layanan");
  const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
  assert.equal(voucherFormSchema.safeParse({ ...VALID, scope: "some", service_ids: [id] }).success, true);
  assert.equal(voucherFormSchema.safeParse({ ...VALID, scope: "all" }).success, true);
});
