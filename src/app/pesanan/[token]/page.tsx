import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { contactLinks, contactWhatsappText, replyHoursLabel, type ContactSettings } from "@/lib/booking/contact";
import {
  bookingCode,
  DEFAULT_MANAGE_SETTINGS,
  manageState,
  policyLines,
  type ManageSettings,
} from "@/lib/booking/customer-manage";
import { clientEnv } from "@/lib/env/client";
import { ROUTES } from "@/lib/routes";
import { REMINDER_TIERS } from "@/lib/notify/reminder-plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTheme } from "@/lib/theme/resolve";
import type { BookingReminderPrefs, MerchantSettings, MerchantTheme, SubscriptionTier } from "@/types/database";

import { PushPrompt } from "./push-prompt";
import { BookingStatusView, type BookingPageRow, type ReminderView } from "./booking-status-view";

/**
 * I3 -- halaman ini TIDAK PERNAH boleh disajikan dari full route cache
 * Next.js. Uangnya sudah berpindah (DP masuk ke akun payment gateway
 * merchant) begitu status booking jadi PAID -- kalau halaman ini kebetulan
 * ter-cache dari render sebelum pembayaran masuk, pelanggan yang membuka
 * tautannya lagi setelah membayar bisa melihat versi basi yang masih bilang
 * "menunggu pembayaran" (atau lebih parah: kode QR yang mengundang
 * dipindai lagi, lihat I4), dan itu bisa bertahan sampai revalidasi
 * berikutnya alih-alih ikut router.refresh() pelanggan itu sendiri.
 */
export const dynamic = "force-dynamic";

type BookingPageParams = { token: string };

/**
 * Kolom `bookings` yang boleh terbaca sampai ke halaman ini -- EKSPLISIT,
 * bukan `select("*")` (AGENTS.md). `access_token` SENGAJA TIDAK ada di
 * daftar ini: itu rahasia yang cuma boleh dipakai sebagai filter `WHERE`,
 * tidak pernah ikut terbaca ke dalam baris hasil query yang sebagian
 * propnya nanti diteruskan ke komponen client di bawah.
 */
const BOOKING_COLUMNS =
  "id, merchant_id, service_name, service_price, start_datetime, end_datetime, customer_name, status, payment_url, paid_at, cancelled_at, cancel_reason, expires_at, payment_mode, amount_due_now, amount_due_on_site, paid_on_site_at, service_id, staff_id, attended_at, no_show_at, reschedule_count, customer_whatsapp" as const;

const SETTINGS_COLUMNS =
  "allow_customer_reschedule, reschedule_min_hours, max_reschedules, allow_customer_cancel, cancel_min_hours, policy_text, contact_phone, contact_email, contact_instagram, contact_threads, contact_x, contact_tiktok, contact_hidden, reply_from, reply_until, reminder_whatsapp, reminder_email, reminder_push, reminder_day_before, reminder_same_day" as const;

type SettingsRow = ManageSettings & ContactSettings & Pick<MerchantSettings, "reminder_whatsapp" | "reminder_email" | "reminder_push" | "reminder_day_before" | "reminder_same_day">;

// Default migration: WhatsApp, email, dan push menyala; hanya H-1.
const DEFAULT_REMINDER_SETTINGS = {
  reminder_whatsapp: true, reminder_email: true, reminder_push: true, reminder_day_before: true, reminder_same_day: false,
};

const DEFAULT_CONTACT_SETTINGS: ContactSettings = {
  contact_phone: null, contact_email: null, contact_instagram: null, contact_threads: null,
  contact_x: null, contact_tiktok: null, contact_hidden: [], reply_from: null, reply_until: null,
};

type MerchantInfo = {
  username: string | null;
  whatsapp_number: string | null;
  full_name: string | null;
  subscription_tier: SubscriptionTier;
  merchant_themes?: MerchantTheme | MerchantTheme[] | null;
};

