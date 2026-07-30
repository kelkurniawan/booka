import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarOff } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatDuration, formatRupiah } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { createPublicClient } from "@/lib/supabase/server";
import type { PublicMerchant } from "@/types/database";

import { BookingSeam } from "./booking-seam";

type MerchantPageParams = { username: string };

/** `PublicMerchant` dengan `username` yang sudah dipastikan terisi. */
type OnboardedMerchant = Omit<PublicMerchant, "username"> & { username: string };

/**
 * Mengambil data halaman publik sebagai peran `anon` lewat `createPublicClient()`.
 * WAJIB klien ini, bukan `createClient()` — lihat docs/DECISIONS.md bagian 5:
 * kalau memakai klien bersesi, merchant yang sedang login bisa membaca profil
 * merchant lain lewat policy `authenticated`, yang tidak membatasi kolom
 * seperti `whatsapp_number`.
 *
 * Dibungkus `cache()` supaya `generateMetadata` dan komponen halaman yang
 * sama-sama memanggil ini dalam satu request tidak menembak database dua kali.
 */
const getMerchantPageData = cache(async (username: string) => {
  const supabase = createPublicClient();

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id, username, full_name, bio, avatar_url, subscription_tier")
    .eq("username", username)
    .maybeSingle();

  // `username is null` mustahil lolos policy `merchants_public_read`, tapi
  // dijaga juga di sini kalau suatu saat policy-nya berubah.
  if (!merchant || !merchant.username) {
    return null;
  }

  // Menyalin ulang `username` di sini (bukan `...merchant` polos) supaya
  // TypeScript mempertahankan hasil narrowing di atas: field-nya sudah
  // dipastikan bukan null, jadi konsumen di bawah tidak perlu non-null
  // assertion.
  const onboardedMerchant: OnboardedMerchant = { ...merchant, username: merchant.username };

  const [servicesResult, availabilityResult] = await Promise.all([
    supabase
      .from("services")
      .select("*")
      .eq("merchant_id", onboardedMerchant.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("availability").select("*").eq("merchant_id", onboardedMerchant.id),
  ]);

  return {
    merchant: onboardedMerchant,
    services: servicesResult.data ?? [],
    availability: availabilityResult.data ?? [],
  };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<MerchantPageParams>;
}): Promise<Metadata> {
  const { username } = await params;
  const data = await getMerchantPageData(username);

  if (!data) {
    return {};
  }

  const { merchant } = data;
  const name = merchant.full_name ?? merchant.username ?? username;

  return {
    title: name,
    description: merchant.bio ?? `Pesan jadwal ${name} lewat Booka.`,
  };
}

export default async function MerchantPublicPage({
  params,
}: {
  params: Promise<MerchantPageParams>;
}) {
  const { username } = await params;
  const data = await getMerchantPageData(username);

  if (!data) {
    notFound();
  }

  const { merchant, services, availability } = data;
  const name = merchant.full_name ?? merchant.username;
  const canAcceptBookings = services.length > 0 && availability.length > 0;

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-8 px-4 py-10">
      <header className="flex flex-col items-center gap-3 text-center">
        <Avatar size="lg" className="size-16">
          <AvatarImage src={merchant.avatar_url ?? undefined} alt={name ?? ""} />
          <AvatarFallback className="text-lg">
            {(name ?? "?").charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-balance">{name}</h1>
          {merchant.bio ? (
            <p className="text-muted-foreground text-sm text-pretty">{merchant.bio}</p>
          ) : null}
        </div>
      </header>

      {canAcceptBookings ? (
        <section aria-labelledby="layanan-heading" className="flex flex-col gap-4">
          <h2
            id="layanan-heading"
            className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.18em] uppercase"
          >
            Layanan
          </h2>

          <ul className="flex flex-col gap-3">
            {services.map((service) => (
              <li key={service.id} className="border-border flex flex-col gap-1 border p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-balance">{service.name}</span>
                  <span className="shrink-0 text-sm font-medium">
                    {formatRupiah(service.price)}
                  </span>
                </div>
                {service.description ? (
                  <p className="text-muted-foreground text-sm text-pretty">
                    {service.description}
                  </p>
                ) : null}
                <span className="text-muted-foreground text-xs">
                  {formatDuration(service.duration_minutes)}
                </span>
              </li>
            ))}
          </ul>

          <BookingSeam merchantId={merchant.id} username={merchant.username} services={services} />
        </section>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarOff />
            </EmptyMedia>
            <EmptyTitle>Belum menerima pesanan</EmptyTitle>
            <EmptyDescription>
              {name} belum mengatur layanan atau jam kerja. Coba kunjungi lagi nanti.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {merchant.subscription_tier === "STARTER" ? (
        <Link
          href={ROUTES.home}
          className="text-muted-foreground hover:text-foreground mt-auto self-center text-xs"
        >
          Dibuat dengan Booka
        </Link>
      ) : null}
    </div>
  );
}
