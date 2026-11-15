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
import { type BookingTab } from "@/lib/booking/dashboard";
import { jakartaDateISO } from "@/lib/booking/slots";

import {
  BOOKING_LIST_COLUMNS,
  buildBookingsHref,
  PAGE_SIZE_OPTIONS,
  type BookingListItem,
} from "./booking-state";
import { BookingsTable } from "./bookings-table";

const EMPTY_TEXT: Record<BookingTab, string> = {
  ACTION: "Semua beres. Tidak ada yang perlu ditindaklanjuti.",
  UPCOMING: "Belum ada booking mendatang.",
  HISTORY: "Belum ada riwayat booking.",
  CANCELLED: "Tidak ada booking yang dibatalkan.",
};

/**
 * Daftar booking satu tab, dipaginasi. `tab`/`searchTerm` SUDAH divalidasi
 * page.tsx (pencarian menolak `, . ( ) % \`, jadi aman untuk sintaks `.or()`
 * PostgREST). `selectedId` = booking yang panelnya terbuka (`?b=`).
 */
export async function BookingsList({
  tab,
  searchTerm,
  page,
  pageSize,
  selectedId,
}: {
  tab: BookingTab;
  searchTerm: string;
  page: number;
  pageSize: number;
  selectedId: string | null;
}) {
  const { user } = await requireMerchant();
  const supabase = await createClient();

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Fungsi tab sudah memfilter per tab; .eq merchant_id tetap eksplisit
  // (RLS lapis kedua) dan kolom daftar tanpa access_token/payment_url.
  let bookingsQuery = supabase
    .rpc("bookings_in_tab", { p_tab: tab }, { count: "exact" })
    .select(BOOKING_LIST_COLUMNS)
    .eq("merchant_id", user.id);

  if (searchTerm) {
    const pattern = `%${searchTerm}%`;
    bookingsQuery = bookingsQuery.or(
      `customer_name.ilike.${pattern},customer_whatsapp.ilike.${pattern}`,
    );
  }
  // Tab ke depan naik (yang terdekat dulu), tab ke belakang turun.
  const ascending = tab === "ACTION" || tab === "UPCOMING";
  bookingsQuery = bookingsQuery.order("start_datetime", { ascending }).range(from, to);

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

  const bookings = (bookingsResult.data ?? []) as unknown as BookingListItem[];
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
  const hasSearch = searchTerm !== "";

  // Halaman diminta di luar jangkauan (mis. merchant mengetik ?page=99
  // langsung, filter/ukuran halaman diubah sampai halaman lama jadi kosong)
  // -- arahkan ke halaman valid terakhir alih-alih menampilkan tabel kosong
  // yang menyesatkan padahal datanya ada di halaman lain. Tidak pernah
  // terpicu saat bookingsResult.error (totalCount jatuh ke 0 di atas,
  // sehingga totalCount > 0 di sini pasti false).
  if (page > totalPages && totalCount > 0) {
    redirect(
      buildBookingsHref({
        tab,
        q: searchTerm,
        page: totalPages,
        size: pageSize,
        b: selectedId,
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
            <Link href={buildBookingsHref({ tab, q: searchTerm, page, size: pageSize })}>Muat ulang halaman</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (totalCount === 0) {
    if (hasSearch) {
      return (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>Tidak ada booking yang cocok dengan pencarian.</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline" className="h-11">
              <Link href={buildBookingsHref({ tab, q: "", page: 1, size: pageSize })}>Hapus pencarian</Link>
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
          <EmptyTitle>{EMPTY_TEXT[tab]}</EmptyTitle>
        </EmptyHeader>
        {tab === "UPCOMING" ? (
          <EmptyContent>
            <Button asChild className="h-11">
              <Link href={ROUTES.newBooking}>Catat booking manual</Link>
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    );
  }

  return (
    // Satu pembungkus: di lg halaman ini grid dua kolom (daftar | panel),
    // jadi tabel dan paginasi harus tetap satu sel grid.
    <div className="flex min-w-0 flex-col gap-4">
      <BookingsTable
        rows={bookings}
        nowMs={now.getTime()}
        todayISO={jakartaDateISO(now)}
        selectedId={selectedId}
        hrefFor={(id) => buildBookingsHref({ tab, q: searchTerm, page, size: pageSize, b: id })}
      />

      <DataTablePagination
        page={page}
        pageSize={pageSize}
        // PAGE_SIZE_OPTIONS di sini SAMA PERSIS dengan yang dipakai
        // memvalidasi `?size=` di page.tsx -- lihat catatan
        // DEFAULT_PAGE_SIZE_OPTIONS di data-table-pagination.tsx soal
        // kenapa ini WAJIB diteruskan eksplisit, bukan mengandalkan default
        // komponennya.
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        totalCount={totalCount}
        buildHref={(next) =>
          buildBookingsHref({
            tab,
            q: searchTerm,
            b: selectedId,
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
    </div>
  );
}
