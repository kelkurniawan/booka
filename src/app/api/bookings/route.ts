import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { mapBookingError } from "@/lib/booking/errors";
import { extractClientIp, hashClientIp } from "@/lib/booking/rate-limit";
import { getAdapter } from "@/lib/payments";
import { loadMerchantCredential } from "@/lib/payments/credentials";
import { selectActiveConnection } from "@/lib/payments/select-connection";
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
 *   4. Pastikan merchant sudah punya koneksi payment ACTIVE -- booking yang
 *      tidak bisa dibayar tidak boleh pernah tersimpan.
 *   5. Panggil RPC `create_booking` (SECURITY DEFINER) -- transaksi
 *      insert-nya sendiri yang membaca ulang harga dari `services` dan
 *      menjaga slot bentrok/kuota, lihat migration-nya.
 *   6. Buat charge QRIS lewat adapter provider merchant, simpan
 *      payment_url/payment_reference/payment_provider ke baris booking.
 *      Kalau langkah ini gagal, booking yang SUDAH tersimpan (PENDING)
 *      dibatalkan di sini juga -- lihat komentar di catch block.
 */
export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
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

  const { username, serviceId, startUtc, customer_name, customer_whatsapp } = parsed.data;

  // Service role -- anon tidak punya hak apa pun ke bookings/payment_connections.
  // Setiap query di bawah difilter merchant_id/username secara eksplisit
  // (AGENTS.md: createAdminClient() tidak punya jaring pengaman sendiri).
  const supabase = createAdminClient();

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id, active_payment_provider")
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

  // Booking yang tidak bisa dibayar tidak boleh pernah tersimpan -- cek
  // koneksi payment SEBELUM memanggil create_booking, bukan sesudahnya.
  // Merchant bisa saja punya koneksi ACTIVE untuk kedua provider sekaligus.
  // Kalau merchant sudah pernah memilih satu provider eksplisit lewat
  // halaman Pembayaran (`merchants.active_payment_provider`, di-set di
  // src/app/dashboard/payments/actions.ts) DAN koneksi itu masih ACTIVE,
  // itu yang dipakai. Kalau belum pernah (merchant lama) atau koneksi
  // pilihannya sudah dicabut/kedaluwarsa, jatuh balik ke koneksi ACTIVE yang
  // paling lama tersambung supaya hasilnya tetap deterministik, bukan
  // sekadar baris pertama yang kebetulan dikembalikan Postgres. Aturan
  // pemilihannya sendiri ada di src/lib/payments/select-connection.ts,
  // supaya endpoint ini dan halaman Pembayaran (badge "Dipakai untuk booking
  // baru") tidak bisa diam-diam tidak sinkron.
  const { data: activeConnections, error: connectionError } = await supabase
    .from("payment_connections")
    .select("provider")
    .eq("merchant_id", merchant.id)
    .eq("status", "ACTIVE")
    .order("connected_at", { ascending: true });

  if (connectionError) {
    console.error("[api/bookings] gagal memuat koneksi payment", {
      merchantId: merchant.id,
      error: connectionError,
    });
    return NextResponse.json({ error: "Gagal memuat data pembayaran merchant" }, { status: 500 });
  }

  const connection = selectActiveConnection(
    activeConnections ?? [],
    merchant.active_payment_provider,
  );
  if (!connection) {
    return NextResponse.json({ error: "Merchant belum mengaktifkan pembayaran" }, { status: 409 });
  }

  const { data: bookingRows, error: bookingError } = await supabase.rpc("create_booking", {
    p_merchant_id: merchant.id,
    p_service_id: serviceId,
    p_start_datetime: startUtc,
    p_customer_name: customer_name,
    p_customer_whatsapp: customer_whatsapp,
  });

  if (bookingError) {
    // Teks error Postgres mentah TIDAK PERNAH diteruskan ke klien -- lihat
    // komentar mapBookingError di src/lib/booking/errors.ts.
    const mapped = mapBookingError(bookingError.code);
    if (mapped.status >= 500) {
      console.error("[api/bookings] create_booking gagal", {
        merchantId: merchant.id,
        serviceId,
        error: bookingError,
      });
    }
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }

  const booking = bookingRows?.[0];
  if (!booking) {
    console.error("[api/bookings] create_booking tidak mengembalikan baris", {
      merchantId: merchant.id,
      serviceId,
    });
    return NextResponse.json({ error: "Gagal membuat booking, silakan coba lagi." }, { status: 500 });
  }

  // Dari titik ini booking PENDING sudah tersimpan (expires_at = +15 menit).
  // Kalau charge QRIS gagal dengan cara apa pun, booking ini WAJIB
  // dibatalkan di blok catch -- booking yang tidak bisa dibayar tidak boleh
  // dibiarkan menghabiskan kuota merchant atau mengunci slot kalendernya
  // (bookings_no_overlap hanya membebaskan slot untuk status CANCELLED).
  try {
    const credential = await loadMerchantCredential(merchant.id, connection.provider);
    if (!credential) {
      // Race langka: koneksi dicabut tepat di antara pengecekan di atas dan
      // baris ini. Diperlakukan sama seperti kegagalan charge di bawah.
      throw new Error("Kredensial payment gateway tidak ditemukan");
    }

    const adapter = getAdapter(connection.provider);
    const charge = await adapter.createQrisCharge({
      orderId: booking.id,
      // service_price adalah numeric(12,2) di Postgres -- Number() berjaga-
      // jaga kalau suatu saat postgrest-js mengembalikannya sebagai string.
      amount: Math.round(Number(booking.service_price)),
      environment: credential.environment,
      credential: credential.credential,
    });

    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        payment_provider: connection.provider,
        payment_url: charge.qrString,
        payment_reference: charge.orderId,
      })
      .eq("id", booking.id)
      .eq("merchant_id", merchant.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json(
      { bookingId: booking.id, payment_url: charge.qrString, expires_at: booking.expires_at },
      { status: 201 },
    );
  } catch (chargeError) {
    console.error("[api/bookings] gagal membuat charge QRIS, membatalkan booking", {
      bookingId: booking.id,
      merchantId: merchant.id,
      provider: connection.provider,
      error: chargeError,
    });

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
      // Dua kegagalan beruntun (charge + rollback): dicatat, bukan
      // dilempar -- pelanggan tetap harus menerima respons 502 di bawah,
      // bukan 500 generik yang menyembunyikan pesan yang lebih jelas.
      console.error("[api/bookings] gagal membatalkan booking setelah charge gagal", {
        bookingId: booking.id,
        error: cancelError,
      });
    }

    return NextResponse.json(
      { error: "Gagal membuat kode pembayaran, silakan coba lagi." },
      { status: 502 },
    );
  }
}
