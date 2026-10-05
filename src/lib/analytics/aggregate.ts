import { jakartaDateISO, isoDayOfWeek } from "@/lib/booking/slots";
import type { BookingStatus } from "@/types/database";

export type AnalyticsBooking = {
  status: BookingStatus;
  service_name: string;
  service_price: number;
  created_at: string;
  paid_at: string | null;
  start_datetime: string;
  customer_whatsapp: string;
  /** Snapshot nama staf; null untuk booking tanpa staf. */
  staff_name?: string | null;
};

export type Bucket = "day" | "week" | "month";

export type SeriesPoint = { key: string; label: string; revenue: number; count: number };
export type Breakdown = { name: string; count: number; revenue: number };

export type AnalyticsSummary = {
  revenue: number;
  paidCount: number;
  createdCount: number;
  /** PAID dibagi semua booking yang dibuat di periode ini; null bila belum ada booking. */
  payRate: number | null;
  /** Porsi pelanggan berbayar yang membayar lebih dari sekali di periode ini. */
  repeatCustomerRate: number | null;
  series: SeriesPoint[];
  topServices: Breakdown[];
  byStaff: Breakdown[];
  /** Jumlah booking PAID per hari jadwal, indeks 0 = Senin .. 6 = Minggu. */
  byWeekday: number[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
export const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Senin dari minggu (WIB) tempat tanggal kalender ini berada. */
function mondayOf(dateISO: string): string {
  const back = isoDayOfWeek(dateISO) - 1;
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
}

function bucketKey(dateISO: string, bucket: Bucket): string {
  if (bucket === "day") return dateISO;
  if (bucket === "week") return mondayOf(dateISO);
  return dateISO.slice(0, 7);
}

function bucketLabel(key: string, bucket: Bucket): string {
  const [, m, d] = key.split("-").map(Number);
  if (bucket === "month") return `${MONTHS[m - 1]} ${key.slice(2, 4)}`;
  return `${d} ${MONTHS[m - 1]}`;
}

/**
 * Semua kunci bucket dari `from` sampai `to` (WIB), supaya periode tanpa
 * transaksi tetap tampil sebagai batang nol, bukan hilang dari sumbu.
 */
export function bucketKeys(from: Date, to: Date, bucket: Bucket): string[] {
  const keys: string[] = [];
  for (let t = from.getTime(); t < to.getTime(); t += DAY_MS) {
    const key = bucketKey(jakartaDateISO(new Date(t)), bucket);
    if (keys[keys.length - 1] !== key) keys.push(key);
  }
  return keys;
}

function sortBreakdown(map: Map<string, Breakdown>): Breakdown[] {
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.count - a.count);
}

/**
 * Fungsi murni: daftar booking -> ringkasan analitik untuk [from, to).
 *
 * Pendapatan dihitung dari booking PAID menurut `paid_at` (kapan uangnya
 * masuk), sedangkan tingkat bayar menurut `created_at` (dari semua pesanan
 * yang dibuat di periode ini, berapa yang dibayar). Hari tersibuk memakai
 * `start_datetime` -- kapan merchant benar-benar bekerja.
 */
export function aggregateBookings(
  bookings: AnalyticsBooking[],
  range: { from: Date; to: Date },
  bucket: Bucket,
): AnalyticsSummary {
  const fromMs = range.from.getTime();
  const toMs = range.to.getTime();
  const inRange = (iso: string | null) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= fromMs && t < toMs;
  };

  const series = new Map<string, SeriesPoint>(
    bucketKeys(range.from, range.to, bucket).map((key) => [
      key,
      { key, label: bucketLabel(key, bucket), revenue: 0, count: 0 },
    ]),
  );
  const services = new Map<string, Breakdown>();
  const staff = new Map<string, Breakdown>();
  const paymentsPerCustomer = new Map<string, number>();
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];

  let revenue = 0;
  let paidCount = 0;
  let createdCount = 0;
  let createdPaid = 0;

  for (const booking of bookings) {
    if (inRange(booking.created_at)) {
      createdCount += 1;
      if (booking.status === "PAID") createdPaid += 1;
    }

    if (booking.status !== "PAID" || !inRange(booking.paid_at)) continue;

    const price = Number(booking.service_price);
    revenue += price;
    paidCount += 1;

    const point = series.get(bucketKey(jakartaDateISO(new Date(booking.paid_at!)), bucket));
    if (point) {
      point.revenue += price;
      point.count += 1;
    }

    const service = services.get(booking.service_name) ?? { name: booking.service_name, count: 0, revenue: 0 };
    service.count += 1;
    service.revenue += price;
    services.set(booking.service_name, service);

    if (booking.staff_name) {
      const row = staff.get(booking.staff_name) ?? { name: booking.staff_name, count: 0, revenue: 0 };
      row.count += 1;
      row.revenue += price;
      staff.set(booking.staff_name, row);
    }

    paymentsPerCustomer.set(
      booking.customer_whatsapp,
      (paymentsPerCustomer.get(booking.customer_whatsapp) ?? 0) + 1,
    );
    byWeekday[isoDayOfWeek(jakartaDateISO(new Date(booking.start_datetime))) - 1] += 1;
  }

  const customers = paymentsPerCustomer.size;
  const repeaters = [...paymentsPerCustomer.values()].filter((n) => n > 1).length;

  return {
    revenue,
    paidCount,
    createdCount,
    payRate: createdCount > 0 ? createdPaid / createdCount : null,
    repeatCustomerRate: customers > 0 ? repeaters / customers : null,
    series: [...series.values()],
    topServices: sortBreakdown(services).slice(0, 5),
    byStaff: sortBreakdown(staff),
    byWeekday,
  };
}
