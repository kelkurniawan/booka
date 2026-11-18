import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { requireMerchant } from "@/lib/auth/session";
import { ENVIRONMENT_LABEL } from "@/lib/booking/court-ui";
import { isoDayOfWeek, jakartaDateISO, jakartaWallClockToUtc } from "@/lib/booking/slots";
import { formatLongDate } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { cancelBooking, decideRequest, markAttendance, markPaidOnSite, rescheduleBooking } from "../bookings/actions";
import { BookingDetailPanel } from "../bookings/booking-detail-panel";
import { BookingDetailShell } from "../bookings/booking-detail-shell";
import { loadNotifications, loadOrigin, loadSelectedBooking } from "../bookings/loaders";
import {
  buildScheduleGrid,
  countsText,
  gridHours,
  holdsSlot,
  peakMatcher,
  shiftDateISO,
  type ScheduleBooking,
} from "./schedule-grid";
import { CourtsManager } from "./courts-manager";
import { ScheduleLegend, ScheduleView } from "./schedule-view";

export const metadata: Metadata = { title: "Jadwal lapangan" };

const TABS = [
  { key: "jadwal", label: "Jadwal" },
  { key: "lapangan", label: "Daftar lapangan" },
] as const;

function parseDate(raw: string | undefined, todayISO: string): string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return todayISO;
  return jakartaDateISO(new Date(`${raw}T12:00:00+07:00`)) === raw ? raw : todayISO;
}

async function loadDay(merchantId: string, dateISO: string) {
  const supabase = await createClient();
  const dow = isoDayOfWeek(dateISO);
  const dayStart = jakartaWallClockToUtc(dateISO, "00:00").toISOString();
  const dayEnd = new Date(Date.parse(dayStart) + 86_400_000).toISOString();
  const [courts, services, windows, rules, bookings] = await Promise.all([
    supabase.from("courts").select("id, name, environment, is_active").eq("merchant_id", merchantId).order("sort_order").order("name"),
    supabase.from("services").select("id, court_unit_minutes").eq("merchant_id", merchantId).not("court_unit_minutes", "is", null).eq("is_active", true),
    supabase.from("availability").select("start_time, end_time").eq("merchant_id", merchantId).eq("day_of_week", dow),
    supabase.from("court_price_rules").select("start_time, end_time").eq("merchant_id", merchantId).eq("day_of_week", dow),
    supabase
      .from("bookings")
      .select("id, court_id, customer_name, start_datetime, end_datetime, status, amount_due_on_site, paid_on_site_at, expires_at")
      .eq("merchant_id", merchantId)
      .not("court_id", "is", null)
      .gte("start_datetime", dayStart)
      .lt("start_datetime", dayEnd),
  ]);
  const error = courts.error ?? services.error ?? windows.error ?? rules.error ?? bookings.error;
  if (error) throw error;
  return {
    courts: courts.data ?? [],
    services: services.data ?? [],
    windows: windows.data ?? [],
    rules: rules.data ?? [],
    bookings: bookings.data ?? [],
  };
}