/**
 * `createAdminClient()` (service role, melewati RLS) -- halaman ini dibuka
 * TANPA sesi (pelanggan tidak login), dan satu-satunya yang mengunci baris
 * adalah `access_token` di URL itu sendiri (kolomnya unik). Merchant diambil
 * lewat query TERPISAH difilter `merchant_id` dari baris booking (bukan
 * join implisit) -- lihat AGENTS.md soal setiap query admin client wajib
 * memfilter merchant_id secara eksplisit.
 *
 * Dibungkus `cache()` supaya `generateMetadata` dan komponen halaman yang
 * sama-sama memanggil ini dalam satu request tidak menembak database dua
 * kali (pola sama seperti `getMerchantPageData` di src/app/[username]/page.tsx).
 */
const getBookingPageData = cache(async (token: string) => {
  const admin = createAdminClient();

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("access_token", token)
    .maybeSingle<BookingPageRow & { customer_whatsapp: string }>();

  // Query gagal (bukan "token salah") HARUS beda dari "booking ini memang
  // tidak ada" -- kalau ditelan jadi notFound(), pelanggan yang tautannya
  // sebenarnya valid mengira booking-nya hilang padahal sistemnya yang
  // sedang gangguan. Dilempar supaya ditangani error boundary terdekat --
  // alasan yang sama dengan src/app/[username]/page.tsx.
  if (bookingError) {
    console.error("[pesanan-page] gagal memuat booking", { error: bookingError });
    throw new Error("Gagal memuat data booking.");
  }
  if (!booking) {
    return null;
  }

  const { data: merchant, error: merchantError } = await admin
    .from("merchants")
    .select("username, whatsapp_number, full_name, subscription_tier, merchant_themes(*)")
    .eq("id", booking.merchant_id)
    .maybeSingle<MerchantInfo>();

  if (merchantError) {
    console.error("[pesanan-page] gagal memuat merchant", {
      merchantId: booking.merchant_id,
      error: merchantError,
    });
    throw new Error("Gagal memuat data merchant.");
  }
  if (!merchant) {
    // bookings.merchant_id merujuk ke merchants.id (not null) -- baris ini
    // seharusnya mustahil tidak ada. Tetap dianggap error (bukan
    // notFound()) kalau suatu saat terjadi: ini kerusakan data, bukan
    // "pelanggan salah ketik token".
    console.error("[pesanan-page] merchant booking tidak ditemukan", {
      merchantId: booking.merchant_id,
    });
    throw new Error("Data merchant untuk booking ini tidak ditemukan.");
  }

  // Dihitung di sini (fungsi pengambil data biasa), BUKAN di body komponen
  // halaman -- react-hooks/purity melarang memanggil Date.now() langsung
  // saat render. PENDING yang tenggatnya sudah lewat diperlakukan sama
  // seperti CANCELLED: cron pembatalan mungkin belum sempat jalan, tapi
  // pelanggan yang membuka tautan ini setelah waktunya habis tidak boleh
  // terus melihat "menunggu pembayaran".
  const nowMs = Date.now();
  const isExpiredPending =
    (booking.status === "PENDING" || booking.status === "REQUESTED") && nowMs >= new Date(booking.expires_at).getTime();

  // Query tambahan gagal -> default, halaman booking tetap tampil. Semua difilter merchant_id.
  const [settingsRes, prefsRes, pushRes] = await Promise.all([
    admin.from("merchant_settings").select(SETTINGS_COLUMNS).eq("merchant_id", booking.merchant_id).maybeSingle<SettingsRow>(),
    admin
      .from("booking_reminder_prefs")
      .select("whatsapp, email, day_before, same_day")
      .eq("merchant_id", booking.merchant_id)
      .eq("booking_id", booking.id)
      .maybeSingle<Pick<BookingReminderPrefs, "whatsapp" | "email" | "day_before" | "same_day">>(),
    admin
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", booking.merchant_id)
      .eq("booking_id", booking.id),
  ]);
  for (const [name, res] of [["merchant_settings", settingsRes], ["booking_reminder_prefs", prefsRes], ["push_subscriptions", pushRes]] as const) {
    if (res.error) console.error(`[pesanan-page] gagal memuat ${name}`, { merchantId: booking.merchant_id, error: res.error });
  }
  const settings: SettingsRow = settingsRes.data ?? { ...DEFAULT_MANAGE_SETTINGS, ...DEFAULT_CONTACT_SETTINGS, ...DEFAULT_REMINDER_SETTINGS };
  const prefs = prefsRes.data;
  const hasPush = (pushRes.count ?? 0) > 0;

  // customer_whatsapp tetap di server (Task 9: 4 digit terakhir), tidak ikut ke tampilan.
  const { customer_whatsapp: customerWhatsapp, ...bookingRow } = booking;
  void customerWhatsapp;

  const merchantName = merchant.full_name ?? merchant.username ?? "Merchant";
  const code = bookingCode(booking.id);
  // Keputusan 17: kanal efektif = dinyalakan merchant DAN dipilih pelanggan.
  const reminderOn = REMINDER_TIERS.includes(merchant.subscription_tier) &&
    (booking.status === "PAID" || booking.status === "CONFIRMED") &&
    (settings.reminder_whatsapp || settings.reminder_email || settings.reminder_push);
  const reminders: ReminderView | null = reminderOn
    ? {
        whatsapp: settings.reminder_whatsapp && (prefs?.whatsapp ?? true),
        email: settings.reminder_email && !!prefs?.email,
        push: settings.reminder_push && hasPush,
        channelsOffered: { whatsapp: settings.reminder_whatsapp, email: settings.reminder_email, push: settings.reminder_push },
        offsets: {
          dayBefore: prefs?.day_before ?? settings.reminder_day_before,
          sameDay: prefs?.same_day ?? settings.reminder_same_day,
        },
      }
    : null;
  const whatsappText = contactWhatsappText({
    merchantName, customerName: booking.customer_name, code, startISO: booking.start_datetime,
  });
  const links = contactLinks(merchant.whatsapp_number, settings, whatsappText);
  const contact = { ...links, replyHours: replyHoursLabel(settings) };
  const manage = manageState(bookingRow, settings, nowMs);
  const policy = policyLines(bookingRow, settings, merchantName);

  // merchant_themes bisa objek (relasi 1-1) atau array satu elemen; sama
  // seperti src/app/[username]/page.tsx.
  const themeRaw = merchant.merchant_themes;
  const themeRow = Array.isArray(themeRaw) ? (themeRaw[0] ?? null) : (themeRaw ?? null);
  const theme = resolveTheme(merchant.subscription_tier, themeRow);

  return { booking: bookingRow, merchant, merchantName, theme, isExpiredPending, code, manage, policy, contact, reminders };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<BookingPageParams>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await getBookingPageData(token);

  if (!data) {
    return { robots: { index: false, follow: false } };
  }

  // Judul netral -- SENGAJA tidak menyebut nama pelanggan/merchant. Halaman
  // ini berisi PII, jadi tidak boleh masuk indeks mesin pencari maupun
  // bocor lewat judul tab/riwayat browser yang bisa dilihat orang lain.
  return {
    title: "Status booking",
    manifest: ROUTES.bookingManifest(token),
    robots: { index: false, follow: false },
  };
}

export default async function BookingStatusPage({
  params,
}: {
  params: Promise<BookingPageParams>;
}) {
  const { token } = await params;
  const data = await getBookingPageData(token);

  if (!data) {
    notFound();
  }

  const { booking, merchant, merchantName, theme, isExpiredPending, code, manage, policy, contact, reminders } = data;
  const vapidPublicKey = clientEnv().vapidPublicKey;

  return (
    <BookingStatusView
      token={token}
      booking={booking}
      merchantName={merchantName}
      merchantUsername={merchant.username}
      theme={theme}
      isExpiredPending={isExpiredPending}
      code={code}
      manage={manage}
      policy={policy}
      contact={contact}
      reminders={reminders}
      pushPrompt={
        reminders?.channelsOffered.push && !reminders.push && vapidPublicKey ? (
          <PushPrompt token={token} bookingId={booking.id} vapidPublicKey={vapidPublicKey} offsets={reminders.offsets} />
        ) : null
      }
    />
  );
}
