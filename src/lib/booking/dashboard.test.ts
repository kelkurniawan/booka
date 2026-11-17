import assert from "node:assert/strict";
import { test } from "node:test";

import { formatLongDate, formatRupiah as rp } from "../format";
import type { BookingListItem } from "@/app/dashboard/bookings/booking-state";
import {
  actionKind, attendanceWindow, dayLabel, groupByJakartaDay, nowLineIndex,
  onSiteTotals, parseTab, paymentSummary, rescheduleNoticeLink, tabParam, unpaidReminderLink, whatsappLink,
} from "./dashboard";

test("parseTab: param dikenal dan default", () => {
  assert.equal(parseTab("tindakan"), "ACTION");
  assert.equal(parseTab("batal"), "CANCELLED");
  assert.equal(parseTab(undefined), "UPCOMING");
  assert.equal(parseTab("PAID"), "UPCOMING");
  assert.equal(tabParam("HISTORY"), "riwayat");
});

test("actionKind", () => {
  const base = { attended_at: null, no_show_at: null };
  assert.equal(actionKind({ ...base, status: "REQUESTED" }), "REQUEST");
  assert.equal(actionKind({ ...base, status: "PENDING" }), "UNPAID");
  assert.equal(actionKind({ ...base, status: "CONFIRMED" }), "ATTENDANCE");
  assert.equal(actionKind({ status: "PAID", attended_at: "2026-11-13T03:00:00Z", no_show_at: null }), "ON_SITE_UNPAID");
  // PAID belum ditandai hadir: kehadiran dulu, bukan tagihan di tempat.
  assert.equal(actionKind({ status: "PAID", attended_at: null, no_show_at: null }), "ATTENDANCE");
  assert.equal(actionKind({ status: "PAID", attended_at: null, no_show_at: "2026-11-13T03:00:00Z" }), "ON_SITE_UNPAID");
});

test("dayLabel: hari ini, besok, kemarin, hari lain, beda tahun", () => {
  assert.equal(dayLabel("2026-11-14", "2026-11-14"), "Hari ini, Sabtu 14 Nov");
  assert.equal(dayLabel("2026-11-15", "2026-11-14"), "Besok, Minggu 15 Nov");
  assert.equal(dayLabel("2026-11-13", "2026-11-14"), "Kemarin, Jumat 13 Nov");
  assert.equal(dayLabel("2026-11-16", "2026-11-14"), "Senin 16 Nov");
  assert.equal(dayLabel("2027-01-04", "2026-11-14"), "Senin 4 Jan 2027");
});

test("groupByJakartaDay memisah 23.30 dan 00.30 WIB", () => {
  const a = { id: "a", start_datetime: "2026-11-14T16:30:00Z" }; // 23.30 WIB 14 Nov
  const b = { id: "b", start_datetime: "2026-11-14T17:30:00Z" }; // 00.30 WIB 15 Nov
  const c = { id: "c", start_datetime: "2026-11-15T02:00:00Z" }; // 09.00 WIB 15 Nov
  assert.deepEqual(groupByJakartaDay([a, b, c]), [
    { dateISO: "2026-11-14", rows: [a] },
    { dateISO: "2026-11-15", rows: [b, c] },
  ]);
  assert.deepEqual(groupByJakartaDay([]), []);
});

test("nowLineIndex", () => {
  const rows = ["2026-11-14T04:00:00Z", "2026-11-14T10:00:00Z", "2026-11-14T12:00:00Z"].map((s) => ({ start_datetime: s }));
  assert.equal(nowLineIndex(rows, Date.parse("2026-11-14T11:40:00Z")), 2);
  assert.equal(nowLineIndex(rows, Date.parse("2026-11-14T01:00:00Z")), null);
  assert.equal(nowLineIndex(rows, Date.parse("2026-11-14T13:00:00Z")), null);
});

