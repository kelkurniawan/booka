import { cn } from "@/lib/utils"

/**
 * Pembungkus animasi "reveal" murni CSS (lihat kelas `.booka-reveal` dan
 * `@keyframes booka-reveal` di globals.css) -- Server Component, TIDAK
 * butuh JS di klien. Dipakai untuk memberi kesan konten baru selesai
 * dimuat, misalnya saat data asli menggantikan skeleton.
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
      className={cn("booka-reveal", className)}
      style={{ animationDelay: delay ? `${delay}ms` : undefined }}
    >
      {children}
    </div>
  )
}

export { Reveal }
