import { z } from "zod";

import { VOUCHER_CODE_PATTERN } from "@/lib/booking/voucher";
import { jakartaWallClockToUtc } from "@/lib/booking/slots";
import type { Database } from "@/types/database";

/**
 * Batas di sini mencerminkan constraint tabel `vouchers`
 * (supabase/migrations/20261117000100_vouchers.sql). Database tetap penjaga terakhir.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// Kolom opsional dari form: kosong atau spasi saja berarti "tanpa batas" (null).
const blankToNull = (v: unknown) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v);

const optionalInt = (label: string, min: number, max: number) =>
  z.preprocess(
    blankToNull,
    z.coerce
      .number(`${label} harus berupa angka`)
      .int(`${label} harus bilangan bulat`)
      .min(min, `${label} minimal ${min.toLocaleString("id-ID")}`)
      .max(max, `${label} maksimal ${max.toLocaleString("id-ID")}`)
      .nullable(),
  );

const optionalDate = z.preprocess(
  blankToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid")
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Tanggal tidak valid")
    .nullable(),
);

const checkbox = z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean());

export const voucherFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .refine((v) => VOUCHER_CODE_PATTERN.test(v), "Kode 4 sampai 16 huruf atau angka"),
    kind: z.enum(["PERCENT", "FIXED"], "Pilih jenis potongan"),
    value: z.coerce
      .number("Nilai potongan wajib diisi dengan angka")
      .int("Nilai potongan harus bilangan bulat")
      .min(1, "Nilai potongan minimal 1")
      .max(100_000_000, "Nilai potongan terlalu besar"),
    max_discount: optionalInt("Maks potongan", 1, 100_000_000),
    min_spend: optionalInt("Min transaksi", 1, 100_000_000),
    // Kosong = semua layanan. Id yang bukan milik merchant ditolak di server action.
    service_ids: z.array(z.uuid("Layanan tidak valid")).max(50, "Maksimal 50 layanan").default([]),
    // "some" = form memilih layanan tertentu; daftar kosong lalu ditolak (bukan diam-diam "semua layanan").
    scope: z.enum(["all", "some"]).default("all"),
    quota: optionalInt("Total kuota", 1, 100_000),
    starts_on: optionalDate,
    ends_on: optionalDate,
    one_per_phone: checkbox,
    new_customer_only: checkbox,
    is_public: checkbox,
  })
  .superRefine((v, ctx) => {
    if (v.scope === "some" && v.service_ids.length === 0) {
      ctx.addIssue({ code: "custom", path: ["service_ids"], message: "Pilih minimal satu layanan" });
    }
    if (v.kind === "PERCENT" && v.value > 100) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Persen maksimal 100" });
    }
    if (v.kind === "FIXED" && v.max_discount != null) {
      ctx.addIssue({
        code: "custom",
        path: ["max_discount"],
        message: "Maks potongan hanya untuk voucher persen",
      });
    }
    if (!v.is_public && v.code.length < 6) {
      ctx.addIssue({
        code: "custom",
        path: ["code"],
        message: "Kode voucher privat minimal 6 huruf atau angka",
      });
    }
    if (v.starts_on && v.ends_on && v.ends_on < v.starts_on) {
      ctx.addIssue({
        code: "custom",
        path: ["ends_on"],
        message: "Tanggal selesai tidak boleh sebelum tanggal mulai",
      });
    }
  });

export type VoucherFormInput = z.output<typeof voucherFormSchema>;

type VoucherInsert = Database["public"]["Tables"]["vouchers"]["Insert"];

/**
 * Tanggal form (WIB) ke kolom timestamptz. Mulai = 00:00 WIB hari itu; selesai
 * = 00:00 WIB hari berikutnya (eksklusif), jadi voucher berlaku sepanjang hari
 * terakhir. Daftar layanan kosong dikirim NULL, tidak pernah `{}` (ditolak DB).
 */
export function voucherFormToRow(input: VoucherFormInput): Omit<VoucherInsert, "merchant_id"> {
  return {
    code: input.code,
    kind: input.kind,
    value: input.value,
    max_discount: input.kind === "PERCENT" ? input.max_discount : null,
    min_spend: input.min_spend,
    service_ids: input.service_ids.length > 0 ? input.service_ids : null,
    quota: input.quota,
    per_phone_limit: input.one_per_phone ? 1 : null,
    new_customer_only: input.new_customer_only,
    visibility: input.is_public ? "PUBLIC" : "PRIVATE",
    starts_at: input.starts_on ? jakartaWallClockToUtc(input.starts_on, "00:00").toISOString() : null,
    ends_at: input.ends_on
      ? new Date(jakartaWallClockToUtc(input.ends_on, "00:00").getTime() + DAY_MS).toISOString()
      : null,
  };
}
