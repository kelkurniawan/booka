import { Skeleton } from "@/components/ui/skeleton";
import { StatCardsSkeleton, TableSkeleton } from "@/components/ui/skeletons";

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
      <TableSkeleton />
    </>
  );
}
