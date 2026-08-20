import { cn } from "@/lib/utils"

/**
 * Pembungkus animasi "reveal" murni CSS (lihat kelas `.booka-reveal` dan
 * `@keyframes booka-reveal` di globals.css) -- Server Component, TIDAK
 * butuh JS di klien. Dipakai untuk memberi kesan konten baru selesai
 * dimuat, misalnya saat data asli menggantikan skeleton.
 *
 * `h-full` WAJIB di sini: kedua pemakainya (overview-stats.tsx,
 * bookings-summary.tsx) membungkus <Card> sebagai child langsung dari grid
 * tiga-kartu yang punya `align-items: stretch` bawaan grid. Dulu <Card>
 * sendiri yang jadi child grid itu, jadi stretch berlaku langsung padanya.
 * Sekarang div Reveal-lah child grid-nya -- div itu ikut stretch, tapi
 * TANPA h-full di sini, <Card> di dalamnya tetap menyusut mengikuti isinya
 * (card.tsx tidak punya h-full), jadi kartu yang hint-nya sampai wrap dua
 * baris (mis. "Kuota habis -- pesanan baru ditolak") membuat kartu
 * tetangganya lebih pendek. Ini juga yang menyamakan tinggi baris kartu
 * asli dengan StatCardsSkeleton (yang <Card>-nya TIDAK dibungkus Reveal,
 * jadi selalu sama tinggi) -- tanpa h-full, swap skeleton -> konten asli
 * melompat persis di momen yang seharusnya dihaluskan animasi ini.
 */
function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  /** Jeda mulai animasi dalam milidetik, untuk efek berurutan antar kartu. */
  delay?: number
  className?: string
}) {
  return (
    <div
      data-slot="reveal"
      className={cn("booka-reveal h-full", className)}
      style={{ animationDelay: delay ? `${delay}ms` : undefined }}
    >
      {children}
    </div>
  )
}

export { Reveal }
