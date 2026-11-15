import { NextResponse, type NextRequest } from "next/server";

import { isAuthorizedCron } from "@/lib/cron/auth";
import { serverEnv } from "@/lib/env/server";
import { sendReminders } from "@/lib/notify/dispatch";

/**
 * Pesan dikirim berurutan dengan jeda (lihat REMINDER_GAP_MS), jadi
 * puluhan reminder butuh waktu lebih dari batas default.
 */
export const maxDuration = 300;

/**
 * GET /api/cron/reminders
 *
 * Pengingat ke pelanggan merchant Pro/Studio lewat WhatsApp, email, dan push,
 * untuk dua offset: H-1 (jadwal besok) dan pagi hari jadwal (jadwal hari
 * ini, mulai 30 menit dari sekarang sampai akhir hari WIB).
 *
 * JADWAL: satu kali sehari, 01:00 UTC / 08:00 WIB (vercel.json), batas cron
 * paket Vercel Hobby (Keputusan 1). Satu jalan mencakup kedua offset tanpa
 * kirim ganda: jendelanya tidak tumpang tindih (besok vs hari ini) dan
 * kind-nya beda di notification_log. Jadwal hari ini sebelum 08:30 WIB
 * tidak terjangkau; itu batas yang disengaja.
 *
 * Aman dipanggil ulang: notification_log mencegah reminder yang sama
 * terkirim dua kali.
 */
export async function GET(request: NextRequest) {
  const env = serverEnv();

  if (!isAuthorizedCron(request.headers.get("authorization"), env.cronSecret)) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  }

  try {
    const { candidates, pruned } = await sendReminders();
    if (candidates > 0) console.info("[cron/reminders] reminder diproses", { candidates, pruned });
    return NextResponse.json({ candidates, pruned });
  } catch (error) {
    console.error("[cron/reminders] gagal memproses reminder", { error });
    return NextResponse.json({ error: "Gagal memproses reminder" }, { status: 500 });
  }
}
