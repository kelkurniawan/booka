import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTheme } from "@/lib/theme/resolve";
import type { MerchantTheme, SubscriptionTier } from "@/types/database";

import { BookingStatusView, type BookingPageRow } from "./booking-status-view";

/**
 * I3 -- halaman ini TIDAK PERNAH boleh disajikan dari full route cache
 * Next.js. Uangnya sudah berpindah (DP masuk ke akun payment gateway
 * merchant) begitu status booking jadi PAID -- kalau halaman ini kebetulan
 * ter-cache dari render sebelum pembayaran masuk, pelanggan yang membuka
 * tautannya lagi setelah membayar bisa melihat versi basi yang masih bilang
 * "menunggu pembayaran" (atau lebih parah: kode QR yang mengundang
 * dipindai lagi, lihat I4), dan itu bisa bertahan sampai revalidasi
 * berikutnya alih-alih ikut router.refresh() pelanggan itu sendiri.
 */
export const dynamic = "force-dynamic";

type BookingPageParams = { token: string };

/**
 * Kolom `bookings` yang boleh terbaca sampai ke halaman ini -- EKSPLISIT,
 * bukan `select("*")` (AGENTS.md). `access_token` SENGAJA TIDAK ada di
 * daftar ini: itu rahasia yang cuma boleh dipakai sebagai filter `WHERE`,
 * tidak pernah ikut terbaca ke dalam baris hasil query yang sebagian
 * propnya nanti diteruskan ke komponen client di bawah.
 */
const BOOKING_COLUMNS =
  "id, merchant_id, service_name, service_price, start_datetime, end_datetime, customer_name, status, payment_url, paid_at, cancelled_at, cancel_reason, expires_at, payment_mode, amount_due_now, amount_due_on_site, paid_on_site_at" as const;

type MerchantInfo = {
  username: string | null;
  full_name: string | null;
  subscription_tier: SubscriptionTier;
  merchant_themes?: MerchantTheme | MerchantTheme[] | null;
};

/**
 * `createAdminClient()` (service role, melewati RLS) -- halaman ini dibuka
 * TANPA sesi (pelanggan tidak login), dan satu-satunya yang mengunci baris
 * adalah `access_token` di URL itu sendiri (kolomnya unik). Merchant diambil
 * lewat query TERPISAH difilter `merchant_id` dari baris booking (bukan
 * join implisit) -- lihat AGENTS.md soal setiap query admin client wajib
 * memfilter merchant_id secara eksplisit.
 *
 * Dibungkus `cache()` supaya `generateMetadata` dan komponen halaman yang
 * sama-sama memanggil ini dalam satu request tidak menembak database dua
 * kali (pola sama seperti `getMerchantPageData` di src/app/[username]/page.tsx).
 */
const getBookingPageData = cache(async (token: string) => {
  const admin = createAdminClient();

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("access_token", token)
    .maybeSingle<BookingPageRow>();

  // Query gagal (bukan "token salah") HARUS beda dari "booking ini memang
  // tidak ada" -- kalau ditelan jadi notFound(), pelanggan yang tautannya
  // sebenarnya valid mengira booking-nya hilang padahal sistemnya yang
  // sedang gangguan. Dilempar supaya ditangani error boundary terdekat --
  // alasan yang sama dengan src/app/[username]/page.tsx.
  if (bookingError) {
    console.error("[pesanan-page] gagal memuat booking", { error: bookingError });
    throw new Error("Gagal memuat data booking.");
  }
  if (!booking) {
    return null;
  }

  const { data: merchant, error: merchantError } = await admin
    .from("merchants")
    .select("username, full_name, subscription_tier, merchant_themes(*)")
    .eq("id", booking.merchant_id)
    .maybeSingle<MerchantInfo>();

  if (merchantError) {
    console.error("[pesanan-page] gagal memuat merchant", {
      merchantId: booking.merchant_id,
      error: merchantError,
    });
    throw new Error("Gagal memuat data merchant.");
  }
  if (!merchant) {
    // bookings.merchant_id merujuk ke merchants.id (not null) -- baris ini
    // seharusnya mustahil tidak ada. Tetap dianggap error (bukan
    // notFound()) kalau suatu saat terjadi: ini kerusakan data, bukan
    // "pelanggan salah ketik token".
    console.error("[pesanan-page] merchant booking tidak ditemukan", {
      merchantId: booking.merchant_id,
    });
    throw new Error("Data merchant untuk booking ini tidak ditemukan.");
  }

  // Dihitung di sini (fungsi pengambil data biasa), BUKAN di body komponen
  // halaman -- react-hooks/purity melarang memanggil Date.now() langsung
  // saat render. PENDING yang tenggatnya sudah lewat diperlakukan sama
  // seperti CANCELLED: cron pembatalan mungkin belum sempat jalan, tapi
  // pelanggan yang membuka tautan ini setelah waktunya habis tidak boleh
  // terus melihat "menunggu pembayaran".
  const isExpiredPending =
    (booking.status === "PENDING" || booking.status === "REQUESTED") && Date.now() >= new Date(booking.expires_at).getTime();

  // merchant_themes bisa objek (relasi 1-1) atau array satu elemen; sama
  // seperti src/app/[username]/page.tsx.
  const themeRaw = merchant.merchant_themes;
  const themeRow = Array.isArray(themeRaw) ? (themeRaw[0] ?? null) : (themeRaw ?? null);
  const theme = resolveTheme(merchant.subscription_tier, themeRow);

  return { booking, merchant, theme, isExpiredPending };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<BookingPageParams>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await getBookingPageData(token);

  if (!data) {
    return { robots: { index: false, follow: false } };
  }

  // Judul netral -- SENGAJA tidak menyebut nama pelanggan/merchant. Halaman
  // ini berisi PII, jadi tidak boleh masuk indeks mesin pencari maupun
  // bocor lewat judul tab/riwayat browser yang bisa dilihat orang lain.
  return {
    title: "Status booking",
    robots: { index: false, follow: false },
  };
}

export default async function BookingStatusPage({
  params,
}: {
  params: Promise<BookingPageParams>;
}) {
  const { token } = await params;
  const data = await getBookingPageData(token);

  if (!data) {
    notFound();
  }

  const { booking, merchant, theme, isExpiredPending } = data;

  return (
    <BookingStatusView
      token={token}
      booking={booking}
      merchantName={merchant.full_name ?? merchant.username ?? "Merchant"}
      merchantUsername={merchant.username}
      theme={theme}
      isExpiredPending={isExpiredPending}
    />
  );
}
