import type { BookingListItem } from "../bookings/booking-state";

/** Baris contoh untuk story; semua nama fiktif. */
const BASE: BookingListItem = {
  id: "b-0",
  service_id: "s-1",
  service_name: "Potong Rambut",
  service_price: 100000,
  duration_minutes: 60,
  start_datetime: "2026-11-15T03:00:00Z",
  end_datetime: "2026-11-15T04:00:00Z",
  customer_name: "Contoh Pelanggan",
  customer_whatsapp: "+6281200000000",
  status: "PAID",
  payment_provider: null,
  payment_reference: null,
  paid_at: "2026-11-14T03:00:00Z",
  cancelled_at: null,
  cancel_reason: null,
  expires_at: "2026-11-15T09:00:00Z",
  staff_id: null,
  staff_name: null,
  created_at: "2026-11-14T02:00:00Z",
  payment_mode: "DEPOSIT",
  amount_due_now: 30000,
  amount_due_on_site: 70000,
  paid_on_site_at: null,
  paid_on_site_method: null,
  attended_at: null,
  no_show_at: null,
  source: "ONLINE",
  merchant_reschedule_count: 0,
  reschedule_count: 0,
  voucher_id: null,
  voucher_code: null,
  discount_amount: 0,
};

function row(id: string, over: Partial<BookingListItem>): BookingListItem {
  return { ...BASE, id, ...over };
}

// "Sekarang" fixture: 15 Nov 2026 10:30 WIB = 03:30 UTC.
export const NOW_MS = Date.parse("2026-11-15T03:30:00Z");

export const REQUEST_ROW = row("r-1", {
  status: "REQUESTED",
  customer_name: "Contoh Rina",
  service_name: "Sewa Studio",
  start_datetime: "2026-11-18T03:00:00Z",
  expires_at: "2026-11-16T09:00:00Z",
  payment_mode: "REQUEST",
  amount_due_now: 50000,
});
export const REQUEST_FREE_ROW = row("r-2", {
  ...REQUEST_ROW,
  customer_name: "Contoh Budi",
  amount_due_now: 0,
});
export const UNPAID_ROW = row("u-1", {
  status: "PENDING",
  customer_name: "Contoh Sari",
  start_datetime: "2026-11-17T03:00:00Z",
  expires_at: "2026-11-15T12:00:00Z",
  paid_at: null,
});

export const ACTION_ITEMS = [REQUEST_ROW, REQUEST_FREE_ROW, UNPAID_ROW];

export const AGENDA_ROWS = [
  row("a-1", {
    customer_name: "Contoh Dewi",
    start_datetime: "2026-11-15T01:00:00Z",
    attended_at: "2026-11-15T01:05:00Z",
    staff_name: "Contoh Andi",
  }),
  row("a-2", {
    customer_name: "Contoh Eko",
    start_datetime: "2026-11-15T02:00:00Z",
    no_show_at: "2026-11-15T03:00:00Z",
    payment_mode: "ON_SITE",
    amount_due_now: 0,
    amount_due_on_site: 100000,
  }),
  row("a-3", {
    customer_name: "Contoh Fitri",
    start_datetime: "2026-11-15T03:00:00Z",
    paid_on_site_at: "2026-11-15T03:20:00Z",
    paid_on_site_method: "CASH",
  }),
  row("a-4", { customer_name: "Contoh Gita", start_datetime: "2026-11-15T04:00:00Z" }),
  row("a-5", {
    customer_name: "Contoh Hadi",
    start_datetime: "2026-11-15T09:00:00Z",
    payment_mode: "FULL",
    amount_due_now: 100000,
    amount_due_on_site: 0,
  }),
];

export const WEEK_SUMMARY = {
  bookings: 24,
  online_revenue: 1250000,
  on_site_revenue: 830000,
  no_show: 2,
  attendance_marked: 20,
};
