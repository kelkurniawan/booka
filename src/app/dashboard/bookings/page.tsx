import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Banknote, CalendarClock, Hourglass, Inbox, SearchX } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireMerchant } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { bookingSearchSchema, bookingStatusFilterSchema } from "@/lib/validations/booking";
import type { BookingStatus } from "@/types/database";

import { BOOKING_LIST_COLUMNS, type BookingListItem } from "./booking-state";
import { BookingsFilters } from "./bookings-filters";
import { BookingsTable } from "./bookings-table";

export const metadata: Metadata = { title: "Booking masuk" };

const PAGE_SIZE = 20;

/**
 * Batas awal bulan berjalan di Asia/Jakarta (UTC+7, tanpa DST), dikembalikan
 * sebagai ISO string UTC untuk dipakai `.gte()`. Sengaja dihitung dengan
 * cara yang sama seperti `count_bookings_this_month` di
 * supabase/migrations/20260730000200_enforce_booking_quota.sql
 * (`date_trunc('month', now() at time zone 'Asia/Jakarta')`), supaya
 * "bulan ini" di kartu ringkasan halaman ini konsisten dengan kuota
 * transaksi yang ditampilkan di Ringkasan.
 */
function startOfMonthJakartaIso(now: Date): string {
  const jakartaNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const year = jakartaNow.getUTCFullYear();
  const month = jakartaNow.getUTCMonth();
  const startOfMonthUtcMillis = Date.UTC(year, month, 1, 0, 0, 0) - 7 * 60 * 60 * 1000;
  return new Date(startOfMonthUtcMillis).toISOString();
}

/** Bangun query string ledger dari nilai yang SUDAH divalidasi -- dipakai
 * tautan Sebelumnya/Berikutnya dan link "reset filter". */
