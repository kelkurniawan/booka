import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ROUTES } from "@/lib/routes";
import { createPublicClient } from "@/lib/supabase/server";
import { resolveTheme } from "@/lib/theme/resolve";
import { DEFAULT_PAYMENT_SETTINGS, type PaymentSettings } from "@/lib/booking/payment-mode";
import { loadPublicStaff, type PublicStaff } from "@/lib/booking/staff";
import type {
  MerchantTheme,
  PublicBanner,
  PublicMerchant,
  PublicVoucher,
  Service,
  ServiceMedia,
} from "@/types/database";

import { VOUCHER_CODE_PATTERN } from "@/lib/booking/voucher";

import { BookingPageView } from "./booking-page-view";
import { resolveEntry } from "./entry";
import { PixelScripts } from "@/components/booking-page/pixel-scripts";
import { FunnelTracker } from "./funnel-tracker";
import type { RestaurantInfo } from "./booking-flow";

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

  const [servicesResult, availabilityResult, faqsResult, settingsResult, linksResult, contactsResult] = await Promise.all([
    supabase
      .from("services")
      .select("*, service_media(*)")
      .eq("merchant_id", onboardedMerchant.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("availability").select("*").eq("merchant_id", onboardedMerchant.id),
    supabase
      .from("merchant_faqs")
      .select("*")
      .eq("merchant_id", onboardedMerchant.id)
      .order("sort_order", { ascending: true }),
    // Anon hanya boleh membaca kolom ini.
    supabase
      .from("merchant_settings")
      .select("allow_pay_on_site, auto_confirm_on_site, table_mode, table_hold_minutes")
      .eq("merchant_id", onboardedMerchant.id)
      .maybeSingle(),
    // Anon hanya melihat tautan tampil; kontak lewat fungsi yang menghormati contact_hidden.
    supabase
      .from("merchant_links")
      .select("id, label, url")
      .eq("merchant_id", onboardedMerchant.id)
      .order("sort_order", { ascending: true }),
    supabase.rpc("get_public_contacts", { p_merchant_id: onboardedMerchant.id }),
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
  // FAQ yang hilang karena gangguan database tidak boleh terlihat sama dengan
  // merchant yang memang belum mengisi FAQ -- yang pertama menyembunyikan
  // masalah, yang kedua memang pilihan merchant.
  if (faqsResult.error) {
    console.error("[booking-page] gagal memuat FAQ", {
      username,
      error: faqsResult.error,
    });
    throw new Error("Gagal memuat FAQ merchant.");
  }

  // `service_media` datang menempel di tiap baris layanan lewat embedding.
  // Dipisah di sini supaya BookingSeam tetap menerima Service[] polos dan
  // tanda tangannya tidak ikut berubah.
  const servicesWithMedia = (servicesResult.data ?? []) as (Service & {
    service_media?: ServiceMedia[] | null;
  })[];
  const mediaByService: Record<string, ServiceMedia[]> = {};
  const services: Service[] = servicesWithMedia.map(
    ({ service_media, ...service }) => {
      mediaByService[service.id] = service_media ?? [];
      return service;
    },
  );

  // Staf dibaca SETELAH tiga query di atas lolos: halaman tanpa layanan atau
  // jam kerja tidak butuh staf, dan merchant non-Studio tidak memicu query.
  let staff: PublicStaff[];
  try {
    staff = await loadPublicStaff(supabase, onboardedMerchant.id, onboardedMerchant.subscription_tier);
  } catch (error) {
    console.error("[booking-page] gagal memuat staf", { username, error });
    throw new Error("Gagal memuat staf merchant.");
  }

  // Tanpa baris atau gagal baca: pakai bawaan. Label hanya petunjuk; server
  // yang menentukan hasil akhir saat booking dibuat.
  const settings = !settingsResult.error ? settingsResult.data : null;
  const paymentSettings: PaymentSettings = settings
    ? {
        allow_pay_on_site: settings.allow_pay_on_site,
        auto_confirm_on_site: settings.auto_confirm_on_site,
      }
    : DEFAULT_PAYMENT_SETTINGS;

  // Area hanya dimuat di mode denah; gagal baca dianggap tanpa pilihan area.
  const restaurant: RestaurantInfo = {
    tableMode: settings?.table_mode ?? "NONE",
    holdMinutes: settings?.table_hold_minutes ?? 15,
    areas: [],
  };
  if (restaurant.tableMode === "TABLE") {
    const { data: areas, error: areasError } = await supabase
      .from("dining_areas")
      .select("id, name")
      .eq("merchant_id", onboardedMerchant.id)
      .order("sort_order")
      .order("name");
    if (areasError) console.error("[booking-page] gagal memuat area", { username, error: areasError });
    else restaurant.areas = areas ?? [];
  }

  // Promo bukan isi wajib halaman: gagal baca dicatat lalu dianggap kosong.
  // Merchant Starter tidak punya promo, jadi tidak memicu query.
  let banners: PublicBanner[] = [];
  let vouchers: PublicVoucher[] = [];
  if (onboardedMerchant.subscription_tier !== "STARTER") {
    const [bannersResult, vouchersResult] = await Promise.all([
      supabase
        .from("merchant_banners")
        .select(
          "id, merchant_id, source, tag_text, title, body, color, image_path, alt_text, cta_text, target_kind, target_voucher_id, target_service_id, target_url, starts_at, ends_at, sort_order",
        )
        .eq("merchant_id", onboardedMerchant.id)
        .order("sort_order", { ascending: true })
        // anon tidak punya hak kolom created_at; id cukup sebagai pemecah seri yang stabil.
        .order("id", { ascending: true })
        .limit(3),
      supabase.rpc("public_vouchers", { p_merchant_id: onboardedMerchant.id }),
    ]);
    if (bannersResult.error) {
      console.error("[booking-page] gagal memuat banner", { username, error: bannersResult.error });
    } else {
      banners = bannersResult.data ?? [];
    }
    if (vouchersResult.error) {
      console.error("[booking-page] gagal memuat voucher", { username, error: vouchersResult.error });
    } else {
      vouchers = vouchersResult.data ?? [];
    }
  }

  // Tautan dan ikon sosial pelengkap: gagal baca dicatat, halaman tetap jalan.
  if (linksResult.error) console.error("[booking-page] gagal memuat tautan", { username, error: linksResult.error });
  if (contactsResult.error) console.error("[booking-page] gagal memuat kontak", { username, error: contactsResult.error });
  const links = linksResult.error ? [] : (linksResult.data ?? []);
  const contacts = themeRow?.show_social_icons === false ? null : (contactsResult.data?.[0] ?? null);

  return {
    links,
    contacts,
    banners,
    vouchers,
    paymentSettings,
    restaurant,
    merchant: onboardedMerchant,
    staff,
    theme: resolveTheme(onboardedMerchant.subscription_tier, themeRow),
    services,
    mediaByService,
    availability: availabilityResult.data ?? [],
    faqs: faqsResult.data ?? [],
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

  const description = merchant.bio ?? `Pesan jadwal ${name} lewat Marky.`;

  // `openGraph` di halaman MENGGANTI milik layout (bukan digabung), jadi
  // siteName dan locale diulang di sini. Gambarnya datang dari
  // opengraph-image.tsx di folder ini.
  return {
    title: name,
    description,
    alternates: { canonical: ROUTES.merchantPage(merchant.username) },
    openGraph: {
      title: name,
      description,
      siteName: "Marky",
      locale: "id_ID",
      type: "profile",
      url: ROUTES.merchantPage(merchant.username),
    },
  };
}

export default async function MerchantPublicPage({
  params,
  searchParams,
}: {
  params: Promise<MerchantPageParams>;
  searchParams: Promise<{ t?: string | string[]; kode?: string | string[] }>;
}) {
  const { username } = await params;
  const query = await searchParams;
  const data = await getMerchantPageData(username);

  if (!data) {
    notFound();
  }

  const { merchant, staff, theme, services, mediaByService, availability, faqs, paymentSettings, restaurant, banners, vouchers, links, contacts } =
    data;

  // Tautan iklan (?t=) dan kode manual (?kode=); kode di URL menang atas voucher tautan.
  const slug = typeof query.t === "string" ? query.t.trim().toLowerCase() : "";
  let link: { serviceId: string | null; voucherCode: string | null } | null = null;
  if (/^[a-z0-9-]{3,40}$/.test(slug)) {
    const { data: rows } = await createPublicClient().rpc("resolve_ad_link", {
      p_username: username,
      p_slug: slug,
    });
    const row = rows?.[0];
    if (row) link = { serviceId: row.service_id, voucherCode: row.voucher_code };
  }
  const kode = typeof query.kode === "string" ? query.kode.trim().toUpperCase() : "";
  if (VOUCHER_CODE_PATTERN.test(kode)) link = { serviceId: link?.serviceId ?? null, voucherCode: kode };
  const entry = resolveEntry(link, services, null);

  // ID pixel aktif; gagal baca = tanpa pixel (halaman tetap jalan).
  const { data: trackingRows } = await createPublicClient().rpc("get_public_tracking", {
    p_merchant_id: merchant.id,
  });
  const tracking = trackingRows?.[0];

  return (
    <>
    <FunnelTracker merchantId={merchant.id} />
    <PixelScripts
      ids={{ meta: tracking?.meta_pixel_id, tiktok: tracking?.tiktok_pixel_id, ga4: tracking?.ga4_measurement_id }}
    />
    <BookingPageView
      entry={entry}
      merchant={merchant}
      theme={theme}
      services={services}
      mediaByService={mediaByService}
      availability={availability}
      staff={staff}
      faqs={faqs}
      paymentSettings={paymentSettings}
      restaurant={restaurant}
      banners={banners}
      vouchers={vouchers}
      links={links}
      contacts={contacts}
    />
    </>
  );
}
