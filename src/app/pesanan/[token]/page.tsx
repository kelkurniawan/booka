import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { QrisCode } from "@/components/qris-code";
import { formatDateTime, formatRupiah, formatTime } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";

import { BookingLiveStatus } from "./booking-live-status";

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
  "id, merchant_id, service_name, service_price, start_datetime, customer_name, status, payment_url, paid_at, cancelled_at, cancel_reason, expires_at" as const;

type BookingPageRow = {
  id: string;
  merchant_id: string;
  service_name: string;
  service_price: number;
  start_datetime: string;
  customer_name: string;
  status: "PENDING" | "PAID" | "CANCELLED";
  payment_url: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  expires_at: string;
};

type MerchantInfo = { username: string | null; full_name: string | null };

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
    .select("username, full_name")
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
    booking.status === "PENDING" && Date.now() >= new Date(booking.expires_at).getTime();

  return { booking, merchant, isExpiredPending };
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

  const { booking, merchant, isExpiredPending } = data;
  const merchantName = merchant.full_name ?? merchant.username ?? "Merchant";

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-8 px-4 py-10">
      <header className="flex flex-col items-center gap-1 text-center">
        <span className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.18em] uppercase">
          Booka
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-balance">{merchantName}</h1>
      </header>

      {booking.status === "PAID" ? (
        <PaidReceipt booking={booking} merchant={merchant} />
      ) : booking.status === "CANCELLED" || isExpiredPending ? (
        <ExpiredOrCancelled booking={booking} merchant={merchant} />
      ) : (
        <PendingPayment booking={booking} merchantName={merchantName} />
      )}
    </div>
  );
}

function PaidReceipt({ booking, merchant }: { booking: BookingPageRow; merchant: MerchantInfo }) {
  const merchantName = merchant.full_name ?? merchant.username ?? "Merchant";

  return (
    <div className="border-border flex flex-col items-center gap-4 border p-6 text-center">
      <CheckCircle2 className="size-10" aria-hidden />
      <div className="flex flex-col gap-1">
        <span className="font-medium">Pembayaran berhasil</span>
        <p className="text-muted-foreground text-sm text-pretty">
          Booking kamu di {merchantName} sudah dikonfirmasi. Simpan halaman ini sebagai bukti.
        </p>
      </div>

      <dl className="border-border flex w-full flex-col gap-3 border-t pt-4 text-left text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">Layanan</dt>
          <dd className="text-right font-medium text-balance">{booking.service_name}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">Jadwal</dt>
          <dd className="text-right font-medium text-balance">
            {formatDateTime(booking.start_datetime)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">Nominal DP</dt>
          <dd className="font-medium">{formatRupiah(Number(booking.service_price))}</dd>
        </div>
        {booking.paid_at ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground shrink-0">Dibayar</dt>
            <dd className="text-right font-medium text-balance">
              {formatDateTime(booking.paid_at)}
            </dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">Merchant</dt>
          <dd className="text-right font-medium text-balance">{merchantName}</dd>
        </div>
      </dl>

      {merchant.username ? (
        <Link
          href={ROUTES.merchantPage(merchant.username)}
          className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
        >
          Kembali ke halaman {merchantName}
        </Link>
      ) : null}
    </div>
  );
}

function ExpiredOrCancelled({
  booking,
  merchant,
}: {
  booking: BookingPageRow;
  merchant: MerchantInfo;
}) {
  const merchantName = merchant.full_name ?? merchant.username ?? "Merchant";

  return (
    <div className="border-border flex flex-col items-center gap-3 border p-6 text-center">
      <XCircle className="text-destructive size-10" aria-hidden />
      <div className="flex flex-col gap-1">
        <span className="font-medium">
          {booking.status === "CANCELLED" ? "Booking dibatalkan" : "Waktu pembayaran habis"}
        </span>
        <p className="text-muted-foreground text-sm text-pretty">
          Slot ini sudah dilepas kembali.
          {booking.cancel_reason ? ` ${booking.cancel_reason}.` : ""} Silakan pesan ulang untuk
          memilih jadwal baru.
        </p>
      </div>

      {merchant.username ? (
        <Button asChild variant="outline">
          <Link href={ROUTES.merchantPage(merchant.username)}>Pesan ulang di {merchantName}</Link>
        </Button>
      ) : null}
    </div>
  );
}

function PendingPayment({
  booking,
  merchantName,
}: {
  booking: BookingPageRow;
  merchantName: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Blok QR + nominal + instruksi diteruskan sebagai children ke
          BookingLiveStatus (BUKAN dirender langsung di sini) -- I4:
          begitu polling klien mengonfirmasi status terminal (PAID/
          CANCELLED), BookingLiveStatus berhenti menampilkan children ini
          sama sekali, supaya kode QR yang sudah lunas tidak terus terlihat
          mengundang dipindai lagi selama round-trip router.refresh(). */}
      <BookingLiveStatus bookingId={booking.id} expiresAt={booking.expires_at}>
        <div className="flex flex-col items-center gap-3">
          <span className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.18em] uppercase">
            Menunggu pembayaran
          </span>

          {booking.payment_url ? (
            <QrisCode payload={booking.payment_url} />
          ) : (
            <div className="border-border flex w-full max-w-[320px] flex-col gap-2 border border-dashed p-6 text-center">
              <p className="text-sm text-pretty">
                Kode pembayaran belum tersedia. Coba muat ulang halaman ini.
              </p>
            </div>
          )}

          <span className="text-2xl font-semibold">
            {formatRupiah(Number(booking.service_price))}
          </span>
          <p className="text-muted-foreground text-center text-xs text-pretty">
            Buka aplikasi e-wallet atau m-banking, pilih menu &ldquo;Bayar&rdquo; atau
            &ldquo;Scan QRIS&rdquo;, lalu pindai kode di atas sebelum{" "}
            {formatTime(booking.expires_at)} WIB.
          </p>
        </div>
      </BookingLiveStatus>

      <dl className="border-border flex flex-col gap-3 border-t pt-4 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">Layanan</dt>
          <dd className="text-right font-medium text-balance">{booking.service_name}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">Jadwal</dt>
          <dd className="text-right font-medium text-balance">
            {formatDateTime(booking.start_datetime)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">Nama</dt>
          <dd className="text-right font-medium text-balance">{booking.customer_name}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">Merchant</dt>
          <dd className="text-right font-medium text-balance">{merchantName}</dd>
        </div>
      </dl>
    </div>
  );
}
