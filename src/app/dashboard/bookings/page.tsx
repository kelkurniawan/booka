import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { StatCardsSkeleton, TableSkeleton } from "@/components/ui/skeletons";
import { bookingSearchSchema, bookingStatusFilterSchema } from "@/lib/validations/booking";
import type { BookingStatus } from "@/types/database";

import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "./booking-state";
import { BookingsFilters } from "./bookings-filters";
import { BookingsList } from "./bookings-list";
import { BookingsSummary } from "./bookings-summary";

export const metadata: Metadata = { title: "Booking masuk" };

/**
 * Shell halaman Booking masuk -- SENGAJA tidak meng-`await` query apa pun di
 * sini (pola yang sama dengan dashboard/page.tsx, lihat komentarnya).
 * Kartu ringkasan (BookingsSummary) dan tabel yang dipaginasi (BookingsList)
 * adalah komponen async terpisah, masing-masing dibungkus <Suspense>, jadi
 * header + filter langsung tampil dan tiap bagian streaming begitu query-nya
 * sendiri selesai.
 *
 * `key` pada <Suspense> pembungkus BookingsList SENGAJA berubah tiap kali
 * status/pencarian/halaman/ukuran halaman berubah -- itu yang membuat React
 * me-remount boundary-nya (menampilkan TableSkeleton lagi) tiap kali
 * kombinasi filter/paginasi berubah, TANPA ikut membuat kartu ringkasan di
 * atasnya berkedip (boundary-nya terpisah dan key-nya tidak berubah untuk
 * perubahan yang sama).
 */
export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; size?: string }>;
}) {
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

  // Ukuran halaman tak dikenal (bukan 10/20/50) diperlakukan sama seperti
  // `status` tak dikenal: diam-diam jatuh ke default, bukan error.
  const sizeParam = Number(rawParams.size);
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(sizeParam)
    ? sizeParam
    : DEFAULT_PAGE_SIZE;

  return (
    <>
      <PageHeader
        title="Booking masuk"
        description="Semua pesanan yang masuk lewat halaman booking Anda."
      />

      <Suspense fallback={<StatCardsSkeleton className="sm:grid-cols-3" />}>
        <BookingsSummary />
      </Suspense>

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

      <Suspense
        key={`${statusFilter ?? ""}|${searchTerm}|${page}|${pageSize}`}
        fallback={<TableSkeleton />}
      >
        <BookingsList statusFilter={statusFilter} searchTerm={searchTerm} page={page} pageSize={pageSize} />
      </Suspense>
    </>
  );
}
