import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ListSkeleton, StatCardsSkeleton } from "@/components/ui/skeletons";
import { ROUTES } from "@/lib/routes";

import { OverviewStats } from "./overview-stats";
import { SetupAlerts } from "./setup-alerts";
import { UpcomingBookings } from "./upcoming-bookings";

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
 * SetupAlerts tidak diberi fallback skeleton: bentuknya dinamis (bisa nol,
 * satu, atau dua alert) sehingga skeleton kotak apa pun akan menyesatkan
 * atau memicu layout shift begitu alert sungguhan muncul. Query-nya sendiri
 * berbagi cache() dengan OverviewStats (lihat queries.ts) jadi biasanya
 * selesai bersamaan dengan kartu statistik.
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

      <Suspense fallback={<StatCardsSkeleton />}>
        <OverviewStats />
      </Suspense>

      <Suspense fallback={<ListSkeleton />}>
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