export default async function CourtsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; date?: string; b?: string }>;
}) {
  const raw = await searchParams;
  const { user, merchant } = await requireMerchant();
  const tab = raw.tab === "lapangan" ? "lapangan" : "jadwal";
  const todayISO = jakartaDateISO(new Date());
  const dateISO = parseDate(raw.date, todayISO);
  const dateHref = (d: string) => `${ROUTES.courts}?date=${d}`;

  const header = (
    <PageHeader
      title="Jadwal lapangan"
      action={
        <Link
          href={ROUTES.newBooking}
          data-tour="court-add-manual"
          className="bg-primary text-primary-foreground inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium"
        >
          Booking manual
        </Link>
      }
    />
  );
  const tabs = (
    <div role="tablist" aria-label="Tampilan lapangan" data-tour="court-tabs" className="flex gap-1 border-b">
      {TABS.map((t) => (
        <Link
          key={t.key}
          role="tab"
          aria-selected={tab === t.key}
          href={t.key === "jadwal" ? ROUTES.courts : `${ROUTES.courts}?tab=lapangan`}
          className={cn(
            "inline-flex h-11 items-center border-b-2 px-3 text-sm",
            tab === t.key ? "border-foreground font-semibold" : "text-muted-foreground border-transparent",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );

  if (tab === "lapangan") {
    const supabase = await createClient();
    const [courts, media, areas, markers] = await Promise.all([
      supabase
        .from("courts")
        .select("id, name, sport, environment, surface, description, features, is_active, pos_x, pos_y, rotation")
        .eq("merchant_id", user.id)
        .order("sort_order")
        .order("name"),
      supabase.from("court_media").select("id, court_id, path, alt_text, width, height").eq("merchant_id", user.id).order("sort_order").order("created_at"),
      supabase.from("venue_areas").select("*").eq("merchant_id", user.id).order("sort_order"),
      supabase.from("venue_markers").select("*").eq("merchant_id", user.id).order("sort_order"),
    ]);
    const error = courts.error ?? media.error ?? areas.error ?? markers.error;
    if (error) {
      console.error("[dashboard/lapangan] gagal memuat daftar lapangan", { merchantId: user.id, error });
      return (
        <>
          {header}
          {tabs}
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <span className="flex-1">Daftar lapangan gagal dimuat. Periksa koneksi, lalu coba lagi.</span>
            <Link href={`${ROUTES.courts}?tab=lapangan`} className="inline-flex h-11 items-center rounded-lg border border-red-800 bg-white px-3">
              Coba lagi
            </Link>
          </div>
        </>
      );
    }
    return (
      <>
        {header}
        {tabs}
        <CourtsManager
          merchantId={user.id}
          initialCourts={(courts.data ?? []).map((c) => ({ ...c, photos: (media.data ?? []).filter((m) => m.court_id === c.id) }))}
          areas={areas.data ?? []}
          markers={markers.data ?? []}
        />
      </>
    );
  }

  let day: Awaited<ReturnType<typeof loadDay>>;
  try {
    day = await loadDay(user.id, dateISO);
  } catch (error) {
    console.error("[dashboard/lapangan] gagal memuat jadwal", { merchantId: user.id, error });
    return (
      <>
        {header}
        {tabs}
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span className="flex-1">Jadwal gagal dimuat. Periksa koneksi, lalu coba lagi.</span>
          <Link href={dateHref(dateISO)} className="inline-flex h-11 items-center rounded-lg border border-red-800 bg-white px-3">
            Coba lagi
          </Link>
        </div>
      </>
    );
  }

  if (day.courts.length === 0) {
    return (
      <>
        {header}
        {tabs}
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed p-8">
          <strong>Belum ada lapangan</strong>
          <span className="text-muted-foreground text-sm">
            Tambahkan lapangan dulu, lalu kaitkan ke layanan sewa supaya pelanggan bisa memesan.
          </span>
          <Link href={`${ROUTES.courts}?tab=lapangan`} className="bg-primary text-primary-foreground inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium">
            Tambah lapangan
          </Link>
        </div>
      </>
    );
  }

  const nowMs = new Date().getTime();
  const bookings: ScheduleBooking[] = day.bookings
    .filter((b) => holdsSlot({ status: b.status, expiresAt: b.expires_at }, nowMs))
    .map((b) => ({
      id: b.id,
      courtId: b.court_id!,
      customerName: b.customer_name,
      startISO: b.start_datetime,
      endISO: b.end_datetime,
      status: b.status,
      amountDueOnSite: b.amount_due_on_site,
      paidOnSiteAt: b.paid_on_site_at,
    }));
  // Lapangan nonaktif hanya tampil bila hari itu masih punya booking.
  const used = new Set(bookings.map((b) => b.courtId));
  const courts = day.courts
    .filter((c) => c.is_active || used.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, note: ENVIRONMENT_LABEL[c.environment] }));
  const rowMinutes = day.services.some((s) => s.court_unit_minutes === 30) ? 30 : 60;
  const { startHour, endHour } = gridHours(day.windows);
  const grid = buildScheduleGrid({
    courts,
    bookings,
    startHour,
    endHour,
    rowMinutes,
    peak: peakMatcher(day.rules.map((r) => ({ start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) }))),
  });

  const selected = await loadSelectedBooking(raw.b, user.id);
  const [notifications, origin] = selected
    ? await Promise.all([loadNotifications(selected.id, user.id), loadOrigin(selected.id, user.id)])
    : [null, null];

  const navBtn = "inline-flex size-11 items-center justify-center rounded-lg border";
  return (
    <>
      {header}
      <p className="text-muted-foreground -mt-4 text-sm">
        <span className="md:hidden">{countsText(grid.counts)}</span>
        <span className="hidden md:inline">{countsText(grid.counts, courts.length)}</span>
      </p>
      <div data-tour="court-date-nav" className="flex flex-wrap items-center gap-1.5">
        <Link href={dateHref(shiftDateISO(dateISO, -1))} aria-label="Hari sebelumnya" className={navBtn}>
          <ChevronLeft className="size-4" />
        </Link>
        <span className="min-w-40 text-center font-semibold">{formatLongDate(`${dateISO}T12:00:00+07:00`).replace(/ \d{4}$/, "")}</span>
        <Link href={dateHref(shiftDateISO(dateISO, 1))} aria-label="Hari berikutnya" className={navBtn}>
          <ChevronRight className="size-4" />
        </Link>
        <Link href={dateHref(todayISO)} className="inline-flex h-11 items-center rounded-lg border px-3 text-sm">
          Hari ini
        </Link>
      </div>
      {tabs}
      <ScheduleLegend />
      <p className="text-muted-foreground text-xs md:hidden">
        Geser ke samping untuk lapangan lain. Ketuk jam kosong untuk menambah booking.
      </p>
      <div className={selected ? "lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6" : undefined}>
        <ScheduleView grid={grid} rowMinutes={rowMinutes} dateISO={dateISO} selectedId={selected?.id ?? null} />
        {selected ? (
          <BookingDetailShell closeHref={dateHref(dateISO)}>
            <BookingDetailPanel
              key={selected.id}
              booking={selected}
              nowMs={nowMs}
              username={merchant.username}
              notifications={notifications}
              origin={origin}
              labels={{ markPaid: "Tandai sisa sudah dibayar", whatsapp: "Kirim WhatsApp" }}
              actions={{
                cancel: cancelBooking,
                decide: decideRequest,
                markPaid: markPaidOnSite,
                attend: markAttendance,
                reschedule: rescheduleBooking,
              }}
            />
          </BookingDetailShell>
        ) : null}
      </div>
    </>
  );
}
