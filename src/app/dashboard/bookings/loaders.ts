import { channelLabel } from "@/lib/analytics/funnel";
import { createClient } from "@/lib/supabase/server";

import { BOOKING_LIST_COLUMNS, type BookingListItem } from "./booking-state";
import type { TimelineNotification } from "./booking-timeline";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Booking untuk panel `?b=`; null bila bukan uuid, tak ditemukan, atau milik merchant lain. */
export async function loadSelectedBooking(rawId: string | undefined, merchantId: string): Promise<BookingListItem | null> {
  if (!rawId || !UUID_RE.test(rawId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_LIST_COLUMNS)
    .eq("id", rawId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error) {
    console.error("[dashboard/bookings] gagal memuat booking terpilih", { merchantId, error });
    return null;
  }
  return (data as unknown as BookingListItem | null) ?? null;
}

/** Asal booking untuk panel; null bila tak ada atribusi. */
export async function loadOrigin(bookingId: string, merchantId: string): Promise<{ label: string; adLinkName: string | null } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("ad_link_id, utm_source, referrer_host")
    .eq("id", bookingId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[dashboard/bookings] gagal memuat asal booking", { merchantId, bookingId, error });
    return null;
  }
  let adLinkName: string | null = null;
  let channel: string | null = data.utm_source;
  if (data.ad_link_id) {
    const { data: link } = await supabase
      .from("ad_links")
      .select("name, channel")
      .eq("id", data.ad_link_id)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    adLinkName = link?.name ?? null;
    channel = link?.channel ?? channel;
  }
  if (!channel && !data.referrer_host && !adLinkName) return null;
  return { label: channelLabel(channel), adLinkName };
}

/** Riwayat pesan satu booking; null bila gagal dimuat. */
export async function loadNotifications(bookingId: string, merchantId: string): Promise<TimelineNotification[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_log")
    .select("kind, channel, status, created_at")
    .eq("booking_id", bookingId)
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[dashboard/bookings] gagal memuat riwayat pesan", { merchantId, bookingId, error });
    return null;
  }
  return data;
}
