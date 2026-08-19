import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/**
 * Primitif skeleton -- Server Component, murni markup + CSS (kelas
 * `animate-pulse` bawaan <Skeleton>, dimatikan lewat prefers-reduced-motion
 * di globals.css). Setiap skeleton di sini SENGAJA meniru struktur & kelas
 * grid/wrapper komponen aslinya (StatCard di dashboard/page.tsx,
 * SummaryCard di dashboard/bookings/page.tsx, wrapper BookingsTable /
 * ServicesTable) supaya tinggi fallback mendekati konten asli dan tidak
 * memicu layout shift saat data sungguhan datang.
 *
 * Pembungkus dekoratifnya diberi aria-hidden="true", dan hanya SATU
 * <span className="sr-only"> per komponen (di luar pembungkus aria-hidden,
 * sebagai saudara -- bukan di dalamnya, supaya tidak ikut disembunyikan)
 * supaya pembaca layar mengumumkan "Memuat…" sekali, bukan berulang per
 * baris/kartu skeleton.
 */

function StatCardsSkeleton({
  count = 3,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <>
      <span className="sr-only">Memuat…</span>
      <div
        data-slot="stat-cards-skeleton"
        aria-hidden="true"
        className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}
      >
        {Array.from({ length: count }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-16" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}

function TableSkeleton({
  rows = 8,
  columns = 5,
}: {
  rows?: number
  columns?: number
}) {
  return (
    <>
      <span className="sr-only">Memuat…</span>
      <div
        data-slot="table-skeleton"
        aria-hidden="true"
        className="overflow-hidden rounded-xl border"
      >
        <table className="w-full caption-bottom text-sm">
          <thead className="[&_tr]:border-b">
            <tr className="border-b">
              {Array.from({ length: columns }).map((_, index) => (
                <th key={index} className="h-10 px-2 align-middle">
                  <Skeleton className="h-4 w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={rowIndex} className="border-b last:border-0">
                {Array.from({ length: columns }).map((_, columnIndex) => (
                  <td key={columnIndex} className="p-2 align-middle">
                    <Skeleton className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <>
      <span className="sr-only">Memuat…</span>
      <ul data-slot="list-skeleton" aria-hidden="true" className="divide-y">
        {Array.from({ length: rows }).map((_, index) => (
          <li key={index} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </li>
        ))}
      </ul>
    </>
  )
}

export { StatCardsSkeleton, TableSkeleton, ListSkeleton }
