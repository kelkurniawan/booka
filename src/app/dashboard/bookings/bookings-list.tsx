import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Inbox, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireMerchant } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import type { BookingStatus } from "@/types/database";

import { BOOKING_LIST_COLUMNS, buildBookingsHref, type BookingListItem } from "./booking-state";
import { BookingsTable } from "./bookings-table";

/**
 * Tabel booking yang dipaginasi -- query utama halaman ini (bukan kartu
 * ringkasan, lihat bookings-summary.tsx). `statusFilter`/`searchTerm` di
 * sini SUDAH divalidasi oleh page.tsx; komponen ini tidak perlu tahu soal
 * `searchError` (itu murni soal tampilan pesan di atas tabel, dirender
 * langsung oleh page.tsx tanpa menunggu query apa pun).
 */
export async function BookingsList({
  statusFilter,
  searchTerm,
  page,
  pageSize,
}: {
  statusFilter: BookingStatus | null;
  searchTerm: string;
  page: number;
  pageSize: number;
}) {
  const { user, merchant } = await requireMerchant();
  const supabase = await createClient();

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

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

  // Instant referensi "sekarang" -- dihitung SEKALI di sini (Server
  // Component, komponen async ini dijalankan sekali per request) lalu
  // diteruskan ke BookingsTable sebagai nowMs. Lihat komentar nowMs di
  // getDisplayStatus (booking-state.ts) soal kenapa ini tidak boleh dibaca
  // lewat Date.now() di komponen klien.
  const now = new Date();

  const bookingsResult = await bookingsQuery;

  // BEDA dari kartu ringkasan di bookings-summary.tsx: ini sumber tabel,
  // jadi errornya tidak boleh diam-diam terdegradasi jadi "[]" -- lihat
  // cabang render "gagal memuat" di bawah, yang sengaja dibedakan dari
  // cabang "belum ada booking".
  if (bookingsResult.error) {
    console.error("[dashboard/bookings] gagal memuat daftar booking", {
      merchantId: user.id,
      error: bookingsResult.error,
    });
  }

  // requireMerchant() sudah menjamin username terisi (kalau tidak, sudah
  // di-redirect ke /onboarding sebelum sampai di sini).
  const username = merchant.username;
  const bookings = (bookingsResult.data ?? []) as BookingListItem[];
  const totalCount = bookingsResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  // totalCount di atas sudah mencerminkan filter yang aktif (query yang
  // sama menghitung total tanpa .range()) -- jadi kalau TIDAK ada filter
  // aktif dan totalCount tetap 0, itu memang berarti merchant belum punya
  // booking sama sekali. Tidak perlu query "hasAnyBookings" terpisah.
  //
  // Kecuali bookingsResult.error: totalCount juga jatuh ke 0 kalau query-nya
  // gagal (bukan cuma kalau memang kosong) -- karena itu cabang render di
  // bawah memeriksa bookingsResult.error LEBIH DULU, supaya "gagal memuat"
  // tidak pernah disalahartikan sebagai "belum ada booking".
  const hasFilters = statusFilter !== null || searchTerm !== "";

  // Halaman diminta di luar jangkauan (mis. merchant mengetik ?page=99
  // langsung, filter/ukuran halaman diubah sampai halaman lama jadi kosong)
  // -- arahkan ke halaman valid terakhir alih-alih menampilkan tabel kosong
  // yang menyesatkan padahal datanya ada di halaman lain. Tidak pernah
  // terpicu saat bookingsResult.error (totalCount jatuh ke 0 di atas,
  // sehingga totalCount > 0 di sini pasti false).
  if (page > totalPages && totalCount > 0) {
    redirect(
      buildBookingsHref({
        status: statusFilter ?? "",
        q: searchTerm,
        page: totalPages,
        size: pageSize,
      }),
    );
  }

  // CABANG ERROR WAJIB diperiksa LEBIH DULU dari cabang "totalCount === 0"
  // di bawah -- kalau urutannya dibalik, query yang gagal (totalCount jatuh
  // ke 0 lewat `?? 0` di atas) akan disalahartikan sebagai "merchant belum
  // punya booking", sebuah kebohongan ke merchant.
  if (bookingsResult.error) {
    return (
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
    );
  }

  if (totalCount === 0) {
    if (hasFilters) {
      return (
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
      );
    }

    return (
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
    );
  }

  return (
    <>
      <BookingsTable bookings={bookings} nowMs={now.getTime()} />

      <DataTablePagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        buildHref={(next) =>
          buildBookingsHref({
            status: statusFilter ?? "",
            q: searchTerm,
            // Mengubah ukuran halaman TANPA menyebut halaman tujuan
            // (pemilih 10/20/50 di DataTablePagination) selalu kembali ke
            // halaman 1 -- halaman saat ini bisa saja di luar jangkauan
            // untuk ukuran baru (mis. sedang di halaman 5 dengan 10/baris,
            // lalu pindah ke 50/baris).
            page: next.size !== undefined && next.page === undefined ? 1 : (next.page ?? page),
            size: next.size ?? pageSize,
          })
        }
      />
    </>
  );
}
