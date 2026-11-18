"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireMerchant } from "@/lib/auth/session";
import { slugifyAdLink, uniqueSlug } from "@/lib/funnel/attribution";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { adLinkSchema, trackingSchema } from "@/lib/validations/funnel";

export type CreateAdLinkResult = { ok: true; slug: string } | { ok: false; message: string };
export type SimpleResult = { ok: true } | { ok: false; message: string };
export type TrackingErrors = Partial<Record<"metaPixelId" | "tiktokPixelId" | "ga4MeasurementId", string>>;
export type SaveTrackingResult = { ok: true } | { ok: false; message: string; fieldErrors?: TrackingErrors };

const GENERIC = "Perubahan gagal disimpan. Coba lagi sebentar lagi.";

export async function createAdLink(input: unknown): Promise<CreateAdLinkResult> {
  const { user } = await requireMerchant();
  const parsed = adLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa kembali isian Anda" };
  const { name, channel, serviceId, voucherCode } = parsed.data;

  const supabase = await createClient();
  // Tidak ada FK ke vouchers: pastikan kode memang milik merchant ini.
  if (voucherCode) {
    const { data: voucher, error: voucherError } = await supabase
      .from("vouchers")
      .select("id")
      .eq("merchant_id", user.id)
      .eq("code", voucherCode)
      .maybeSingle();
    if (voucherError) {
      console.error("[iklan] gagal memeriksa voucher", voucherError);
      return { ok: false, message: GENERIC };
    }
    if (!voucher) return { ok: false, message: "Voucher tidak ditemukan. Pilih voucher dari daftar Anda." };
  }
  // Dua kali coba: pembuatan serentak bisa merebut slug yang sama (unik per merchant).
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: rows, error: readError } = await supabase.from("ad_links").select("slug").eq("merchant_id", user.id);
    if (readError) {
      console.error("[iklan] gagal membaca slug", readError);
      return { ok: false, message: GENERIC };
    }
    const slug = uniqueSlug(slugifyAdLink(name, channel), new Set((rows ?? []).map((r) => r.slug)));
    const { error } = await supabase
      .from("ad_links")
      .insert({ merchant_id: user.id, slug, name, channel, service_id: serviceId, voucher_code: voucherCode });
    if (!error) {
      revalidatePath(ROUTES.ads);
      return { ok: true, slug };
    }
    if (error.code !== "23505") {
      console.error("[iklan] gagal membuat tautan", error);
      return { ok: false, message: GENERIC };
    }
  }
  return { ok: false, message: GENERIC };
}

export async function archiveAdLink(id: string): Promise<SimpleResult> {
  const { user } = await requireMerchant();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: GENERIC };
  const supabase = await createClient();
  const { error } = await supabase
    .from("ad_links")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("merchant_id", user.id);
  if (error) {
    console.error("[iklan] gagal mengarsipkan", error);
    return { ok: false, message: GENERIC };
  }
  revalidatePath(ROUTES.ads);
  return { ok: true };
}

export async function saveTracking(input: unknown): Promise<SaveTrackingResult> {
  const { user, merchant } = await requireMerchant();
  const parsed = trackingSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: TrackingErrors = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0] as keyof TrackingErrors;
      if (k && !fieldErrors[k]) fieldErrors[k] = i.message;
    }
    return { ok: false, message: "Periksa kembali isian Anda", fieldErrors };
  }
  const v = parsed.data;
  const row = {
    meta_pixel_id: v.metaPixelId,
    tiktok_pixel_id: v.tiktokPixelId,
    ga4_measurement_id: v.ga4MeasurementId,
    meta_enabled: v.metaEnabled,
    tiktok_enabled: v.tiktokEnabled,
    ga4_enabled: v.ga4Enabled,
  };

  const supabase = await createClient();
  // Update lalu insert, bukan upsert: hak update kolom tidak mencakup merchant_id.
  const { data: updated, error } = await supabase
    .from("merchant_tracking")
    .update(row)
    .eq("merchant_id", user.id)
    .select("merchant_id");
  let failure = error;
  if (!failure && (updated?.length ?? 0) === 0) {
    failure = (await supabase.from("merchant_tracking").insert({ merchant_id: user.id, ...row })).error;
  }
  if (failure) {
    console.error("[iklan] gagal menyimpan pixel", failure);
    return { ok: false, message: GENERIC };
  }
  if (merchant.username) revalidatePath(ROUTES.merchantPage(merchant.username));
  revalidatePath(ROUTES.ads);
  return { ok: true };
}
