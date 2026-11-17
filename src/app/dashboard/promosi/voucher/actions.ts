"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { requireMerchant } from "@/lib/auth/session";
import { mapBookingError } from "@/lib/booking/errors";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { voucherFormSchema, voucherFormToRow, type VoucherFormInput } from "@/lib/validations/voucher";

import type { VoucherFormState } from "./voucher-state";

const FIELDS = new Set<string>([
  "code", "kind", "value", "max_discount", "min_spend", "service_ids", "quota",
  "starts_on", "ends_on", "one_per_phone", "new_customer_only", "is_public",
]);

function toFieldErrors(error: z.ZodError): VoucherFormState {
  const fieldErrors: NonNullable<VoucherFormState["fieldErrors"]> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && FIELDS.has(key)) {
      fieldErrors[key as keyof VoucherFormInput] ??= issue.message;
    }
  }
  return { status: "error", message: "Periksa kembali isian Anda", fieldErrors };
}

export async function saveVoucher(_prev: VoucherFormState, formData: FormData): Promise<VoucherFormState> {
  const parsed = voucherFormSchema.safeParse({
    code: formData.get("code") ?? "",
    kind: formData.get("kind"),
    value: formData.get("value"),
    max_discount: formData.get("max_discount"),
    min_spend: formData.get("min_spend"),
    service_ids: formData.getAll("service_ids"),
    scope: formData.get("scope") ?? undefined,
    quota: formData.get("quota"),
    starts_on: formData.get("starts_on"),
    ends_on: formData.get("ends_on"),
    one_per_phone: formData.get("one_per_phone"),
    new_customer_only: formData.get("new_customer_only"),
    is_public: formData.get("is_public"),
  });
  if (!parsed.success) return toFieldErrors(parsed.error);

  const { user } = await requireMerchant();
  const supabase = await createClient();

  // Layanan yang dipilih harus milik merchant ini; id asing akan membuat voucher tak pernah berlaku.
  if (parsed.data.service_ids.length > 0) {
    const { data: owned } = await supabase
      .from("services")
      .select("id")
      .eq("merchant_id", user.id)
      .in("id", parsed.data.service_ids);
    if ((owned ?? []).length !== parsed.data.service_ids.length) {
      return {
        status: "error",
        message: "Periksa kembali isian Anda",
        fieldErrors: { service_ids: "Ada layanan yang tidak ditemukan." },
      };
    }
  }

  const row = voucherFormToRow(parsed.data);
  const id = String(formData.get("id") ?? "").trim();
  const { error } = id
    ? await supabase.from("vouchers").update(row).eq("id", id).eq("merchant_id", user.id)
    : await supabase.from("vouchers").insert({ ...row, merchant_id: user.id });

  if (error) {
    if (error.code === "23505") {
      return {
        status: "error",
        message: "Periksa kembali isian Anda",
        fieldErrors: { code: "Kode ini sudah dipakai voucher lain." },
      };
    }
    // P0001: trigger enforce_promo_tier (paket Starter).
    if (error.code === "P0001") return { status: "error", message: error.message };
    // BK058: voucher masih menjadi target banner, tidak boleh dijadikan rahasia.
    if (error.code === "BK058") return { status: "error", message: mapBookingError(error.code).message };
    console.error("[promosi/voucher] gagal menyimpan voucher", { userId: user.id, error });
    return { status: "error", message: "Gagal menyimpan voucher. Coba lagi." };
  }

  revalidatePath(ROUTES.promoVouchers);
  return { status: "success", message: id ? "Voucher diperbarui" : "Voucher dibuat" };
}

export async function deleteVoucher(id: string): Promise<{ ok: boolean; message?: string }> {
  const { user } = await requireMerchant();
  const supabase = await createClient();
  const { error } = await supabase.from("vouchers").delete().eq("id", id).eq("merchant_id", user.id);
  if (error) {
    console.error("[promosi/voucher] gagal menghapus voucher", { userId: user.id, error });
    return { ok: false, message: "Gagal menghapus voucher. Coba lagi." };
  }
  revalidatePath(ROUTES.promoVouchers);
  return { ok: true };
}
