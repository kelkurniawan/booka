import Link from "next/link"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const

/**
 * Kontrol paginasi generik untuk tabel/daftar server-rendered: teks
 * jangkauan ("Menampilkan 1–20 dari 137"), tombol Sebelumnya/Berikutnya,
 * dan pemilih ukuran halaman (10/20/50). Server Component murni -- pemilih
 * ukuran memakai <Link> biasa, bukan <Select> yang butuh client component
 * dan JS tambahan di klien.
 *
 * Tidak dirender sama sekali kalau seluruh data sudah muat dalam satu
 * halaman -- kontrol paginasi yang isinya cuma tombol disabled semua di
 * layar cuma noise.
 */
export function DataTablePagination({
  page,
  pageSize,
  totalCount,
  buildHref,
}: {
  page: number
  pageSize: number
  totalCount: number
  /** Membangun URL untuk halaman/ukuran tertentu. */
  buildHref: (next: { page?: number; size?: number }) => string
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  if (totalPages <= 1) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  return (
    <div
      data-slot="data-table-pagination"
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-muted-foreground text-sm">
        Menampilkan {from}–{to} dari {totalCount}
      </p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 text-sm">
          <span className="text-muted-foreground">Baris per halaman</span>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <Link
              key={size}
              href={buildHref({ size })}
              aria-current={size === pageSize ? "true" : undefined}
              className={cn(
                "rounded px-1.5 py-0.5",
                size === pageSize
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {size}
            </Link>
          ))}
        </div>
        <div className="flex gap-2">
          {/* Button asChild dengan `disabled` tidak benar-benar mencegah
              navigasi (Slot cuma menaruh atribut "disabled" ke <a>, yang
              tidak dikenal HTML) -- jadi saat tidak ada halaman
              sebelumnya/berikutnya, render Button biasa (bukan Link) yang
              disabled sungguhan, bukan Button asChild yang disable-nya cuma
              kosmetik pada elemen <a>. */}
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={buildHref({ page: page - 1 })}>Sebelumnya</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Sebelumnya
            </Button>
          )}
          {page < totalPages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={buildHref({ page: page + 1 })}>Berikutnya</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Berikutnya
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
