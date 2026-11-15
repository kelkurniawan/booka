import "server-only";

import { cache } from "react";

import { decideRequest, markAttendance } from "@/app/dashboard/bookings/actions";
import { BOOKING_LIST_COLUMNS, type BookingListItem } from "@/app/dashboard/bookings/booking-state";
import { Skeleton } from "@/components/ui/skeleton";
import { requireMerchant } from "@/lib/auth/session";
import { actionKind, onSiteTotals } from "@/lib/booking/dashboard";
import { jakartaDateISO, jakartaWallClockToUtc } from "@/lib/booking/slots";
import { createClient } from "@/lib/supabase/server";

import { ActionList } from "./action-list";
import { Agenda } from "./agenda";
import { OnSiteCard, WeekSummary } from "./side-cards";

const DAY_MS = 24 * 60 * 60 * 1000;

function LoadError({ name }: { name: string }) {
  return (
    <p role="alert" className="text-muted-foreground rounded-xl border p-4 text-sm">
      Gagal memuat {name}. Muat ulang halaman.
    </p>
  );
}

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true" className="space-y-3 rounded-xl border p-4">
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export const ActionSkeleton = () => <CardSkeleton rows={3} />;
export const AgendaSkeleton = () => <CardSkeleton rows={4} />;
export const SideSkeleton = () => <CardSkeleton rows={2} />;

const getActionRows = cache(async (merchantId: string): Promise<BookingListItem[] | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("bookings_in_tab", { p_tab: "ACTION" })
    .select(BOOKING_LIST_COLUMNS)
    .eq("merchant_id", merchantId)
    .order("start_datetime", { ascending: true });
  if (error) {
    console.error("bookings_in_tab(ACTION) gagal", { merchantId, error });
    return null;
  }
  return data as unknown as BookingListItem[];
});

/** Satu query untuk Agenda dan OnSiteCard; hari = kalender Asia/Jakarta. */
const getTodayRows = cache(async (merchantId: string): Promise<BookingListItem[] | null> => {
  const now = new Date();
  const todayISO = jakartaDateISO(now);
  const tomorrowISO = jakartaDateISO(new Date(now.getTime() + DAY_MS));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_LIST_COLUMNS)
    .eq("merchant_id", merchantId)
    .in("status", ["PAID", "CONFIRMED"])
    .gte("start_datetime", jakartaWallClockToUtc(todayISO, "00:00").toISOString())
    .lt("start_datetime", jakartaWallClockToUtc(tomorrowISO, "00:00").toISOString())
    .order("start_datetime", { ascending: true });
  if (error) {
    console.error("agenda hari ini gagal", { merchantId, error });
    return null;
  }
  return data as unknown as BookingListItem[];
});

export async function ActionSection() {
  const { user } = await requireMerchant();
  const rows = await getActionRows(user.id);
  if (!rows) return <LoadError name="daftar tindakan" />;
  const isPast = (b: BookingListItem) => actionKind(b) === "ATTENDANCE";
  return (
    <ActionList
      items={rows.filter((b) => !isPast(b)).slice(0, 5)}
      total={rows.length}
      pastUnmarked={rows.filter(isPast).length}
      onDecide={decideRequest}
    />
  );
}

export async function AgendaSection() {
  const nowMs = new Date().getTime();
  const { user } = await requireMerchant();
  const rows = await getTodayRows(user.id);
  if (!rows) return <LoadError name="agenda" />;
  return <Agenda rows={rows} nowMs={nowMs} onAttend={markAttendance} />;
}

export async function OnSiteSection() {
  const { user } = await requireMerchant();
  const rows = await getTodayRows(user.id);
  if (!rows) return <LoadError name="tagihan di tempat" />;
  return <OnSiteCard totals={onSiteTotals(rows)} />;
}

export async function WeekSection() {
  const { user } = await requireMerchant();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_week_summary");
  const row = data?.[0];
  if (error) console.error("dashboard_week_summary gagal", { merchantId: user.id, error });
  else if (!row) console.error("dashboard_week_summary tanpa baris", { merchantId: user.id });
  if (error || !row) {
    return <LoadError name="ringkasan 7 hari" />;
  }
  return (
    <WeekSummary
      summary={{
        bookings: row.bookings,
        online_revenue: Number(row.online_revenue),
        on_site_revenue: Number(row.on_site_revenue),
        no_show: row.no_show,
        attendance_marked: row.attendance_marked,
      }}
    />
  );
}
