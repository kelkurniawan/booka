"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";

import { notifyRequestDecided } from "@/lib/notify/dispatch";
import { findChargeProvider } from "@/lib/payments/charge-booking";
import { ROUTES } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { OnSitePaymentMethod } from "@/types/database";
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
    .in("status", ["PENDING", "PAID", "CONFIRMED"])
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

const RPC_ERRORS: Record<string, string> = {
  BK030: "Permintaan ini sudah dijawab atau tidak ditemukan.",
  BK031: "Permintaan ini sudah kedaluwarsa.",
  BK032: "Booking ini tidak punya tagihan di tempat yang belum lunas.",
  BK033: "Kehadiran baru bisa ditandai mendekati jadwal.",
};

function rpcErrorMessage(code: string | undefined): string {
  return (code && RPC_ERRORS[code]) || "Gagal menyimpan. Coba lagi.";
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(ROUTES.login);
  return { supabase, user };
}

/** Setujui atau tolak permintaan booking (status REQUESTED). */
export async function decideRequest(id: string, approve: boolean): Promise<CancelBookingResult> {
  const parsed = cancelBookingSchema.safeParse({ id });
  if (!parsed.success) return { ok: false, message: "Booking tidak valid." };

  const { supabase, user } = await requireUser();

  if (approve) {
    // Permintaan berbayar butuh gateway aktif untuk membuat tagihan DP.
    const { data: booking } = await supabase
      .from("bookings")
      .select("amount_due_now")
      .eq("id", parsed.data.id)
      .eq("merchant_id", user.id)
      .maybeSingle();
    if (booking && booking.amount_due_now > 0) {
      try {
        const provider = await findChargeProvider(createAdminClient(), user.id);
        if (!provider) {
          return {
            ok: false,
            message: "Aktifkan pembayaran dulu di menu Pembayaran sebelum menyetujui permintaan berbayar.",
          };
        }
      } catch {
        return { ok: false, message: "Gagal menyimpan. Coba lagi." };
      }
    }
  }

  const { error } = await supabase.rpc("decide_booking_request", {
    p_booking_id: parsed.data.id,
    p_approve: approve,
  });
  if (error) return { ok: false, message: rpcErrorMessage(error.code) };

  after(() => notifyRequestDecided(parsed.data.id));
  revalidatePath(ROUTES.bookings);
  return { ok: true };
}

/** Tandai sisa pembayaran di tempat sudah diterima. */
export async function markPaidOnSite(
  id: string,
  method: OnSitePaymentMethod,
): Promise<CancelBookingResult> {
  const parsed = cancelBookingSchema.safeParse({ id });
  if (!parsed.success) return { ok: false, message: "Booking tidak valid." };
  if (!["CASH", "QRIS", "TRANSFER"].includes(method)) {
    return { ok: false, message: "Metode pembayaran tidak valid." };
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("mark_booking_paid_on_site", {
    p_booking_id: parsed.data.id,
    p_method: method,
  });
  if (error) return { ok: false, message: rpcErrorMessage(error.code) };

  revalidatePath(ROUTES.bookings);
  return { ok: true };
}

/** Catat pelanggan hadir (true) atau tidak datang (false). */
export async function markAttendance(id: string, attended: boolean): Promise<CancelBookingResult> {
  const parsed = cancelBookingSchema.safeParse({ id });
  if (!parsed.success) return { ok: false, message: "Booking tidak valid." };

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("mark_booking_attendance", {
    p_booking_id: parsed.data.id,
    p_attended: attended === true,
  });
  if (error) return { ok: false, message: rpcErrorMessage(error.code) };

  revalidatePath(ROUTES.bookings);
  return { ok: true };
}
