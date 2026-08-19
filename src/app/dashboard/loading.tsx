import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback tingkat rute untuk segmen /dashboard -- Next.js menampilkan ini
 * SEKETIKA saat navigasi dimulai (sebelum Server Component tujuan selesai
 * di-render), jadi mengklik menu sidebar tidak lagi meninggalkan layar diam
 * menunggu query halaman tujuan selesai.
 *
 * SENGAJA cuma skeleton header (meniru bentuk <PageHeader>, lihat
 * components/layout/page-header.tsx), TIDAK ada skeleton kartu/tabel/list
 * apa pun di sini -- fallback ini dipakai untuk SEMUA rute /dashboard/*
 * yang belum punya loading.tsx sendiri (baru Ringkasan dan Booking masuk
 * yang punya, lihat dashboard/bookings/loading.tsx), jadi tidak boleh
 * berasumsi bentuk halaman tujuannya. Dulu file ini merender
 * StatCardsSkeleton + ListSkeleton (bentuk Ringkasan) untuk SEMUA rute --
 * berarti membuka Pengaturan/Layanan/dsb sempat menampilkan skeleton tiga
 * kartu + daftar sebelum diganti total oleh form/halaman yang bentuknya
 * sama sekali berbeda, lebih buruk daripada tanpa skeleton sama sekali
 * karena menjanjikan bentuk yang salah. Halaman Ringkasan sendiri TIDAK
 * kehilangan skeleton kartu/daftarnya -- dashboard/page.tsx sudah punya
 * <Suspense> sendiri per bagian (lihat komentar di sana) yang menampilkan
 * StatCardsSkeleton/UpcomingBookingsSkeleton begitu shell halamannya
 * (termasuk fallback route ini) selesai ditampilkan.
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