test("attendanceWindow: hadir mulai 1 jam sebelum, tidak datang mulai jam mulai", () => {
  const start = "2026-11-14T10:00:00Z";
  assert.deepEqual(attendanceWindow(start, Date.parse("2026-11-14T08:59:00Z")), { canAttend: false, canNoShow: false });
  assert.deepEqual(attendanceWindow(start, Date.parse("2026-11-14T09:00:00Z")), { canAttend: true, canNoShow: false });
  assert.deepEqual(attendanceWindow(start, Date.parse("2026-11-14T10:00:00Z")), { canAttend: true, canNoShow: true });
});

test("onSiteTotals mengabaikan tidak datang dan tagihan nol", () => {
  assert.deepEqual(
    onSiteTotals([
      { amount_due_on_site: 450000, paid_on_site_at: "2026-11-14T05:00:00Z", no_show_at: null },
      { amount_due_on_site: 900000, paid_on_site_at: null, no_show_at: null },
      { amount_due_on_site: 0, paid_on_site_at: null, no_show_at: null },
      { amount_due_on_site: 300000, paid_on_site_at: null, no_show_at: "2026-11-14T06:00:00Z" },
    ]),
    { count: 2, total: 1350000, paid: 450000 },
  );
});

test("tautan WhatsApp", () => {
  assert.equal(whatsappLink("+62 812-3456"), "https://wa.me/628123456");
  const reminder = new URL(unpaidReminderLink({
    customer_whatsapp: "+6281234567890", customer_name: "Rina", service_name: "Potong rambut",
    start_datetime: "2026-11-14T12:30:00Z", expires_at: "2026-11-14T05:15:00Z",
  }));
  assert.equal(reminder.pathname, "/6281234567890");
  const text = reminder.searchParams.get("text") ?? "";
  assert.ok(text.startsWith("Halo Rina, booking Potong rambut untuk "));
  assert.ok(text.includes("menunggu pembayaran sampai pukul 12:15 WIB"));
  assert.ok(!text.includes("—")); // tanpa em dash
  const notice = new URL(rescheduleNoticeLink(
    { customer_whatsapp: "+6281234567890", customer_name: "Rina", service_name: "Potong rambut" },
    "2026-11-16T03:00:00Z",
  ));
  assert.ok((notice.searchParams.get("text") ?? "").includes("sudah kami ubah ke Senin, 16 November 2026 pukul 10:00"));
});

test("formatLongDate", () => {
  assert.equal(formatLongDate("2026-11-14T05:00:00Z"), "Sabtu, 14 November 2026");
});

test("paymentSummary: lunas hanya bila PAID", () => {
  const b = (over: Partial<BookingListItem>) =>
    ({
      status: "PAID", payment_mode: "DEPOSIT", amount_due_now: 30000, amount_due_on_site: 70000,
      paid_on_site_at: null, paid_on_site_method: null, ...over,
    }) as BookingListItem;
  assert.equal(paymentSummary(b({ status: "PENDING", payment_mode: "FULL", amount_due_now: 100000, amount_due_on_site: 0 })).main, `Belum bayar ${rp(100000)}`);
  assert.equal(paymentSummary(b({ status: "REQUESTED" })).main, `Bayar online ${rp(30000)}`);
  const paid = paymentSummary(b({}));
  assert.equal(paid.main, `DP ${rp(30000)} lunas`);
  assert.equal(paid.sub, `Sisa ${rp(70000)} di tempat`);
  const onSite = paymentSummary(b({ paid_on_site_at: "2026-11-15T04:00:00Z", paid_on_site_method: "CASH" }));
  assert.equal(onSite.sub, `Lunas ${rp(70000)} tunai`);
  assert.deepEqual(paymentSummary(b({ status: "CONFIRMED", payment_mode: "ON_SITE", amount_due_now: 0, amount_due_on_site: 100000 })), {
    main: "Bayar di tempat", sub: `Sisa ${rp(100000)} di tempat`,
  });
});
