import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { mapPublicBookingError } from "@/lib/booking/errors";
import { extractClientIp, hashClientIp } from "@/lib/booking/rate-limit";
import { notifyBookingCreated } from "@/lib/notify/dispatch";
import { chargeBooking, chargeFailureMessage, findChargeProvider } from "@/lib/payments/charge-booking";
import { ROUTES } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createBookingRequestSchema } from "@/lib/validations/booking";

/**
 * POST /api/bookings
 *
 * Titik masuk SATU-SATUNYA untuk membuat booking (docs/DECISIONS.md bagian
 * 1) -- `anon` tidak punya hak apa pun ke tabel `bookings`. Urutannya:
 *
 *   1. Validasi body dengan Zod.
 *   2. Resolve merchant lewat `username` (BUKAN `merchantId` dari klien --
 *      halaman publik mengirimnya tapi tidak rahasia, jadi tidak berbahaya
 *      dipakai untuk apa pun; kita tetap resolve sendiri lewat username
 *      supaya satu-satunya sumber kebenaran identitas merchant konsisten
 *      dengan GET /api/slots) lalu layanan (difilter aktif + milik
 *      merchant itu).
 *   3. Cek rate limit lewat RPC `check_booking_rate_limit` (3 percobaan per
 *      ip+merchant per 15 menit) -- IP pemanggil di-hash dulu, tidak pernah
 *      dikirim/dicatat mentah. Lihat src/lib/booking/rate-limit.ts dan
 *      supabase/migrations/20260813120000_harden_booking_abuse.sql.
 *   4. Cari provider penagih (koneksi ACTIVE), lalu panggil RPC `create_booking` (SECURITY DEFINER) -- transaksi
 *      insert-nya sendiri yang membaca ulang harga dari `services` dan
 *      menjaga slot bentrok/kuota, lihat migration-nya.
 *   5. Hanya bila status PENDING: buat charge QRIS sebesar amount_due_now
 *      (chargeBooking). Kalau gagal, booking PENDING dibatalkan di sini juga.
 *      CONFIRMED/REQUESTED tidak ditagih; hanya notifikasi dikirim.
 *
 * Kode voucher (opsional) diteruskan ke create_booking, yang menilai ulang
 * kelayakannya di dalam transaksi; charge tetap sebesar amount_due_now.
 */
