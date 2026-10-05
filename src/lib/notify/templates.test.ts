import assert from "node:assert/strict";
import { test } from "node:test";

import {
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
  statusUrl: "https://booka.id/pesanan/abc",
  dashboardUrl: "https://booka.id/dashboard/bookings",
};

test("waLink membuang tanda + dan karakter non-digit", () => {
  assert.equal(waLink("+62 812-3456"), "https://wa.me/628123456");
});

test("email merchant memuat jadwal WIB, DP, dan tautan chat pelanggan", () => {
  const email = merchantPaidEmail(base);
  assert.match(email.subject, /Rina — Makeup Wisuda/);
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
  assert.match(text, /https:\/\/booka\.id\/pesanan\/abc/);
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
