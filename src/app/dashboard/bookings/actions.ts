"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { cancelBookingSchema } from "@/lib/validations/booking";

import { MERCHANT_CANCEL_REASON, type CancelBookingResult } from "./booking-state";

/**
 * Pembatalan manual oleh merchant. Kepemilikan ditegakkan oleh filter
 * `.eq("id", ...).eq("merchant_id", ...)` DAN oleh RLS policy
 * "bookings_cancel_own" (supabase/migrations/20260819000200_bookings_merchant_cancel.sql)
 * sekaligus, bukan oleh pemeriksaan SELECT terpisah sebelum update ini --
 * kalau baris tidak ditemukan lewat filter gabungan itu (bukan milik
 * merchant ini, atau statusnya bukan PENDING/PAID lagi), update tidak
 * mengubah apa pun dan `data` di bawah bernilai null.
 */
export async function cancelBooking(id: string): Promise<CancelBookingResult> {
  const parsed = cancelBookingSchema.safeParse({ id });
  if (!parsed.success) {
    return { ok: false, message: "Booking tidak valid." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  const { data, error } = await supabase
    .from("bookings")
    .update({
      status: "CANCELLED",
      cancelled_at: new Date().toISOString(),
      cancel_reason: MERCHANT_CANCEL_REASON,
    })
    .eq("id", parsed.data.id)
    .eq("merchant_id", user.id)
    .in("status", ["PENDING", "PAID"])
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, message: "Gagal membatalkan booking. Coba lagi." };
  }

  if (!data) {
    // Tidak ada baris yang cocok filter -- entah bukan milik merchant ini,
    // entah statusnya sudah CANCELLED sebelumnya (mis. cron sudah lebih
    // dulu membatalkannya karena PENDING kedaluwarsa). Pesan jelas untuk
    // merchant, bukan error mentah.
    return {
      ok: false,
      message: "Booking ini sudah dibatalkan sebelumnya atau tidak ditemukan.",
    };
  }

  revalidatePath(ROUTES.bookings);
  return { ok: true };
}
