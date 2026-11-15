import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/skeletons";

import { DEFAULT_PAGE_SIZE } from "./booking-state";

/** Fallback rute /dashboard/bookings: judul, tab, pencarian, lalu tabel. */
export default function BookingsLoading() {
  return (
    <>
      <span className="sr-only">Memuat halaman…</span>
      <div aria-hidden="true" className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-11 w-full max-w-md" />
        <Skeleton className="h-11 w-full" />
      </div>
      <TableSkeleton rows={DEFAULT_PAGE_SIZE} columns={5} firstColumnTwoLine />
    </>
  );
}
