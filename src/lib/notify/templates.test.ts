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
  customerReminderEmail,
  customerReminderPush,
  merchantPaidEmail,
  merchantPaidWhatsapp,
  merchantRescheduledEmail,
  merchantRescheduledWhatsapp,
  merchantCustomerCancelledEmail,
  merchantCustomerCancelledWhatsapp,
  waLink,
  type BookingMessageData,
} from "./templates";

const base: BookingMessageData = {
  bookingId: "11111111-1111-1111-1111-111111111111",
  merchantName: "Studio Mawar",
  merchantWhatsapp: "+6281234567890",
  customerName: "Rina",
  customerWhatsapp: "+6289876543210",
  serviceName: "Makeup Wisuda",
  servicePrice: 150000,
  // 10:30 UTC = 17:30 WIB, Rabu 19 Agustus 2026.
  startDatetime: "2026-08-19T10:30:00.000Z",
  endDatetime: "2026-08-19T11:30:00.000Z",
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
  assert.match(customerReminderWhatsapp({ ...base, staffName: "Dewi" }, "DAY_BEFORE"), /Staf: Dewi/);
});

test("reminder menyebut 'besok' dan jadwal WIB", () => {
  const text = customerReminderWhatsapp(base, "DAY_BEFORE");
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
  assert.match(customerReminderWhatsapp(due, "DAY_BEFORE"), /Bayar di tempat/);
  assert.doesNotMatch(customerReminderWhatsapp({ ...due, paidOnSite: true }, "DAY_BEFORE"), /Bayar di tempat/);
  assert.doesNotMatch(customerReminderWhatsapp(base, "DAY_BEFORE"), /Bayar di tempat/);
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

test("template perubahan oleh pelanggan memuat nama, layanan, jadwal, tautan dashboard, tanpa karakter terlarang", () => {
  const oldStart = "2026-08-18T09:00:00.000Z"; // Selasa 18 Agustus 16:00 WIB
  const outputs = [
    merchantRescheduledWhatsapp(base, oldStart),
    merchantRescheduledEmail(base, oldStart).text,
    merchantRescheduledEmail(base, oldStart).subject,
    merchantRescheduledEmail(base, oldStart).html,
    merchantCustomerCancelledWhatsapp(base),
    merchantCustomerCancelledEmail(base).text,
    merchantCustomerCancelledEmail(base).subject,
    merchantCustomerCancelledEmail(base).html,
  ];
  for (const out of outputs) assert.doesNotMatch(out, /—|·/);
  // Email tidak memakai penanda tebal WhatsApp.
  for (const out of [outputs[1], outputs[3], outputs[5], outputs[7]]) assert.doesNotMatch(out, /\*/);
  for (const out of [outputs[0], outputs[1], outputs[4], outputs[5]]) {
    assert.match(out, /Rina/);
    assert.match(out, /Makeup Wisuda/);
    assert.ok(out.includes(base.dashboardUrl));
  }
  for (const out of [outputs[0], outputs[1]]) {
    assert.match(out, /Selasa, 18 Agustus 2026 pukul 16:00/);
    assert.match(out, /Rabu, 19 Agustus 2026 pukul 17:30/);
  }
  assert.match(outputs[2], /^Jadwal diubah pelanggan: Makeup Wisuda$/);
  assert.match(outputs[6], /^Booking dibatalkan pelanggan: Makeup Wisuda$/);
  assert.match(outputs[4], /Slotnya sudah kosong lagi\./);
});

test("pengingat hari H memakai 'hari ini', bukan 'besok'", () => {
  const text = customerReminderWhatsapp(base, "SAME_DAY");
  assert.match(text, /hari ini:/);
  assert.doesNotMatch(text, /besok/);
});

test("email pengingat melampirkan booking.ics", () => {
  const email = customerReminderEmail(base, "DAY_BEFORE");
  assert.match(email.subject, /^Pengingat besok: Makeup Wisuda/);
  assert.equal(email.attachments?.length, 1);
  assert.equal(email.attachments?.[0].filename, "booking.ics");
  assert.match(Buffer.from(email.attachments![0].content, "base64").toString("utf8"), /^BEGIN:VCALENDAR/);
});

test("push pengingat: judul, isi, url, dan tag per booking", () => {
  const p = customerReminderPush(base, "SAME_DAY");
  assert.equal(p.title, "Pengingat: Makeup Wisuda");
  assert.equal(p.body, "Hari ini, 17:30 WIB di Studio Mawar.");
  assert.equal(p.url, new URL(base.statusUrl).pathname);
  assert.ok(p.url.startsWith("/"));
  assert.equal(p.tag, `booking-${base.bookingId}`);
});

const reservasi: BookingMessageData = {
  ...base,
  partySize: 4,
  tableLabel: "D5",
  customerNote: "Ulang tahun",
};

test("pesan merchant reservasi memuat tamu, meja, dan catatan; pesan pelanggan tanpa catatan", () => {
  for (const text of [
    merchantPaidWhatsapp(reservasi),
    merchantConfirmedWhatsapp(reservasi),
    merchantRequestedWhatsapp(reservasi),
    merchantPaidEmail(reservasi).text,
    merchantConfirmedEmail(reservasi).text,
    merchantRequestedEmail(reservasi).text,
  ]) {
    assert.match(text, /4 orang/);
    assert.match(text, /D5/);
    assert.match(text, /Ulang tahun/);
  }
  for (const text of [
    customerPaidWhatsapp(reservasi),
    customerConfirmedWhatsapp(reservasi),
    customerApprovedWhatsapp(reservasi),
  ]) {
    assert.match(text, /4 orang, Meja D5/);
    assert.doesNotMatch(text, /Ulang tahun/);
  }
});

test("booking non-reservasi: pesan tidak memuat baris tamu atau meja", () => {
  assert.doesNotMatch(merchantPaidWhatsapp(base), /orang|Meja/);
  assert.doesNotMatch(customerConfirmedWhatsapp(base), /orang|Meja/);
});

const sewa: BookingMessageData = { ...base, courtName: "Lapangan 2" };

test("pesan sewa lapangan memuat nama lapangan di semua jalur", () => {
  for (const text of [
    merchantPaidWhatsapp(sewa),
    merchantConfirmedWhatsapp(sewa),
    merchantRequestedWhatsapp(sewa),
    customerPaidWhatsapp(sewa),
    customerConfirmedWhatsapp(sewa),
    customerApprovedWhatsapp(sewa),
    customerReminderWhatsapp(sewa, "DAY_BEFORE"),
    merchantPaidEmail(sewa).text,
    merchantConfirmedEmail(sewa).text,
    merchantRequestedEmail(sewa).text,
    merchantPaidEmail(sewa).html,
  ]) {
    assert.match(text, /Lapangan 2/);
    assert.match(text, /Lapangan/);
  }
  assert.match(merchantPaidWhatsapp(sewa), /Lapangan: Lapangan 2/);
});

test("pesan non-sewa tidak berubah: tanpa baris Lapangan", () => {
  assert.doesNotMatch(merchantPaidWhatsapp(base), /Lapangan/);
  assert.doesNotMatch(merchantPaidEmail(base).text, /Lapangan/);
  assert.doesNotMatch(merchantPaidWhatsapp({ ...base, courtName: null }), /Lapangan/);
});
