import { NextResponse, type NextRequest } from "next/server";

import { isAuthorizedCron } from "@/lib/cron/auth";
import { serverEnv } from "@/lib/env/server";
import { sendDayBeforeReminders } from "@/lib/notify/dispatch";

/**
 * Pesan dikirim berurutan dengan jeda (lihat REMINDER_GAP_MS), jadi
 * puluhan reminder butuh waktu lebih dari batas default.
 */
export const maxDuration = 300;

/**
 * GET /api/cron/reminders
 *
 * Reminder WhatsApp H-1 untuk pelanggan merchant Pro/Studio. JADWAL:
 * 01:00 UTC / 08:00 WIB (vercel.json) -- jam wajar untuk menerima pesan,
 * dan sekali sehari memang batas cron paket Vercel Hobby.
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
    const { candidates } = await sendDayBeforeReminders();
    if (candidates > 0) console.info("[cron/reminders] reminder diproses", { candidates });
    return NextResponse.json({ candidates });
  } catch (error) {
    console.error("[cron/reminders] gagal memproses reminder", { error });
    return NextResponse.json({ error: "Gagal memproses reminder" }, { status: 500 });
  }
}