export async function POST(request: NextRequest) {
  // Batas ukuran body: payload sah di bawah 2 KB; Content-Length bisa dipalsukan
  // jadi panjang teks yang sudah terbaca diperiksa juga.
  const MAX_BODY_BYTES = 8 * 1024;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Body request terlalu besar" }, { status: 413 });
  }
  let rawBody: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Body request terlalu besar" }, { status: 413 });
    }
    rawBody = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Body request harus JSON valid" }, { status: 400 });
  }

  const parsed = createBookingRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Data booking tidak valid", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { username, serviceId, staffId, startUtc, customer_name, customer_whatsapp, voucherCode } =
    parsed.data;
  const { partySize, areaId, tableId, customerNote, sessionId, attribution } = parsed.data;

  // Service role -- anon tidak punya hak apa pun ke bookings/payment_connections.
  // Setiap query di bawah difilter merchant_id/username secara eksplisit
  // (AGENTS.md: createAdminClient() tidak punya jaring pengaman sendiri).
  const supabase = createAdminClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (merchantError) {
    console.error("[api/bookings] gagal memuat merchant", { username, error: merchantError });
    return NextResponse.json({ error: "Gagal memuat data merchant" }, { status: 500 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "Merchant tidak ditemukan" }, { status: 404 });
  }

  // Bukan jaring pengaman utama -- create_booking() membaca ulang baris yang
  // sama di dalam transaksinya sendiri (errcode P0005 kalau tidak ada/tidak
  // aktif, dipetakan mapBookingError di bawah). Pengecekan di sini cuma
  // supaya request yang jelas salah sejak awal berhenti dengan 404 yang
  // jelas sebelum sempat memanggil payment gateway.
  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id")
    .eq("id", serviceId)
    .eq("merchant_id", merchant.id)
    .eq("is_active", true)
    .maybeSingle();

  if (serviceError) {
    console.error("[api/bookings] gagal memuat layanan", { serviceId, error: serviceError });
    return NextResponse.json({ error: "Gagal memuat data layanan" }, { status: 500 });
  }
  if (!service) {
    return NextResponse.json(
      { error: "Layanan tidak ditemukan atau sudah tidak aktif" },
      { status: 404 },
    );
  }

  // Rate limit percobaan booking (3 per ip+merchant per 15 menit) -- lihat
  // check_booking_rate_limit di supabase/migrations/20260813120000_harden_
  // booking_abuse.sql. IP di-hash sebelum dikirim, TIDAK PERNAH mentah.
  //
  // Gagal MEMANGGIL rate limit (network/DB error) tidak memblokir booking --
  // mengikuti filosofi yang sama dengan p_ip_hash kosong di fungsi SQL-nya
  // ("membiarkan lewat lebih aman daripada memblokir semua orang"), cukup
  // dicatat di log supaya kalau ini sering terjadi tetap terlihat.
  const ipHash = hashClientIp(extractClientIp(request.headers));
  const { data: rateLimitAllowed, error: rateLimitError } = await supabase.rpc(
    "check_booking_rate_limit",
    { p_ip_hash: ipHash, p_merchant_id: merchant.id },
  );

  if (rateLimitError) {
    console.error("[api/bookings] gagal memeriksa rate limit, melanjutkan (fail-open)", {
      merchantId: merchant.id,
      error: rateLimitError,
    });
  } else if (!rateLimitAllowed) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan pemesanan. Coba lagi beberapa menit lagi." },
      { status: 429 },
    );
  }

  // Hanya memberi tahu create_booking apakah merchant bisa ditagih; mode
  // bayar efektif baru diketahui di dalam transaksinya, yang menolak (BK021)
  // booking yang harus dibayar online bila provider null.
  let provider;
  try {
    provider = await findChargeProvider(supabase, merchant.id);
  } catch (providerError) {
    console.error("[api/bookings] gagal memuat koneksi payment", {
      merchantId: merchant.id,
      error: providerError,
    });
    return NextResponse.json({ error: "Gagal memuat data pembayaran merchant" }, { status: 500 });
  }

  // Tautan iklan diurai di server, difilter merchant; tautan terarsip tetap mengatribusi.
  let adLinkId: string | null = null;
  if (attribution?.adLinkSlug) {
    const { data: adLink } = await supabase
      .from("ad_links")
      .select("id")
      .eq("merchant_id", merchant.id)
      .eq("slug", attribution.adLinkSlug)
      .maybeSingle();
    adLinkId = adLink?.id ?? null;
  }

  const { data: bookingRows, error: bookingError } = await supabase.rpc("create_booking", {
    p_merchant_id: merchant.id,
    p_service_id: serviceId,
    p_start_datetime: startUtc,
    p_customer_name: customer_name,
    p_customer_whatsapp: customer_whatsapp,
    p_staff_id: staffId,
    p_can_charge: provider !== null,
    p_voucher_code: voucherCode,
    p_party_size: partySize,
    p_area_id: areaId,
    p_table_id: tableId,
    p_customer_note: customerNote,
    p_session_id: sessionId,
    p_ad_link_id: adLinkId,
    p_utm_source: attribution?.utmSource ?? null,
    p_utm_medium: attribution?.utmMedium ?? null,
    p_utm_campaign: attribution?.utmCampaign ?? null,
    p_referrer_host: attribution?.referrerHost ?? null,
  });

  if (bookingError) {
    // Teks error Postgres mentah TIDAK PERNAH diteruskan ke klien -- lihat
    // komentar mapBookingError di src/lib/booking/errors.ts.
    const { mapped, code } = mapPublicBookingError(bookingError.code);
    if (mapped.status >= 500) {
      console.error("[api/bookings] create_booking gagal", {
        merchantId: merchant.id,
        serviceId,
        error: bookingError,
      });
    }
    return NextResponse.json({ error: mapped.message, code }, { status: mapped.status });
  }

  const booking = bookingRows?.[0];
  if (!booking) {
    console.error("[api/bookings] create_booking tidak mengembalikan baris", {
      merchantId: merchant.id,
      serviceId,
    });
    return NextResponse.json({ error: "Gagal membuat booking, silakan coba lagi." }, { status: 500 });
  }

  const bookingUrl = ROUTES.bookingStatus(booking.access_token);

  if (booking.status !== "PENDING") {
    // CONFIRMED (bayar di tempat) atau REQUESTED: tidak ada charge.
    after(() => notifyBookingCreated(booking.id));
    return NextResponse.json(
      { bookingId: booking.id, status: booking.status, bookingUrl, pixelEventId: booking.pixel_event_id, value: Number(booking.amount_due_now) },
      { status: 201 },
    );
  }

  const cancelPending = async () => {
    const { error: cancelError } = await supabase
      .from("bookings")
      .update({
        status: "CANCELLED",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "Gagal membuat kode pembayaran QRIS",
      })
      .eq("id", booking.id)
      .eq("merchant_id", merchant.id);

    if (cancelError) {
      // Dua kegagalan beruntun (charge + rollback): dicatat, bukan dilempar,
      // supaya pelanggan tetap menerima respons yang jelas di bawah.
      console.error("[api/bookings] gagal membatalkan booking setelah charge gagal", {
        bookingId: booking.id,
        error: cancelError,
      });
    }
  };

  if (!provider) {
    await cancelPending();
    return NextResponse.json({ error: "Merchant belum mengaktifkan pembayaran" }, { status: 409 });
  }

  // PENDING hanya mungkin dengan provider (BK021 menolak sisanya), kecuali
  // harga 0 tanpa koneksi: tidak bisa ditagih, jangan biarkan menahan slot.
  // Dari titik ini booking PENDING sudah tersimpan (expires_at = +15 menit).
  // Kalau charge QRIS gagal dengan cara apa pun, booking ini WAJIB
  // dibatalkan di blok catch -- booking yang tidak bisa dibayar tidak boleh
  // dibiarkan menghabiskan kuota merchant atau mengunci slot kalendernya
  // (bookings_no_overlap hanya membebaskan slot untuk status CANCELLED).
  try {
    const charge = await chargeBooking(supabase, {
      bookingId: booking.id,
      merchantId: merchant.id,
      // numeric(12,2): Number() berjaga-jaga kalau postgrest-js mengembalikan string.
      amount: Math.round(Number(booking.amount_due_now)),
      provider,
    });

    return NextResponse.json(
      {
        bookingId: booking.id,
        status: booking.status,
        payment_url: charge.qrString,
        expires_at: booking.expires_at,
        // Token mentahnya TIDAK dikirim, hanya path yang menyematkannya.
        bookingUrl,
        pixelEventId: booking.pixel_event_id,
        value: Number(booking.amount_due_now),
      },
      { status: 201 },
    );
  } catch (chargeError) {
    console.error("[api/bookings] gagal membuat charge QRIS, membatalkan booking", {
      bookingId: booking.id,
      merchantId: merchant.id,
      provider,
      error: chargeError,
    });

    await cancelPending();

    return NextResponse.json({ error: chargeFailureMessage(chargeError) }, { status: 502 });
  }
}

