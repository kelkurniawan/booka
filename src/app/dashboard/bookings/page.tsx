import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, CalendarClock, Hourglass, Inbox, SearchX } from "lucide-react";

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(ROUTES.login);
  }

  const rawParams = await searchParams;

  // Status tak dikenal diperlakukan sebagai "semua status", bukan error.
  const statusParsed = bookingStatusFilterSchema.safeParse(rawParams.status);
  const statusFilter: BookingStatus | null = statusParsed.success ? statusParsed.data : null;

  // Pencarian yang gagal validasi (kepanjangan, atau mengandung karakter
  // yang berarti khusus di filter PostgREST) diperlakukan sebagai "tanpa
  // filter pencarian", bukan error -- konsisten dengan penanganan `status`
  // di atas. Nilai mentahnya (rawParams.q) tetap diteruskan ke
  // BookingsFilters supaya kotak pencariannya tetap menampilkan apa yang
  // diketik merchant.
  const rawQ = rawParams.q ?? "";
  const searchParsed = rawQ ? bookingSearchSchema.safeParse(rawQ) : null;
  const searchTerm = searchParsed?.success ? searchParsed.data : "";

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
  const [merchantResult, monthCountResult, revenueResult, pendingResult, bookingsResult] =
    await Promise.all([
      supabase.from("merchants").select("username").eq("id", user.id).maybeSingle(),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", user.id)
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

  const username = merchantResult.data?.username ?? "";
  const bookingsThisMonth = monthCountResult.count ?? 0;
  const confirmedRevenue = (revenueResult.data ?? []).reduce(
    (sum, row) => sum + row.service_price,
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
          hint="Semua pesanan yang masuk bulan ini, apa pun statusnya"
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

      {totalCount === 0 ? (
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
          <BookingsTable bookings={bookings} />

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
