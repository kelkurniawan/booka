import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/ui/skeletons";
import { requireMerchant } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/** Kartu "Jadwal terdekat": booking berbayar yang belum berlangsung. */
export async function UpcomingBookings() {
  const { user } = await requireMerchant();
  const supabase = await createClient();

  const now = new Date();

  const { data: upcoming } = await supabase
    .from("bookings")
    .select("id, service_name, customer_name, start_datetime, status")
    .eq("merchant_id", user.id)
    .eq("status", "PAID")
    .gte("start_datetime", now.toISOString())
    .order("start_datetime", { ascending: true })
    .limit(5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Jadwal terdekat</CardTitle>
        <CardDescription>Booking berbayar yang belum berlangsung.</CardDescription>
      </CardHeader>
      <CardContent>
        {(upcoming?.length ?? 0) === 0 ? (
          <p className="text-muted-foreground text-sm">
            Belum ada jadwal. Booking yang sudah dibayar akan muncul di sini.
          </p>
        ) : (
          <ul className="divide-y">
            {upcoming?.map((booking) => (
              <li key={booking.id} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
                <span className="text-sm font-medium">
                  {booking.customer_name} — {booking.service_name}
                </span>
                <span className="text-muted-foreground text-sm">
                  {formatDateTime(booking.start_datetime)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Fallback <Suspense> untuk UpcomingBookings -- dibungkus Card/CardHeader/
 * CardContent yang SAMA persis dengan konten asli di atas (judul + deskripsi
 * + area list), supaya saat data sungguhan streaming masuk, tinggi kotaknya
 * tidak berubah dan elemen di bawahnya (tombol "Lihat semua booking") tidak
 * ikut bergeser. Ditaruh di sini, bukan di components/ui/skeletons.tsx, agar
 * co-located dengan komponen yang ditirunya -- kalau UpcomingBookings
 * berubah bentuk, skeleton ini jadi jelas siapa yang harus ikut disesuaikan.
 */
export function UpcomingBookingsSkeleton() {
  return (
    <Card>
      {/* aria-hidden di CardHeader saja, BUKAN di <Card>: ListSkeleton di
          bawah punya <span className="sr-only"> sendiri yang harus tetap
          terjangkau pembaca layar -- membungkusnya dalam ancestor
          aria-hidden akan ikut membisukannya. */}
      <CardHeader aria-hidden="true">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent>
        <ListSkeleton />
      </CardContent>
    </Card>
  );
}
