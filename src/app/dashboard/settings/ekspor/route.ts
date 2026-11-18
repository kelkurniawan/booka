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
export const GET = () => handleExport();

/** Isi GET; klien disuntikkan supaya bisa diuji tanpa DB. */
export async function handleExport(createSupabase: () => Promise<Pick<Awaited<ReturnType<typeof createClient>>, "auth" | "from">> = createClient) {
  const supabase = await createSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  }

  const [merchant, profile, theme, services, media, availability, faqs, bookings, connections, settings, vouchers, banners, diningAreas, diningTables, adLinks, merchantLinks, tracking, courts, serviceCourts, courtPriceRules, courtMedia, venueAreas, venueMarkers] =
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
          "id, service_id, service_name, service_price, duration_minutes, start_datetime, end_datetime, customer_name, customer_whatsapp, status, payment_provider, payment_reference, paid_at, payment_mode, amount_due_now, amount_due_on_site, paid_on_site_at, paid_on_site_method, attended_at, no_show_at, cancelled_at, cancel_reason, expires_at, created_at, voucher_code, discount_amount, party_size, area_id, table_id, joined_table_id, table_label, customer_note, capacity_mode, court_id, court_name",
        )
        .eq("merchant_id", user.id)
        .order("start_datetime", { ascending: true }),
      supabase
        .from("payment_connections")
        .select("provider, status, connection_mode, environment, connected_at")
        .eq("merchant_id", user.id),
      supabase.from("merchant_settings").select("*").eq("merchant_id", user.id).maybeSingle(),
      supabase.from("vouchers").select("*").eq("merchant_id", user.id),
      supabase.from("merchant_banners").select("*").eq("merchant_id", user.id),
      supabase.from("dining_areas").select("*").eq("merchant_id", user.id),
      supabase.from("dining_tables").select("*").eq("merchant_id", user.id),
      supabase.from("ad_links").select("*").eq("merchant_id", user.id),
      supabase.from("merchant_links").select("*").eq("merchant_id", user.id),
      supabase.from("merchant_tracking").select("*").eq("merchant_id", user.id).maybeSingle(),
      supabase.from("courts").select("*").eq("merchant_id", user.id),
      supabase.from("service_courts").select("*").eq("merchant_id", user.id),
      supabase.from("court_price_rules").select("*").eq("merchant_id", user.id),
      supabase.from("court_media").select("*").eq("merchant_id", user.id),
      supabase.from("venue_areas").select("*").eq("merchant_id", user.id),
      supabase.from("venue_markers").select("*").eq("merchant_id", user.id),
    ]);

  const failed = [merchant, profile, theme, services, media, availability, faqs, bookings, connections, settings, vouchers, banners, diningAreas, diningTables, adLinks, merchantLinks, tracking, courts, serviceCourts, courtPriceRules, courtMedia, venueAreas, venueMarkers]
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
    settings: settings.data,
    vouchers: vouchers.data,
    banners: banners.data,
    dining_areas: diningAreas.data,
    dining_tables: diningTables.data,
    ad_links: adLinks.data,
    merchant_links: merchantLinks.data,
    merchant_tracking: tracking.data,
    courts: courts.data,
    service_courts: serviceCourts.data,
    court_price_rules: courtPriceRules.data,
    court_media: courtMedia.data,
    venue_areas: venueAreas.data,
    venue_markers: venueMarkers.data,
  };

  const date = payload.exported_at.slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="marky-data-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
