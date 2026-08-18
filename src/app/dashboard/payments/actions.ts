"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";

import { storeMerchantCredential } from "@/lib/payments/credentials";
import { ROUTES } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { manualKeySchema } from "@/lib/validations/payment-connection";
import type { PaymentProvider } from "@/types/database";

import type { ManualKeyFormState } from "./payment-state";

function toFieldErrors(error: z.ZodError): ManualKeyFormState {
  const fieldErrors: ManualKeyFormState["fieldErrors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      key === "provider" ||
      key === "serverKey" ||
      key === "environment" ||
      key === "webhookToken"
    ) {
      fieldErrors[key] ??= issue.message;
    }
  }
  return { status: "error", message: "Periksa kembali isian Anda", fieldErrors };
}

/**
 * Simpan koneksi manual (Server Key yang di-paste merchant). Jalur ini yang
 * benar-benar aktif hari ini -- OAuth Connect (lihat
 * src/app/api/payments/[provider]/connect/route.ts) menunggu kredensial
 * partner Midtrans/Xendit.
 *
 * `createAdminClient()` dipakai karena dua alasan: (1) `authenticated` tidak
 * punya hak INSERT/UPDATE pada `payment_connections` sama sekali (hanya
 * SELECT, lihat supabase/migrations/20260729000100_init_schema.sql), dan
 * (2) menyimpan Server Key butuh RPC yang cuma bisa dipanggil service_role
 * (lihat storeMerchantCredential). `merchant_id` diambil HANYA dari
 * getUser() -- tidak pernah dari form -- supaya merchant tidak bisa
 * menimpa koneksi merchant lain. Koneksi yang baru disimpan juga langsung
 * dijadikan `merchants.active_payment_provider` -- lihat komentar dekat
 * pemanggilannya di bawah.
 */
export async function saveManualKey(
  _prevState: ManualKeyFormState,
  formData: FormData,
): Promise<ManualKeyFormState> {
  const parsed = manualKeySchema.safeParse({
    provider: formData.get("provider"),
    serverKey: formData.get("serverKey"),
    environment: formData.get("environment"),
    // FormData mengembalikan null kalau field tidak dirender sama sekali
    // (MIDTRANS tidak menampilkan input Callback Token) atau "" kalau
    // dirender tapi dikosongkan -- keduanya diperlakukan sama sebagai
    // "tidak diisi", bukan dilempar ke Zod sebagai string kosong.
    webhookToken: formData.get("webhookToken") || undefined,
  });
  if (!parsed.success) return toFieldErrors(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  const admin = createAdminClient();

  const { error: connectionError } = await admin.from("payment_connections").upsert(
    {
      merchant_id: user.id,
      provider: parsed.data.provider,
      provider_account_id: null,
      status: "ACTIVE",
      connection_mode: "MANUAL_KEY",
      environment: parsed.data.environment,
      scope: null,
      token_expires_at: null,
    },
    { onConflict: "merchant_id,provider" },
  );

  if (connectionError) {
    return { status: "error", message: "Gagal menyimpan koneksi. Coba lagi." };
  }

  try {
    await storeMerchantCredential({
      merchantId: user.id,
      provider: parsed.data.provider,
      accessToken: parsed.data.serverKey,
      webhookToken: parsed.data.webhookToken ?? null,
    });
  } catch {
    return { status: "error", message: "Gagal menyimpan Server Key. Coba lagi." };
  }

  // Koneksi yang baru disimpan/diperbarui jadi provider yang dipakai untuk
  // booking baru -- tanpa ini POST /api/bookings selalu memilih koneksi
  // ACTIVE yang paling lama tersambung, mengabaikan pilihan merchant kalau
  // ia punya lebih dari satu provider ACTIVE (lihat selectActiveConnection
  // di src/lib/payments/select-connection.ts). Kolom ini sengaja TIDAK ada
  // di hak UPDATE `authenticated` (lihat AGENTS.md) -- hanya boleh di-set
  // dari sini lewat admin client, `merchant_id` dari getUser() di atas,
  // bukan dari form.
  const { error: activeProviderError } = await admin
    .from("merchants")
    .update({ active_payment_provider: parsed.data.provider })
    .eq("id", user.id);

  if (activeProviderError) {
    // Tidak fatal untuk keberhasilan menyimpan koneksi/kredensial -- kalau
    // ini gagal, POST /api/bookings tetap jalan lewat fallback
    // earliest-connected, cuma mungkin tidak memilih provider yang baru
    // saja disimpan merchant kalau ia sudah punya koneksi ACTIVE lain yang
    // lebih lama. Dicatat supaya tetap terlihat.
    console.error("[dashboard/payments] gagal menyetel active_payment_provider", {
      merchantId: user.id,
      provider: parsed.data.provider,
      error: activeProviderError,
    });
  }

  revalidatePath(ROUTES.payments);
  revalidatePath(ROUTES.dashboard);
  return { status: "success" };
}

/** Putuskan koneksi -- menghapus baris payment_connections sekaligus kredensialnya (ON DELETE CASCADE). */
export async function disconnectProvider(
  provider: PaymentProvider,
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  const admin = createAdminClient();
  const { error } = await admin
    .from("payment_connections")
    .delete()
    .eq("merchant_id", user.id)
    // RLS tidak berlaku untuk admin client -- filter ini SATU-SATUNYA yang
    // mencegah merchant memutuskan koneksi merchant lain.
    .eq("provider", provider);

  if (error) {
    return { ok: false, message: "Gagal memutuskan koneksi. Coba lagi." };
  }

  revalidatePath(ROUTES.payments);
  revalidatePath(ROUTES.dashboard);
  return { ok: true };
}
