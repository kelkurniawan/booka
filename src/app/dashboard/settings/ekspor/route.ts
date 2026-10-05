import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * GET /dashboard/settings/ekspor
 *
 * Mengunduh seluruh data merchant sebagai satu berkas JSON -- hak atas
 * salinan data di UU PDP. Memakai klien BERSESI, bukan admin: RLS yang
 * membatasi setiap query ke baris milik merchant ini, jadi tidak ada jalan
 * route ini mengembalikan data merchant lain.
 *
 * Proxy memang menjaga /dashboard/*, tapi identitas tetap diverifikasi
 * ulang di sini lewat getUser() -- route handler tidak boleh bergantung
 * pada lapisan yang bisa berubah matcher-nya (AGENTS.md).
 *
 * Yang SENGAJA tidak ikut: kredensial payment gateway (schema private,
 * tidak pernah keluar dari server) dan `access_token` booking (tautan
 * status milik pelanggan, bukan data merchant).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  }

  const [merchant, profile, theme, services, media, availability, faqs, bookings, connections] =
    await Promise.all([
      supabase.from("merchants").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("merchant_profiles").select("*").eq("merchant_id", user.id).maybeSingle(),
      supabase.from("merchant_themes").select("*").eq("merchant_id", user.id).maybeSingle(),
      supabase.from("services").select("*").eq("merchant_id", user.id),
      supabase.from("service_media").select("*").eq("merchant_id", user.id),
      supabase.from("availability").select("*").eq("merchant_id", user.id),
      supabase.from("merchant_faqs").select("*").eq("merchant_id", user.id),
      supabase
        .from("bookings")
        .select(
          "id, service_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status, payment_provider, payment_reference, paid_at, cancelled_at, cancel_reason, expires_at, created_at",
        )
        .eq("merchant_id", user.id)
        .order("start_datetime", { ascending: true }),
      supabase
        .from("payment_connections")
        .select("provider, status, connection_mode, environment, connected_at")
        .eq("merchant_id", user.id),
    ]);

  const failed = [merchant, profile, theme, services, media, availability, faqs, bookings, connections]
    .map((result) => result.error)
    .find(Boolean);

  // Ekspor yang diam-diam bolong lebih buruk daripada gagal terang-terangan:
  // merchant akan mengira salinannya lengkap lalu menghapus akunnya.
  if (failed) {
    console.error("[ekspor] gagal memuat data merchant", { userId: user.id, error: failed });
    return NextResponse.json(
      { error: "Gagal menyiapkan ekspor. Coba lagi beberapa saat." },
      { status: 500 },
    );
  }

  const payload = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email, created_at: user.created_at },
    merchant: merchant.data,
    profile: profile.data,
    theme: theme.data,
    services: services.data,
    service_media: media.data,
    availability: availability.data,
    faqs: faqs.data,
    bookings: bookings.data,
    payment_connections: connections.data,
  };

  const date = payload.exported_at.slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="booka-data-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
