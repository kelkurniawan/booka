import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { REMINDER_TIERS } from "@/lib/notify/reminder-plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { reminderPrefsSchema } from "@/lib/validations/reminder-prefs";

/**
 * PUT /api/pesanan/[token]/pengingat
 *
 * Pelanggan menyimpan pilihan pengingat satu booking. Tanpa sesi: token akses
 * 48 hex adalah kuncinya; /api/* TIDAK dicakup matcher proxy, jadi verifikasi
 * di sini dan query admin difilter access_token lalu merchant_id. Token tidak
 * pernah dikembalikan. Kanal yang dimatikan merchant disimpan apa adanya
 * tetapi tidak berefek (Keputusan 17).
 */

const MAX_BODY_BYTES = 4096;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) {
    return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }

  const invalid = () => NextResponse.json({ error: "Pilihan pengingat tidak valid." }, { status: 400 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return invalid();
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY_BYTES) return invalid();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // body tetap null -> ditolak schema
  }
  const parsed = reminderPrefsSchema.safeParse(body);
  if (!parsed.success) return invalid();

  const admin = createAdminClient();
  const { data: booking, error } = await admin
    .from("bookings")
    .select("id, merchant_id, status, end_datetime")
    .eq("access_token", token)
    .maybeSingle();
  if (error) {
    console.error("[api/pesanan/pengingat] gagal memuat booking", { error });
    return NextResponse.json({ error: "Gagal memuat pesanan" }, { status: 500 });
  }
  if (!booking) return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });

  const { data: merchant, error: merchantError } = await admin
    .from("merchants")
    .select("subscription_tier")
    .eq("id", booking.merchant_id)
    .maybeSingle();
  if (merchantError) {
    console.error("[api/pesanan/pengingat] gagal memuat merchant", { bookingId: booking.id });
    return NextResponse.json({ error: "Gagal memuat pesanan" }, { status: 500 });
  }
  const eligible =
    (booking.status === "PAID" || booking.status === "CONFIRMED") &&
    new Date(booking.end_datetime).getTime() > Date.now() &&
    !!merchant &&
    REMINDER_TIERS.includes(merchant.subscription_tier);
  if (!eligible) {
    return NextResponse.json({ error: "Pengingat tidak tersedia untuk booking ini." }, { status: 409 });
  }

  const { error: upsertError } = await admin
    .from("booking_reminder_prefs")
    .upsert({ booking_id: booking.id, merchant_id: booking.merchant_id, ...parsed.data }, { onConflict: "booking_id" });
  if (upsertError) {
    console.error("[api/pesanan/pengingat] gagal menyimpan", { bookingId: booking.id, error: upsertError });
    return NextResponse.json({ error: "Gagal menyimpan pengingat" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
