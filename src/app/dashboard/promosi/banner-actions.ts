"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { requireMerchant } from "@/lib/auth/session";
import { mapBookingError } from "@/lib/booking/errors";
import { isScopedMediaPath, PESAN_PATH_TIDAK_VALID } from "@/lib/media/path";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { bannerFormSchema, bannerFormToRow, type BannerFormInput } from "@/lib/validations/banner";

import type { BannerFormState } from "./banner-state";

const FIELDS = new Set<string>([
  "source", "tag_text", "title", "body", "color", "image_path", "alt_text", "cta_text", "target_kind",
  "target_voucher_id", "target_service_id", "target_url", "starts_on", "ends_on", "published",
]);

const PESAN_BATAS_TAYANG =
  "Maksimal 3 banner tayang bersamaan. Atur jadwalnya, simpan sebagai draf, atau selesaikan banner lain dulu.";

function toFieldErrors(error: z.ZodError): BannerFormState {
  const fieldErrors: NonNullable<BannerFormState["fieldErrors"]> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && FIELDS.has(key)) {
      fieldErrors[key as keyof BannerFormInput] ??= issue.message;
    }
  }
  return { status: "error", message: "Periksa kembali isian Anda", fieldErrors };
}

const fieldError = (field: keyof BannerFormInput, message: string): BannerFormState => ({
  status: "error",
  message: "Periksa kembali isian Anda",
  fieldErrors: { [field]: message },
});

export async function saveBanner(_prev: BannerFormState, formData: FormData): Promise<BannerFormState> {
  const parsed = bannerFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFieldErrors(parsed.error);

  const { user } = await requireMerchant();
  const supabase = await createClient();
  const input = parsed.data;

  if (input.image_path) {
    const folder = `${user.id}/banner/`;
    if (!isScopedMediaPath(input.image_path, user.id) || !input.image_path.startsWith(folder)) {
      return { status: "error", message: PESAN_PATH_TIDAK_VALID };
    }
  }

  // Target harus milik merchant ini; voucher harus PUBLIC (Keputusan 16). Trigger DB menjaga lagi.
  if (input.target_voucher_id) {
    const { data } = await supabase
      .from("vouchers")
      .select("id")
      .eq("id", input.target_voucher_id)
      .eq("merchant_id", user.id)
      .eq("visibility", "PUBLIC")
      .maybeSingle();
    if (!data) return fieldError("target_voucher_id", "Voucher harus publik dan milik Anda.");
  }
  if (input.target_service_id) {
    const { data } = await supabase
      .from("services")
      .select("id")
      .eq("id", input.target_service_id)
      .eq("merchant_id", user.id)
      .maybeSingle();
    if (!data) return fieldError("target_service_id", "Layanan tidak ditemukan.");
  }

  const row = bannerFormToRow(input);
  const id = String(formData.get("id") ?? "").trim();
  let error;
  if (id) {
    ({ error } = await supabase.from("merchant_banners").update(row).eq("id", id).eq("merchant_id", user.id));
  } else {
    // Banner baru masuk di urutan terakhir.
    const { data: last } = await supabase
      .from("merchant_banners")
      .select("sort_order")
      .eq("merchant_id", user.id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    ({ error } = await supabase
      .from("merchant_banners")
      .insert({ ...row, merchant_id: user.id, sort_order: (last?.sort_order ?? -1) + 1 }));
  }

  if (error) {
    if (error.code === "PR001") return { status: "error", message: PESAN_BATAS_TAYANG };
    // P0001: trigger enforce_promo_tier (paket Starter).
    if (error.code === "P0001") return { status: "error", message: error.message };
    if (error.code === "BK057") return { status: "error", message: mapBookingError(error.code).message };
    if (error.code === "23514" && error.message.includes("merchant_banners_image_path")) return { status: "error", message: PESAN_PATH_TIDAK_VALID };
    console.error("[promosi/banner] gagal menyimpan banner", { userId: user.id, error });
    return { status: "error", message: "Gagal menyimpan banner. Coba lagi." };
  }

  revalidatePath(ROUTES.promoBanners);
  return { status: "success", message: id ? "Banner diperbarui" : "Banner dibuat" };
}

/** Mengembalikan `imagePath` supaya klien menghapus berkasnya dari Storage setelah baris terhapus. */
export async function deleteBanner(
  id: string,
): Promise<{ ok: boolean; message?: string; imagePath?: string | null }> {
  const { user } = await requireMerchant();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("merchant_banners")
    .select("image_path")
    .eq("id", id)
    .eq("merchant_id", user.id)
    .maybeSingle();
  const { error } = await supabase.from("merchant_banners").delete().eq("id", id).eq("merchant_id", user.id);
  if (error) {
    console.error("[promosi/banner] gagal menghapus banner", { userId: user.id, error });
    return { ok: false, message: "Gagal menghapus banner. Coba lagi." };
  }
  revalidatePath(ROUTES.promoBanners);
  return { ok: true, imagePath: existing?.image_path ?? null };
}

/** Menukar posisi dengan tetangga. Tidak atomik; urutan keliru hanya kosmetik dan bisa diulang. */
export async function moveBanner(id: string, direction: "up" | "down"): Promise<{ ok: boolean }> {
  const { user } = await requireMerchant();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("merchant_banners")
    .select("id, sort_order")
    .eq("merchant_id", user.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error || !data) return { ok: false };

  const from = data.findIndex((b) => b.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= data.length) return { ok: false };

  // Renumber penuh supaya sort_order kembar (semua 0) tidak membuat tukar-menukar tanpa efek.
  const order = data.map((b) => b.id);
  [order[from], order[to]] = [order[to], order[from]];
  const results = await Promise.all(
    order.map((bannerId, index) =>
      supabase.from("merchant_banners").update({ sort_order: index }).eq("id", bannerId).eq("merchant_id", user.id),
    ),
  );
  if (results.some((r) => r.error)) return { ok: false };

  revalidatePath(ROUTES.promoBanners);
  return { ok: true };
}
