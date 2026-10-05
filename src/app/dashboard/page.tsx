import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { StatCardsSkeleton } from "@/components/ui/skeletons";
import { ROUTES } from "@/lib/routes";

import { OverviewStats } from "./overview-stats";
import { ProfileNudge } from "./profile-nudge";
import { SetupAlerts } from "./setup-alerts";
import { UpcomingBookings, UpcomingBookingsSkeleton } from "./upcoming-bookings";

export const metadata: Metadata = {
  title: "Ringkasan",
};

/**
 * Shell halaman Ringkasan -- SENGAJA tidak meng-`await` query apa pun di
 * sini. Tiap bagian yang butuh data (alert setup, kartu statistik, jadwal
 * terdekat) adalah komponen async terpisah yang dibungkus <Suspense>, jadi
 * header halaman langsung tampil dan tiap bagian streaming begitu query-nya
 * sendiri selesai -- lihat overview-stats.tsx, setup-alerts.tsx,
 * upcoming-bookings.tsx, dan queries.ts untuk query yang dibagi di antara
 * komponen-komponen itu supaya tidak dobel.
 *
 * SetupAlerts dan ProfileNudge tidak diberi fallback skeleton: bentuk
 * keduanya dinamis (nol atau satu kartu) sehingga skeleton kotak apa pun
 * akan menyesatkan atau memicu layout shift begitu kontennya muncul.
 * SetupAlerts berbagi cache() dengan OverviewStats (lihat queries.ts) jadi
 * biasanya selesai bersamaan dengan kartu statistik. ProfileNudge terpisah
 * dengan sengaja -- urusannya pengenalan usaha, bukan kesiapan halaman
 * booking -- lihat komentar di profile-nudge.tsx.
 *
 * UpcomingBookings SEBALIKNYA punya bentuk box tetap (satu Card dengan
 * judul + deskripsi + area list), jadi fallback-nya UpcomingBookingsSkeleton
 * (co-located di upcoming-bookings.tsx) sengaja meniru Card/CardHeader/
 * CardContent yang sama persis -- supaya saat konten asli streaming masuk,
 * tinggi kotaknya tidak berubah dan tombol "Lihat semua booking" di
 * bawahnya tidak ikut bergeser.
 */
export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Ringkasan"
        description="Kondisi akun dan jadwal terdekat Anda."
      />

      <Suspense fallback={null}>
        <SetupAlerts />
      </Suspense>

      <Suspense fallback={null}>
        <ProfileNudge />
      </Suspense>

      <Suspense fallback={<StatCardsSkeleton />}>
        <OverviewStats />
      </Suspense>

      <Suspense fallback={<UpcomingBookingsSkeleton />}>
        <UpcomingBookings />
      </Suspense>

      <div>
        <Button asChild variant="outline">
          <Link href={ROUTES.bookings}>Lihat semua booking</Link>
        </Button>
      </div>
    </>
  );
}
