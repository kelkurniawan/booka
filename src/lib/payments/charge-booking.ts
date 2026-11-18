import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ChargeRejectedError, getAdapter, recordChargeRejection, recordChargeSuccess } from "@/lib/payments";
import { loadMerchantCredential } from "@/lib/payments/credentials";
import { selectActiveConnection } from "@/lib/payments/select-connection";
import { isDeliverableWebhookUrl, paymentWebhookUrl } from "@/lib/payments/webhook-url";
import { serverEnv } from "@/lib/env/server";
import type { Database, PaymentProvider } from "@/types/database";

/**
 * Provider yang dipakai untuk menagih merchant ini, atau null bila tidak ada
 * koneksi ACTIVE. Merchant bisa punya koneksi ACTIVE di kedua provider:
 * pilihan eksplisit (`active_payment_provider`) menang selama masih ACTIVE,
 * selain itu yang paling lama tersambung (aturan di select-connection.ts,
 * dipakai juga halaman Pembayaran). Melempar bila query gagal.
 */
export async function findChargeProvider(
  admin: SupabaseClient<Database>,
  merchantId: string,
): Promise<PaymentProvider | null> {
  const [merchant, connections] = await Promise.all([
    admin.from("merchants").select("active_payment_provider").eq("id", merchantId).maybeSingle(),
    admin
      .from("payment_connections")
      .select("provider")
      .eq("merchant_id", merchantId)
      .eq("status", "ACTIVE")
      .order("connected_at", { ascending: true }),
  ]);
  if (merchant.error) throw merchant.error;
  if (connections.error) throw connections.error;

  return (
    selectActiveConnection(connections.data ?? [], merchant.data?.active_payment_provider ?? null)
      ?.provider ?? null
  );
}

/**
 * Membuat charge QRIS ke akun gateway merchant (uang tidak pernah lewat
 * platform) dan menyimpannya di baris booking. Tidak membatalkan booking:
 * pemanggil yang memutuskan. Melempar bila gagal; penolakan definitif gateway
 * (ChargeRejectedError) lebih dulu dicatat ke kesehatan koneksi.
 */
export async function chargeBooking(
  admin: SupabaseClient<Database>,
  input: {
    bookingId: string;
    merchantId: string;
    amount: number;
    provider: PaymentProvider;
    /** Default bookingId. Percobaan ulang butuh id baru: gateway menolak order id ganda. */
    orderId?: string;
  },
): Promise<{ qrString: string }> {
  const { bookingId, merchantId, amount, provider, orderId = bookingId } = input;
  try {
    const credential = await loadMerchantCredential(merchantId, provider);
    if (!credential) {
      // Race langka: koneksi dicabut tepat setelah findChargeProvider.
      throw new Error("Kredensial payment gateway tidak ditemukan");
    }

    const notificationUrl = paymentWebhookUrl(serverEnv().appUrl, provider);
    const charge = await getAdapter(provider).createQrisCharge({
      orderId,
      amount,
      environment: credential.environment,
      credential: credential.credential,
      notificationUrl: isDeliverableWebhookUrl(notificationUrl) ? notificationUrl : undefined,
    });

    const { error: updateError } = await admin
      .from("bookings")
      .update({
        payment_provider: provider,
        payment_url: charge.qrString,
        payment_reference: charge.orderId,
      })
      .eq("id", bookingId)
      .eq("merchant_id", merchantId);
    if (updateError) throw updateError;

    // Kegagalan menulis kesehatan tidak pernah menggagalkan charge yang sukses.
    await recordChargeSuccess(admin, merchantId, provider);
    return { qrString: charge.qrString };
  } catch (error) {
    // Hanya penolakan DEFINITIF gateway menandai koneksi bermasalah; gangguan
    // jaringan/timeout bukan salah konfigurasi merchant.
    if (error instanceof ChargeRejectedError) {
      await recordChargeRejection(admin, merchantId, error);
    }
    throw error;
  }
}

/** Pesan untuk pelanggan; pesan provider mentah tidak pernah diteruskan. */
export function chargeFailureMessage(error: unknown): string {
  return error instanceof ChargeRejectedError
    ? "Merchant belum bisa menerima pembayaran QRIS saat ini karena ada masalah pada koneksi payment gateway-nya. Ini bukan gangguan sementara. Silakan hubungi merchant secara langsung, bukan mencoba lagi."
    : "Gagal membuat kode pembayaran, silakan coba lagi.";
}
