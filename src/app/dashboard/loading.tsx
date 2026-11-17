import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback tingkat rute /dashboard, dipakai SEMUA rute /dashboard/* yang
 * belum punya loading.tsx sendiri, jadi cuma skeleton header (bentuk
 * <PageHeader>) dan tidak berasumsi bentuk halaman tujuan. Bagian halaman
 * Hari ini punya <Suspense> dan skeleton sendiri di page.tsx.
 */
export default function DashboardLoading() {
  return (
    <>
      <span className="sr-only">Memuat halaman…</span>
      <div aria-hidden="true" className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
    </>
  );
}
