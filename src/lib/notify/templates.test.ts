import assert from "node:assert/strict";
import { test } from "node:test";

import { formatRupiah } from "@/lib/format";

import {
  customerApprovedWhatsapp,
  customerConfirmedWhatsapp,
  customerRejectedWhatsapp,
  merchantConfirmedEmail,
  merchantConfirmedWhatsapp,
  merchantRequestedEmail,
  merchantRequestedWhatsapp,
  customerPaidWhatsapp,
  customerReminderWhatsapp,
  merchantPaidEmail,
  merchantPaidWhatsapp,
  waLink,
  type BookingMessageData,
} from "./templates";

const base: BookingMessageData = {
  merchantName: "Studio Mawar",
  merchantWhatsapp: "+6281234567890",
  customerName: "Rina",
  customerWhatsapp: "+6289876543210",
  serviceName: "Makeup Wisuda",
  servicePrice: 150000,
  // 10:30 UTC = 17:30 WIB, Rabu 19 Agustus 2026.
  startDatetime: "2026-08-19T10:30:00.000Z",
  statusUrl: "https://marky.id/pesanan/abc",
  dashboardUrl: "https://marky.id/dashboard/bookings",
  amountDueNow: 150000,
  amountDueOnSite: 0,
  respondBefore: null,
};

test("waLink membuang tanda + dan karakter non-digit", () => {
  assert.equal(waLink("+62 812-3456"), "https://wa.me/628123456");
});

test("email merchant memuat jadwal WIB, DP, dan tautan chat pelanggan", () => {
  const email = merchantPaidEmail(base);
  assert.match(email.subject, /Rina, Makeup Wisuda/);
  assert.match(email.text, /Rabu, 19 Agustus 2026 pukul 17:30 WIB/);
  assert.match(email.text, /Rp\s?150\.000/);
  assert.match(email.text, /https:\/\/wa\.me\/6289876543210/);
});

test("email merchant meng-escape HTML dari nama pelanggan", () => {
  const email = merchantPaidEmail({ ...base, customerName: "<script>x</script>" });
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /&lt;script&gt;/);
});

test("WA pelanggan memuat tautan status dan kontak merchant bila ada", () => {
  const text = customerPaidWhatsapp(base);
  assert.match(text, /https:\/\/marky\.id\/pesanan\/abc/);
  assert.match(text, /wa\.me\/6281234567890/);
});

test("WA pelanggan tanpa nomor merchant tidak menulis baris kontak kosong", () => {
  const text = customerPaidWhatsapp({ ...base, merchantWhatsapp: null });
  assert.doesNotMatch(text, /Hubungi/);
  assert.doesNotMatch(text, /null/);
});

test("baris staf hanya muncul bila staf diisi", () => {
  assert.doesNotMatch(merchantPaidWhatsapp(base), /Staf:/);
  assert.match(merchantPaidWhatsapp({ ...base, staffName: "Dewi" }), /Staf: Dewi/);
  assert.match(customerReminderWhatsapp({ ...base, staffName: "Dewi" }), /Staf: Dewi/);
});

test("reminder menyebut 'besok' dan jadwal WIB", () => {
  const text = customerReminderWhatsapp(base);
  assert.match(text, /besok/);
  assert.match(text, /17:30 WIB/);
});

test("WA pelanggan terkonfirmasi memuat nominal di tempat dan tautan status", () => {
  const text = customerConfirmedWhatsapp({ ...base, amountDueNow: 0, amountDueOnSite: 450000 });
  assert.ok(text.includes(formatRupiah(450000)));
  assert.ok(text.includes(base.statusUrl));
});

test("WA merchant lunas: Dibayar dan Sisa di tempat hanya bila sisa > 0", () => {
  const dp = merchantPaidWhatsapp({ ...base, amountDueNow: 105000, amountDueOnSite: 245000 });
  assert.ok(dp.includes(formatRupiah(105000)));
  assert.match(dp, /Sisa di tempat/);
  assert.doesNotMatch(merchantPaidWhatsapp(base), /Sisa di tempat/);
  assert.match(customerPaidWhatsapp({ ...base, amountDueOnSite: 1 }), /pembayaran DP/);
  assert.doesNotMatch(customerPaidWhatsapp(base), /pembayaran DP/);
});

test("reminder menambah Bayar di tempat hanya bila belum lunas di tempat", () => {
  const due = { ...base, amountDueOnSite: 245000 };
  assert.match(customerReminderWhatsapp(due), /Bayar di tempat/);
  assert.doesNotMatch(customerReminderWhatsapp({ ...due, paidOnSite: true }), /Bayar di tempat/);
  assert.doesNotMatch(customerReminderWhatsapp(base), /Bayar di tempat/);
});

test("WA persetujuan memuat nominal, statusUrl, dan batas bayar", () => {
  const text = customerApprovedWhatsapp({ ...base, amountDueNow: 100000, respondBefore: "2026-08-18T10:30:00.000Z" });
  assert.ok(text.includes(formatRupiah(100000)));
  assert.ok(text.includes(base.statusUrl));
  assert.match(text, /Batas bayar: .*17:30 WIB/);
});

test("WA permintaan ke merchant memuat dashboardUrl dan batas jawab", () => {
  const text = merchantRequestedWhatsapp({ ...base, respondBefore: "2026-08-18T10:30:00.000Z" });
  assert.ok(text.includes(base.dashboardUrl));
  assert.match(text, /Jawab sebelum/);
});

test("WA penolakan netral, kontak merchant hanya bila ada", () => {
  assert.match(customerRejectedWhatsapp(base), /wa\.me\/6281234567890/);
  assert.doesNotMatch(customerRejectedWhatsapp({ ...base, merchantWhatsapp: null }), /wa\.me|null/);
});

test("templat baru tanpa em dash", () => {
  const d = { ...base, amountDueNow: 100000, amountDueOnSite: 50000, respondBefore: "2026-08-18T10:30:00.000Z", staffName: "Dewi" };
  const all = [
    customerApprovedWhatsapp(d),
    customerConfirmedWhatsapp(d),
    customerRejectedWhatsapp(d),
    merchantConfirmedWhatsapp(d),
    merchantRequestedWhatsapp(d),
    merchantConfirmedEmail(d).text,
    merchantConfirmedEmail(d).subject,
    merchantRequestedEmail(d).text,
    merchantRequestedEmail(d).subject,
  ];
  for (const t of all) assert.ok(!t.includes("\u2014"));
});

test("pesan terkonfirmasi menulis Bayar di tempat hanya bila ada sisa di tempat", () => {
  const due = { ...base, amountDueOnSite: 450000 };
  assert.match(merchantConfirmedWhatsapp(due), /Bayar di tempat/);
  assert.match(customerConfirmedWhatsapp(due), /Bayar di tempat/);
  assert.match(merchantConfirmedEmail(due).text, /Bayar di tempat/);
  // Booking gratis: tidak ada yang perlu dibayar di tempat.
  const free = { ...base, amountDueOnSite: 0 };
  assert.doesNotMatch(merchantConfirmedWhatsapp(free), /Bayar di tempat/);
  assert.doesNotMatch(customerConfirmedWhatsapp(free), /Bayar di tempat/);
  assert.doesNotMatch(merchantConfirmedEmail(free).text, /Bayar di tempat|membayar di tempat/);
});

test("subjek email booking dibayar tanpa em dash", () => {
  assert.doesNotMatch(merchantPaidEmail(base).subject, /—/);
});
