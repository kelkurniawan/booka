import { z } from "zod";

import { jakartaWallClockToUtc } from "@/lib/booking/slots";
import { isSafeBannerUrl } from "@/lib/promo/banner";
import type { Database } from "@/types/database";

/**
 * Batas di sini mencerminkan constraint tabel `merchant_banners`
 * (supabase/migrations/20261117000300_merchant_banners.sql). Database tetap penjaga terakhir.
 * Kesesuaian image_path dengan folder merchant dicek di server action (butuh id merchant).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const blankToNull = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v;

const optionalText = (max: number, label: string) =>
  z.preprocess(blankToNull, z.string().trim().max(max, `${label} maksimal ${max} karakter`).nullable());

const optionalDate = z.preprocess(
  blankToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid")
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Tanggal tidak valid")
    .nullable(),
);

const optionalUuid = z.preprocess(blankToNull, z.uuid("Pilihan tidak valid").nullable());

const checkbox = z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean());

export const bannerFormSchema = z
  .object({
    source: z.enum(["TEMPLATE", "IMAGE"], "Pilih jenis banner"),
    tag_text: optionalText(24, "Label"),
    title: optionalText(60, "Judul"),
    body: optionalText(90, "Keterangan"),
    color: z.enum(["ACCENT", "DARK", "SOFT"]).default("ACCENT"),
    image_path: optionalText(400, "Gambar"),
    alt_text: optionalText(140, "Teks alternatif"),
    cta_text: optionalText(20, "Teks tombol"),
    target_kind: z.preprocess(blankToNull, z.enum(["VOUCHER", "SERVICE", "URL"]).nullable()),
    target_voucher_id: optionalUuid,
    target_service_id: optionalUuid,
    target_url: optionalText(500, "Tautan"),
    starts_on: optionalDate,
    ends_on: optionalDate,
    published: checkbox,
  })
  .superRefine((v, ctx) => {
    const fail = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

    if (v.source === "TEMPLATE" && !v.title) fail("title", "Judul wajib diisi");
    if (v.source === "IMAGE") {
      if (!v.image_path) fail("image_path", "Pilih gambar banner");
      if (!v.alt_text) fail("alt_text", "Teks alternatif wajib diisi");
    }

    if (v.target_kind) {
      if (!v.cta_text) fail("cta_text", "Teks tombol wajib diisi");
      if (v.target_kind === "VOUCHER" && !v.target_voucher_id) fail("target_voucher_id", "Pilih voucher");
      if (v.target_kind === "SERVICE" && !v.target_service_id) fail("target_service_id", "Pilih layanan");
      if (v.target_kind === "URL" && !(v.target_url && isSafeBannerUrl(v.target_url))) {
        fail("target_url", "Tautan harus diawali https://");
      }
    }

    if (v.starts_on && v.ends_on && v.ends_on < v.starts_on) {
      fail("ends_on", "Tanggal selesai tidak boleh sebelum tanggal mulai");
    }
  })
  // Kolom milik sumber atau target lain dikosongkan, supaya sisa isian form tidak melanggar constraint.
  .transform((v) => {
    const isImage = v.source === "IMAGE";
    const kind = v.target_kind;
    return {
      ...v,
      tag_text: isImage ? null : v.tag_text,
      title: isImage ? null : v.title,
      body: isImage ? null : v.body,
      image_path: isImage ? v.image_path : null,
      alt_text: isImage ? v.alt_text : null,
      cta_text: kind ? v.cta_text : null,
      target_voucher_id: kind === "VOUCHER" ? v.target_voucher_id : null,
      target_service_id: kind === "SERVICE" ? v.target_service_id : null,
      target_url: kind === "URL" ? v.target_url : null,
    };
  });

export type BannerFormInput = z.output<typeof bannerFormSchema>;

type BannerInsert = Database["public"]["Tables"]["merchant_banners"]["Insert"];

/** Tanggal form (WIB) ke timestamptz: mulai 00:00 hari itu, selesai 00:00 hari berikutnya (eksklusif). */
export function bannerFormToRow(input: BannerFormInput): Omit<BannerInsert, "merchant_id" | "sort_order"> {
  const { starts_on, ends_on, ...rest } = input;
  return {
    ...rest,
    starts_at: starts_on ? jakartaWallClockToUtc(starts_on, "00:00").toISOString() : null,
    ends_at: ends_on ? new Date(jakartaWallClockToUtc(ends_on, "00:00").getTime() + DAY_MS).toISOString() : null,
  };
}
