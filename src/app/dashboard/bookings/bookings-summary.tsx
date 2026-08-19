import { Banknote, CalendarClock, Hourglass } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { requireMerchant } from "@/lib/auth/session";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/**
 * Tiga kartu ringkasan ledger booking: booking bulan ini, pendapatan
 * terkonfirmasi bulan ini, menunggu pembayaran. Sejak Task 1 dihitung oleh
 * RPC dashboard_booking_summary() (satu round-trip, SUM dipindah ke
 * Postgres) -- menggantikan empat query client terpisah
 * (monthPaidResult/monthPendingResult/revenueResult/pendingResult) yang
 * sebelumnya ada di page.tsx. Definisi persis "booking bulan ini" (harus
 * sama dengan count_bookings_this_month, dipakai kuota di Ringkasan) dan
 * "pendapatan terkonfirmasi" (kenapa batas bulannya dihitung dengan
 * date_trunc di zona Asia/Jakarta) didokumentasikan di
 * supabase/migrations/20260819000400_dashboard_perf.sql, bukan lagi di
 * sini -- lihat juga komentar startOfMonthJakartaIso yang dipindah kesana.
 *
 * Boleh degradasi ke 0 kalau RPC-nya gagal (angka 0 di kartu ringkasan di
 * samping tabel yang tetap berfungsi cuma terlihat aneh, tidak menyesatkan
 * seperti kalau tabelnya sendiri yang gagal -- lihat bookings-list.tsx),
 * tapi errornya tetap WAJIB dicatat, bukan ditelan diam-diam.
 */
export async function BookingsSummary() {
  const { user } = await requireMerchant();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("dashboard_booking_summary");

  if (error) {
    console.error("[dashboard/bookings] gagal memuat ringkasan booking", {
      merchantId: user.id,
      error,
    });
  }

  const row = data?.[0];
  const bookingsThisMonth = row?.bookings_this_month ?? 0;
  // confirmed_revenue adalah numeric di Postgres -- Number() berjaga-jaga
  // kalau suatu saat postgrest-js mengembalikannya sebagai string (sama
  // seperti komentar di src/app/api/bookings/route.ts), supaya kartu ini
  // tidak diam-diam menampilkan "Rp NaN" alih-alih angka.
  const confirmedRevenue = Number(row?.confirmed_revenue ?? 0);
  const pendingCount = row?.pending_count ?? 0;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Reveal delay={0}>
        <SummaryCard
          icon={<CalendarClock className="size-4" />}
          label="Booking bulan ini"
          value={`${bookingsThisMonth}`}
          // Definisi ini SENGAJA sama persis dengan count_bookings_this_month
          // (dipakai kuota "X / Y transaksi" di Ringkasan) -- PAID, atau
          // PENDING yang belum kedaluwarsa. Bukan "semua status": CANCELLED
          // dan PENDING kedaluwarsa TIDAK dihitung, supaya angka di kartu ini
          // tidak pernah tampak berbeda dari kuota di halaman Ringkasan untuk
          // bulan yang sama.
          hint="Booking yang terhitung kuota bulan ini (dibayar atau menunggu pembayaran)"
        />
      </Reveal>
      <Reveal delay={40}>
        <SummaryCard
          icon={<Banknote className="size-4" />}
          label="Pendapatan terkonfirmasi bulan ini"
          value={formatRupiah(confirmedRevenue)}
          hint="Total DP yang sudah dibayar bulan ini"
        />
      </Reveal>
      <Reveal delay={80}>
        <SummaryCard
          icon={<Hourglass className="size-4" />}
          label="Menunggu pembayaran"
          value={`${pendingCount}`}
          hint="Booking PENDING yang belum kedaluwarsa"
        />
      </Reveal>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    // h-full: SummaryCard SELALU dibungkus <Reveal> (yang div-nya sudah
    // h-full mengikuti stretch grid induk, lihat komentar di reveal.tsx),
    // tapi Card sendiri (card.tsx) tidak punya h-full -- tanpa ini kartu
    // yang hint-nya wrap dua baris jadi lebih tinggi dari tetangganya.
    // Diberikan di sini, BUKAN di card.tsx, supaya perubahan tidak ikut
    // memengaruhi pemakai <Card> lain yang tidak dibungkus Reveal.
    <Card className="h-full">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          {icon}
          {label}
        </CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </CardContent>
    </Card>
  );
}
