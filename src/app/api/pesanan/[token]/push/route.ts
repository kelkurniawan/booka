import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { encryptSecret } from "@/lib/crypto/secret-box";
import { endpointHash, pushConfig, pushSubscriptionSchema } from "@/lib/notify/push";
import { REMINDER_TIERS } from "@/lib/notify/reminder-plan";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST/DELETE /api/pesanan/[token]/push
 *
 * Pelanggan menyimpan atau mencabut langganan web push untuk satu booking.
 * Tanpa sesi: token akses 48 hex adalah kuncinya. /api/* TIDAK dicakup
 * matcher proxy, jadi verifikasi dilakukan di sini dan query admin difilter
 * access_token lalu merchant_id. Token tidak pernah dikembalikan.
 */

const NOT_FOUND = () => NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });

async function loadBooking(token: string) {
  const { data, error } = await createAdminClient()
    .from("bookings")
    .select("id, merchant_id, status, end_datetime")
    .eq("access_token", token)
    .maybeSingle();
  return { booking: data, error };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) return NOT_FOUND();

  const body: unknown = await request.json().catch(() => null);
  const parsed = pushSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Langganan notifikasi tidak valid." }, { status: 400 });
  }
  const sub = parsed.data;

  const { booking, error } = await loadBooking(token);
  if (error) {
    console.error("[api/pesanan/push] gagal memuat booking", { error });
    return NextResponse.json({ error: "Gagal memuat pesanan" }, { status: 500 });
  }
  if (!booking) return NOT_FOUND();

  const admin = createAdminClient();
  const [merchantRes, settingsRes] = await Promise.all([
    admin.from("merchants").select("subscription_tier").eq("id", booking.merchant_id).maybeSingle(),
    admin.from("merchant_settings").select("reminder_push").eq("merchant_id", booking.merchant_id).maybeSingle(),
  ]);
  if (merchantRes.error || settingsRes.error) {
    console.error("[api/pesanan/push] gagal memuat merchant", { bookingId: booking.id });
    return NextResponse.json({ error: "Gagal memuat pesanan" }, { status: 500 });
  }

  // Tanpa baris pengaturan, default reminder_push menyala (sama seperti halaman pesanan).
  const eligible =
    (booking.status === "PAID" || booking.status === "CONFIRMED") &&
    new Date(booking.end_datetime).getTime() > Date.now() &&
    !!merchantRes.data &&
    REMINDER_TIERS.includes(merchantRes.data.subscription_tier) &&
    (settingsRes.data?.reminder_push ?? true);
  if (!eligible) {
    return NextResponse.json({ error: "Pengingat tidak tersedia untuk booking ini." }, { status: 409 });
  }
  if (!pushConfig()) {
    return NextResponse.json({ error: "Notifikasi HP belum disiapkan." }, { status: 409 });
  }

  try {
    const { error: upsertError } = await admin.from("push_subscriptions").upsert(
      {
        booking_id: booking.id,
        merchant_id: booking.merchant_id,
        endpoint_hash: endpointHash(sub.endpoint),
        subscription_enc: encryptSecret(JSON.stringify(sub), {
          merchantId: booking.merchant_id,
          bookingId: booking.id,
          field: "push_subscription",
        }),
      },
      { onConflict: "booking_id,endpoint_hash" },
    );
    if (upsertError) throw upsertError;
  } catch (e) {
    console.error("[api/pesanan/push] gagal menyimpan langganan", { bookingId: booking.id, error: e });
    return NextResponse.json({ error: "Gagal menyimpan langganan" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) return NOT_FOUND();

  const { booking, error } = await loadBooking(token);
  if (error) {
    console.error("[api/pesanan/push] gagal memuat booking", { error });
    return NextResponse.json({ error: "Gagal memuat pesanan" }, { status: 500 });
  }
  if (!booking) return NOT_FOUND();

  const { error: deleteError } = await createAdminClient()
    .from("push_subscriptions")
    .delete()
    .eq("booking_id", booking.id)
    .eq("merchant_id", booking.merchant_id);
  if (deleteError) {
    console.error("[api/pesanan/push] gagal menghapus langganan", { bookingId: booking.id, error: deleteError });
    return NextResponse.json({ error: "Gagal mencabut langganan" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
