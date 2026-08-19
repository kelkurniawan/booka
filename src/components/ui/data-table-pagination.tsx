import Link from "next/link"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Default generik dipakai kalau pemanggil tidak menyebut `pageSizeOptions`
 * sendiri -- pemanggil route-specific (mis. dashboard/bookings) SEHARUSNYA
 * selalu meneruskan konstanta miliknya sendiri secara eksplisit (lihat
 * PAGE_SIZE_OPTIONS di booking-state.ts, dipakai juga untuk memvalidasi
 * `?size=` di page.tsx) supaya nilai yang dirender pemilih ini TIDAK PERNAH
 * bisa berbeda dari nilai yang divalidasi/diterima route tersebut. Komponen
 * UI generik ini sengaja TIDAK mengimpor konstanta route manapun -- arah
 * dependensi yang benar adalah route -> komponen UI, bukan sebaliknya. */
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50] as const

/**
 * Kontrol paginasi generik untuk tabel/daftar server-rendered: teks
 * jangkauan ("Menampilkan 1–20 dari 137"), tombol Sebelumnya/Berikutnya,
 * dan pemilih ukuran halaman. Server Component murni -- pemilih ukuran
 * memakai <Link> biasa, bukan <Select> yang butuh client component dan JS
 * tambahan di klien.
 *
 * Tidak dirender sama sekali kalau tidak ada data sama sekali (totalCount
 * 0) -- kontrol paginasi kosong di layar cuma noise. Tapi SELAMA ada data,
 * pemilih ukuran halaman TETAP dirender walau cuma satu halaman
 * (totalPages <= 1) -- HANYA tombol Sebelumnya/Berikutnya yang disembunyikan
 * saat itu. Merchant yang memilih 50 baris/halaman dan hasilnya pas muat
 * dalam satu halaman harus tetap bisa mengubah pilihannya balik ke 10/20
 * dari dalam halaman ini -- menyembunyikan SELURUH kontrol (perilaku lama)
 * mengunci merchant itu di pilihan 50 tanpa jalan keluar dalam halaman.
 */
export function DataTablePagination({
  page,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  totalCount,
  buildHref,
}: {
  page: number
  pageSize: number
  /** Pilihan ukuran halaman yang dirender pemilih -- SEHARUSNYA konstanta
   * yang sama dengan yang dipakai memvalidasi parameter ukuran halaman di
   * pemanggil (lihat catatan DEFAULT_PAGE_SIZE_OPTIONS di atas). */
  pageSizeOptions?: readonly number[]
  totalCount: number
  /** Membangun URL untuk halaman/ukuran tertentu. */
  buildHref: (next: { page?: number; size?: number }) => string
}) {
  if (totalCount <= 0) return null

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
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
          {pageSizeOptions.map((size) => (
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
        {totalPages > 1 ? (
          <div className="flex gap-2">
            {/* Button asChild dengan `disabled` tidak benar-benar mencegah
                navigasi (Slot cuma menaruh atribut "disabled" ke <a>, yang
                tidak dikenal HTML) -- jadi saat tidak ada halaman
                sebelumnya/berikutnya, render Button biasa (bukan Link) yang
                disabled sungguhan, bukan Button asChild yang disable-nya
                cuma kosmetik pada elemen <a>. */}
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
        ) : null}
      </div>
    </div>
  )
}
