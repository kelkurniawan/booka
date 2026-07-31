import { NextResponse, type NextRequest } from "next/server";

import { isAuthorizedCron } from "@/lib/cron/auth";
import { serverEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/cancel-unpaid
 *
 * Membatalkan semua booking PENDING yang sudah kedaluwarsa (expires_at < now).
 * Dijadwalkan Vercel Cron tiap 5 menit (lihat vercel.json). Vercel mengirim
 * header `Authorization: Bearer $CRON_SECRET` secara otomatis kalau CRON_SECRET
 * di-set sebagai env var project.
 *
 * Membatalkan booking (PENDING -> CANCELLED) otomatis membebaskan:
 *   - slot-nya  (constraint bookings_no_overlap hanya mengunci PENDING/PAID)
 *   - kuota bulanan (trigger bookings_enforce_quota hanya menghitung PENDING/PAID)
 * jadi tidak perlu kerja tambahan selain update status.
 */
export async function GET(request: NextRequest) {
  const env = serverEnv();

  // FAIL CLOSED: tanpa CRON_SECRET terkonfigurasi, tolak semua request.
  if (!isAuthorizedCron(request.headers.get("authorization"), env.cronSecret)) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const nowISO = new Date().toISOString();

  // Satu UPDATE atomik, difilter status=PENDING + expires_at<now supaya
  // memakai index parsial bookings_pending_expiry_idx. `select("id")` +
  // count exact memberi jumlah baris yang benar-benar dibatalkan.
  const { data, error } = await supabase
    .from("bookings")
    .update({
      status: "CANCELLED",
      cancelled_at: nowISO,
      cancel_reason: "DP tidak dibayar dalam batas waktu",
    })
    .eq("status", "PENDING")
    .lt("expires_at", nowISO)
    .select("id");

  if (error) {
    console.error("[cron/cancel-unpaid] gagal membatalkan booking kedaluwarsa", {
      error,
    });
    return NextResponse.json({ error: "Gagal membatalkan booking" }, { status: 500 });
  }

  const cancelledCount = data?.length ?? 0;
  if (cancelledCount > 0) {
    console.info("[cron/cancel-unpaid] booking kedaluwarsa dibatalkan", { cancelledCount });
  }

  return NextResponse.json({ cancelledCount });
}
