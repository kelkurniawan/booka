import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton, StatCardsSkeleton } from "@/components/ui/skeletons";

/**
 * Fallback tingkat rute untuk segmen /dashboard -- Next.js menampilkan ini
 * SEKETIKA saat navigasi dimulai (sebelum Server Component tujuan selesai
 * di-render), jadi mengklik menu sidebar tidak lagi meninggalkan layar diam
 * menunggu semua query halaman Ringkasan selesai.
 *
 * Header di sini SENGAJA berupa skeleton, bukan teks "Ringkasan" asli --
 * fallback ini juga muncul saat navigasi ke rute dashboard lain yang belum
 * punya loading.tsx sendiri, jadi tidak boleh berasumsi tujuan navigasinya
 * pasti halaman Ringkasan.
 */
export default function DashboardLoading() {
  return (
    <>
      <span className="sr-only">Memuat halaman…</span>
      <div aria-hidden="true" className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      <StatCardsSkeleton />
      <ListSkeleton />
    </>
  );
}