function buildBookingsHref(params: { status: string; q: string; page: number }): string {
  const usp = new URLSearchParams();
  if (params.status) usp.set("status", params.status);
  if (params.q) usp.set("q", params.q);
  if (params.page > 1) usp.set("page", String(params.page));
  const qs = usp.toString();
  return qs ? `${ROUTES.bookings}?${qs}` : ROUTES.bookings;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  // requireMerchant() dibungkus cache() -- dashboard/layout.tsx sudah
  // memanggilnya di render pass yang sama, jadi baris ini TIDAK menambah
  // round-trip auth atau query merchants baru, cuma mengambil hasil yang
  // sudah ada (termasuk username, dipakai di bawah untuk link halaman
  // booking publik).
  const { user, merchant } = await requireMerchant();
  const supabase = await createClient();

  const rawParams = await searchParams;

  // Status tak dikenal diperlakukan sebagai "semua status", bukan error.
  const statusParsed = bookingStatusFilterSchema.safeParse(rawParams.status);
  const statusFilter: BookingStatus | null = statusParsed.success ? statusParsed.data : null;

  // Pencarian yang gagal validasi (kepanjangan, atau mengandung karakter
  // yang berarti khusus di filter PostgREST) diperlakukan sebagai "tanpa
  // filter pencarian" UNTUK QUERY-nya (bukan error yang menghentikan
  // halaman) -- konsisten dengan penanganan `status` di atas. Nilai
  // mentahnya (rawParams.q) tetap diteruskan ke BookingsFilters supaya
  // kotak pencariannya tetap menampilkan apa yang diketik merchant. Tapi
  // beda dari status: kegagalan ini TETAP diberi tahu ke merchant lewat
  // `searchError` di bawah (dirender di atas tabel) -- soalnya trigger-nya
  // bukan cuma percobaan iseng, melainkan hal wajar seperti nama pelanggan
  // yang mengandung tanda titik ("Ayu S. Lestari"). Tanpa notice ini,
  // tabelnya diam-diam menampilkan daftar TIDAK terfilter padahal kotak
  // pencarian masih menunjukkan kata kunci yang diketik -- terlihat seperti
  // pencarian jalan padahal tidak.
  const rawQ = rawParams.q ?? "";
  const searchParsed = rawQ ? bookingSearchSchema.safeParse(rawQ) : null;
  const searchTerm = searchParsed?.success ? searchParsed.data : "";
  const searchError =
    searchParsed && !searchParsed.success
      ? (searchParsed.error.issues[0]?.message ?? "Pencarian tidak valid.")
      : null;

  const pageParam = Number(rawParams.page);
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const now = new Date();
  const monthStartIso = startOfMonthJakartaIso(now);

  let bookingsQuery = supabase
    .from("bookings")
    .select(BOOKING_LIST_COLUMNS, { count: "exact" })
    .eq("merchant_id", user.id);

  if (statusFilter) {
    bookingsQuery = bookingsQuery.eq("status", statusFilter);
  }
  if (searchTerm) {
    // searchTerm sudah lolos bookingSearchSchema, yang menolak `, . ( ) % \`
    // -- karakter yang punya arti khusus di sintaks filter PostgREST --
    // jadi nilai ini tidak bisa dipakai menyuntik kondisi `.or()` tambahan.
    const pattern = `%${searchTerm}%`;
    bookingsQuery = bookingsQuery.or(
      `customer_name.ilike.${pattern},customer_whatsapp.ilike.${pattern}`,
    );
  }
  bookingsQuery = bookingsQuery.order("start_datetime", { ascending: false }).range(from, to);

  // Kartu ringkasan WAJIB dihitung dari seluruh data merchant, bukan dari
  // halaman yang sedang ditampilkan -- karena itu semuanya query terpisah
  // tanpa .range(), dijalankan paralel dengan query tabel yang dipaginasi.
  //
  // "Booking bulan ini" (monthPaidResult + monthPendingResult) SENGAJA
  // dipecah jadi dua query dan disatukan manual, bukan satu query yang
  // menghitung semua status -- harus persis meniru definisi
  // count_bookings_this_month (supabase/migrations/20260813051417_reap_expired_pending_inline.sql),
  // yaitu PAID apa pun, ATAU PENDING yang BELUM kedaluwarsa. Kalau kartu ini
  // menghitung status lain (termasuk CANCELLED/PENDING kedaluwarsa), angkanya
  // tidak akan pernah cocok dengan kuota "X / Y transaksi" yang ditampilkan
  // di Ringkasan untuk bulan yang sama -- merchant akan mengira salah satu
  // angkanya salah, padahal cuma beda definisi.
  const [
    monthPaidResult,
    monthPendingResult,
    revenueResult,
    pendingResult,
    bookingsResult,
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", user.id)
      .eq("status", "PAID")
      .gte("created_at", monthStartIso),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", user.id)
      .eq("status", "PENDING")
      .gt("expires_at", now.toISOString())
      .gte("created_at", monthStartIso),
    supabase
      .from("bookings")
      .select("service_price")
      .eq("merchant_id", user.id)
      .eq("status", "PAID")
      .gte("paid_at", monthStartIso),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", user.id)
      .eq("status", "PENDING")
      .gt("expires_at", now.toISOString()),
    bookingsQuery,
  ]);

  // Kartu ringkasan boleh tetap degradasi ke 0 kalau query-nya gagal (angka
  // 0 di samping tabel yang tetap berfungsi cuma terlihat aneh, tidak
  // menyesatkan seperti kasus bookingsResult di bawah) -- tapi errornya
  // tetap WAJIB dicatat, bukan ditelan diam-diam.
  if (monthPaidResult.error) {
    console.error("[dashboard/bookings] gagal menghitung booking PAID bulan ini", {
      merchantId: user.id,
      error: monthPaidResult.error,
    });
  }
  if (monthPendingResult.error) {
    console.error("[dashboard/bookings] gagal menghitung booking PENDING bulan ini", {
      merchantId: user.id,
      error: monthPendingResult.error,
    });
  }
  if (revenueResult.error) {
    console.error("[dashboard/bookings] gagal menghitung pendapatan terkonfirmasi", {
      merchantId: user.id,
      error: revenueResult.error,
    });
  }
  if (pendingResult.error) {
    console.error("[dashboard/bookings] gagal menghitung booking menunggu pembayaran", {
      merchantId: user.id,
      error: pendingResult.error,
    });
  }
  // bookingsResult -- BEDA dari empat query di atas: ini sumber tabel
  // (bukan kartu ringkasan), jadi errornya tidak boleh diam-diam
  // terdegradasi jadi "[]" -- lihat cabang render "gagal memuat" di bawah,
  // yang sengaja dibedakan dari cabang "belum ada booking".
  if (bookingsResult.error) {
    console.error("[dashboard/bookings] gagal memuat daftar booking", {
      merchantId: user.id,
      error: bookingsResult.error,
    });
  }

  // requireMerchant() sudah menjamin username terisi (kalau tidak, sudah
  // di-redirect ke /onboarding sebelum sampai di sini) -- lihat komentar di
  // pemanggilannya di atas.
  const username = merchant.username;
  const bookingsThisMonth = (monthPaidResult.count ?? 0) + (monthPendingResult.count ?? 0);
  const confirmedRevenue = (revenueResult.data ?? []).reduce(
    // service_price adalah numeric(12,2) di Postgres -- Number() berjaga-jaga
    // kalau suatu saat postgrest-js mengembalikannya sebagai string (sama
    // seperti komentar di src/app/api/bookings/route.ts), supaya reduce ini
    // tidak diam-diam menyambung string ("Rp NaN" di kartu) alih-alih
    // menjumlahkan angka.
    (sum, row) => sum + Number(row.service_price),
    0,
  );
  const pendingCount = pendingResult.count ?? 0;

  const bookings = (bookingsResult.data ?? []) as BookingListItem[];
  const totalCount = bookingsResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  // totalCount di atas sudah mencerminkan filter yang aktif (query yang
  // sama menghitung total tanpa .range()) -- jadi kalau TIDAK ada filter
  // aktif dan totalCount tetap 0, itu memang berarti merchant belum punya
  // booking sama sekali. Tidak perlu query "hasAnyBookings" terpisah.
  //
  // Kecuali bookingsResult.error: totalCount juga jatuh ke 0 kalau query-nya
  // gagal (bukan cuma kalau memang kosong) -- cabang render di bawah
  // memeriksa bookingsResult.error LEBIH DULU supaya "gagal memuat" tidak
  // pernah disalahartikan sebagai "belum ada booking".
  const hasFilters = statusFilter !== null || searchTerm !== "";

  // Halaman diminta di luar jangkauan (mis. merchant mengetik ?page=99
  // langsung, atau filter diubah sampai halaman lama jadi kosong) --
  // arahkan ke halaman valid terakhir alih-alih menampilkan tabel kosong
  // yang menyesatkan padahal datanya ada di halaman lain.
  if (page > totalPages && totalCount > 0) {
    redirect(
      buildBookingsHref({ status: statusFilter ?? "", q: searchTerm, page: totalPages }),
    );
  }

  return (
    <>
      <PageHeader
        title="Booking masuk"
        description="Semua pesanan yang masuk lewat halaman booking Anda."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={<CalendarClock className="size-4" />}
          label="Booking bulan ini"
          value={`${bookingsThisMonth}`}
          // Definisi ini SENGAJA sama persis dengan count_bookings_this_month
          // (dipakai kuota "X / Y transaksi" di Ringkasan) -- PAID, atau
          // PENDING yang belum kedaluwarsa. Bukan "semua status": CANCELLED
          // dan PENDING kedaluwarsa TIDAK dihitung, supaya angka di kartu ini
          // tidak pernah tampak berbeda dari kuota di halaman Ringkasan untuk
          // bulan yang sama.
          hint="Booking yang terhitung kuota bulan ini (dibayar atau menunggu pembayaran)"
        />
        <SummaryCard
          icon={<Banknote className="size-4" />}
          label="Pendapatan terkonfirmasi bulan ini"
          value={formatRupiah(confirmedRevenue)}
          hint="Total DP yang sudah dibayar bulan ini"
        />
        <SummaryCard
          icon={<Hourglass className="size-4" />}
          label="Menunggu pembayaran"
          value={`${pendingCount}`}
          hint="Booking PENDING yang belum kedaluwarsa"
        />
      </div>

      {/* key={q}: lihat catatan di bookings-filters.tsx -- ini yang membuat
          state input lokalnya ikut ter-reset saat q di URL berubah dari
          luar komponen, tanpa perlu useEffect yang men-setState prop ke
          state (dilarang aturan react-hooks/set-state-in-effect). */}
      <BookingsFilters key={rawParams.q ?? ""} status={rawParams.status ?? ""} q={rawParams.q ?? ""} />

      {searchError ? (
        <p className="text-destructive text-sm" role="alert">
          {searchError}
        </p>
      ) : null}

      {bookingsResult.error ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertTriangle />
            </EmptyMedia>
            <EmptyTitle>Gagal memuat daftar booking</EmptyTitle>
            <EmptyDescription>Muat ulang halaman ini untuk mencoba lagi.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link href={ROUTES.bookings}>Muat ulang halaman</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : totalCount === 0 ? (
        hasFilters ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX />
              </EmptyMedia>
              <EmptyTitle>Tidak ada hasil untuk filter ini</EmptyTitle>
              <EmptyDescription>
                Coba ubah kata kunci pencarian atau status filter.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild variant="outline">
                <Link href={ROUTES.bookings}>Reset filter</Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox />
              </EmptyMedia>
              <EmptyTitle>Belum ada booking</EmptyTitle>
              <EmptyDescription>
                Bagikan tautan halaman booking Anda supaya pelanggan bisa mulai memesan.
              </EmptyDescription>
            </EmptyHeader>
            {username ? (
              <EmptyContent>
                <Button asChild>
                  <a href={ROUTES.merchantPage(username)} target="_blank" rel="noreferrer">
                    Buka halaman booking Anda
                  </a>
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        )
      ) : (
        <>
          <BookingsTable bookings={bookings} nowMs={now.getTime()} />

          {totalPages > 1 ? (
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                Halaman {page} dari {totalPages}
              </p>
              <div className="flex gap-2">
                {/* Button asChild dengan `disabled` tidak benar-benar mencegah
                    navigasi (Slot cuma menaruh atribut "disabled" ke <a>,
                    yang tidak dikenal HTML) -- jadi saat tidak ada halaman
                    sebelumnya/berikutnya, render Button biasa (bukan Link)
                    yang disabled sungguhan, bukan Button asChild yang
                    disable-nya cuma kosmetik. */}
                {page > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={buildBookingsHref({
                        status: statusFilter ?? "",
                        q: searchTerm,
                        page: page - 1,
                      })}
                    >
                      Sebelumnya
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Sebelumnya
                  </Button>
                )}
                {page < totalPages ? (
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={buildBookingsHref({
                        status: statusFilter ?? "",
                        q: searchTerm,
                        page: page + 1,
                      })}
                    >
                      Berikutnya
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Berikutnya
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          {icon}
          {label}
        </CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </CardContent>
    </Card>
  );
}
