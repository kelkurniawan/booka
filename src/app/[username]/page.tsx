import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarOff } from "lucide-react";

import { BookingPageShell } from "@/components/booking-page/page-shell";
import { BookingProfileHeader } from "@/components/booking-page/profile-header";
import { BookingServiceCard } from "@/components/booking-page/service-card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ROUTES } from "@/lib/routes";
import { createPublicClient } from "@/lib/supabase/server";
import { resolveTheme } from "@/lib/theme/resolve";
import type { MerchantTheme, PublicMerchant } from "@/types/database";

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

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select(
      "id, username, full_name, bio, avatar_url, subscription_tier, merchant_themes(*)",
    )
    .eq("username", username)
    .maybeSingle();

  // Gagal ambil data (mis. koneksi database, atau grant kolom yang suatu saat
  // berubah) HARUS beda dari "merchant ini memang tidak ada" — kalau
  // ditelan jadi notFound(), pelanggan mengira usernamenya salah padahal
  // sistemnya yang sedang gangguan. Dilempar supaya ditangani error boundary
  // terdekat, bukan dikembalikan sebagai null.
  if (merchantError) {
    console.error("[booking-page] gagal memuat profil merchant", {
      username,
      error: merchantError,
    });
    throw new Error("Gagal memuat profil merchant.");
  }

  // `username is null` mustahil lolos policy `merchants_public_read`, tapi
  // dijaga juga di sini kalau suatu saat policy-nya berubah. Ini kondisi
  // "baris memang tidak ada", bukan error — tetap jadi notFound() di caller.
  if (!merchant || !merchant.username) {
    return null;
  }

  // Menyalin ulang `username` di sini (bukan `...merchant` polos) supaya
  // TypeScript mempertahankan hasil narrowing di atas: field-nya sudah
  // dipastikan bukan null, jadi konsumen di bawah tidak perlu non-null
  // assertion.
  const onboardedMerchant: OnboardedMerchant = { ...merchant, username: merchant.username };

  // Relasi satu-ke-satu: PostgREST mengembalikan objek atau null, tapi sebagian
  // versi mengembalikan array satu elemen. Keduanya dinormalkan sekali di sini
  // supaya konsumen di bawah tidak perlu tahu bedanya.
  const themeRaw = (merchant as { merchant_themes?: MerchantTheme | MerchantTheme[] | null })
    .merchant_themes;
  const themeRow = Array.isArray(themeRaw) ? (themeRaw[0] ?? null) : (themeRaw ?? null);

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

  // Sama alasannya dengan merchant di atas: kalau query-nya gagal, itu bukan
  // "merchant belum atur layanan/jam kerja" — jangan sampai jatuh ke keadaan
  // "belum menerima pesanan" seakan-akan itu pilihan merchant.
  if (servicesResult.error) {
    console.error("[booking-page] gagal memuat layanan", {
      username,
      error: servicesResult.error,
    });
    throw new Error("Gagal memuat layanan merchant.");
  }
  if (availabilityResult.error) {
    console.error("[booking-page] gagal memuat jam kerja", {
      username,
      error: availabilityResult.error,
    });
    throw new Error("Gagal memuat jam kerja merchant.");
  }

  return {
    merchant: onboardedMerchant,
    theme: resolveTheme(onboardedMerchant.subscription_tier, themeRow),
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

  const { merchant, theme, services, availability } = data;
  const name = merchant.full_name ?? merchant.username;
  const canAcceptBookings = services.length > 0 && availability.length > 0;

  return (
    <BookingPageShell theme={theme}>
      <BookingProfileHeader
        name={name}
        bio={merchant.bio}
        avatarUrl={merchant.avatar_url}
      />

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
              <BookingServiceCard key={service.id} service={service} />
            ))}
          </ul>

          <BookingSeam
            merchantId={merchant.id}
            username={merchant.username}
            services={services}
            availability={availability}
          />
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
    </BookingPageShell>
  );
}
