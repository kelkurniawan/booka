import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { TableSkeleton } from "@/components/ui/skeletons";
import { parseTab } from "@/lib/booking/dashboard";
import { ROUTES } from "@/lib/routes";
import { bookingSearchSchema } from "@/lib/validations/booking";

import { getTabCounts } from "../queries";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "./booking-state";
import { BookingTabs } from "./booking-tabs";
import { BookingsFilters } from "./bookings-filters";
import { BookingsList } from "./bookings-list";

export const metadata: Metadata = { title: "Booking" };

/**
 * Shell halaman Booking -- SENGAJA tidak meng-`await` query apa pun di
 * sini (pola yang sama dengan dashboard/page.tsx, lihat komentarnya).
 * Daftar yang dipaginasi (BookingsList) adalah komponen async yang dibungkus
 * <Suspense>, jadi header + tab + pencarian langsung tampil.
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
  searchParams: Promise<{ tab?: string; q?: string; page?: string; size?: string; b?: string }>;
}) {
  const rawParams = await searchParams;

  // Tab tak dikenal jatuh ke "Akan datang".
  const tab = parseTab(rawParams.tab);
  const counts = await getTabCounts();

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
        title="Booking"
        action={
          <Link
            href={ROUTES.newBooking}
            className="bg-primary text-primary-foreground hidden h-11 items-center rounded-lg px-4 text-sm font-medium md:inline-flex"
          >
            Booking manual
          </Link>
        }
      />

      <BookingTabs active={tab} counts={counts} q={searchTerm} size={pageSize} />

      {/* key={q}: lihat catatan di bookings-filters.tsx. */}
      <BookingsFilters key={rawParams.q ?? ""} q={rawParams.q ?? ""} />

      {searchError ? (
        <p className="text-muted-foreground text-sm" role="alert">
          {searchError}
        </p>
      ) : null}

      <Suspense
        key={`${tab}|${searchTerm}|${page}|${pageSize}`}
        fallback={<TableSkeleton rows={pageSize} columns={5} firstColumnTwoLine />}
      >
        <BookingsList
          tab={tab}
          searchTerm={searchTerm}
          page={page}
          pageSize={pageSize}
          selectedId={rawParams.b ?? null}
        />
      </Suspense>
    </>
  );
}
