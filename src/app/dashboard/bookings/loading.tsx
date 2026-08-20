import { Skeleton } from "@/components/ui/skeleton";
import { StatCardsSkeleton, TableSkeleton } from "@/components/ui/skeletons";

import { DEFAULT_PAGE_SIZE } from "./booking-state";

/**
 * Fallback tingkat rute untuk segmen /dashboard/bookings -- Next.js
 * menampilkan ini SEKETIKA saat navigasi dimulai (sebelum Server Component
 * tujuan selesai di-render), jadi berpindah dari menu sidebar lain ke
 * Booking masuk tidak lagi meninggalkan layar diam menunggu RPC ringkasan
 * dan query tabel selesai. Lihat pola yang sama di dashboard/loading.tsx.
 *
 * StatCardsSkeleton diberi className="sm:grid-cols-3" supaya jumlah kolom
 * gridnya cocok dengan grid tiga kartu ringkasan di bookings-summary.tsx
 * (bukan default dua/tiga kolom bertingkat dashboard/page.tsx).
 *
 * TableSkeleton diberi rows/columns/firstColumnTwoLine eksplisit supaya
 * geometrinya cocok dengan BookingsTable (bookings-table.tsx): 6 kolom
 * (Jadwal, Pelanggan, Layanan, Nilai, Status, kolom aksi), kolom Jadwal dua
 * baris (tanggal di atas jam). rows memakai DEFAULT_PAGE_SIZE, BUKAN angka
 * literal -- fallback rute ini tidak tahu ?size= dari URL (belum ada
 * `searchParams` di sini, beda dari page.tsx yang tahu pageSize
 * sesungguhnya), jadi dipakai ukuran default yang sama dengan yang
 * dipakai bookings-list.tsx kalau parameter `size` tidak ada/tidak valid.
 */
export default function BookingsLoading() {
  return (
    <>
      <span className="sr-only">Memuat halaman…</span>
      <div aria-hidden="true" className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      <StatCardsSkeleton className="sm:grid-cols-3" />
      <TableSkeleton rows={DEFAULT_PAGE_SIZE} columns={6} firstColumnTwoLine />
    </>
  );
}
