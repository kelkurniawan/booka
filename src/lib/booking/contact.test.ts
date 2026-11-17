import assert from "node:assert/strict";
import { test } from "node:test";

import { contactLinks, contactWhatsappText, replyHoursLabel, type ContactSettings } from "./contact";

const WA = "+6281298765432";
const base: ContactSettings = {
  contact_phone: WA,
  contact_email: "halo@riasbysekar.test",
  contact_instagram: "riasbysekar",
  contact_threads: "riasbysekar",
  contact_x: "riasbysekar",
  contact_tiktok: "riasbysekar",
  contact_hidden: [],
  reply_from: null,
  reply_until: null,
};

test("kanal tersembunyi dan null dilewati", () => {
  const s = { ...base, contact_hidden: ["EMAIL" as const], contact_x: null };
  const { others } = contactLinks(WA, s, "hi");
  assert.deepEqual(others.map((l) => l.label), ["Telepon", "Instagram", "Threads", "TikTok"]);
});

test("urutan tetap: Telepon, Email, Instagram, Threads, X, TikTok", () => {
  const { whatsapp, others } = contactLinks(WA, base, "hi");
  assert.equal(whatsapp?.label, "WhatsApp");
  assert.equal(whatsapp?.handle, "Paling cepat dibalas");
  assert.deepEqual(others.map((l) => l.label), ["Telepon", "Email", "Instagram", "Threads", "X", "TikTok"]);
  assert.equal(others[0].href, `tel:${WA}`);
  assert.equal(others[1].href, "mailto:halo@riasbysekar.test");
  assert.equal(others[2].handle, "@riasbysekar");
});

test("href Threads", () => {
  const threads = contactLinks(WA, base, "hi").others.find((l) => l.channel === "THREADS");
  assert.equal(threads?.href, "https://www.threads.net/@riasbysekar");
});

test("WhatsApp di contact_hidden atau nomor null menghasilkan whatsapp null", () => {
  assert.equal(contactLinks(WA, { ...base, contact_hidden: ["WHATSAPP"] }, "hi").whatsapp, null);
  assert.equal(contactLinks(null, base, "hi").whatsapp, null);
});

test("replyHoursLabel", () => {
  assert.equal(replyHoursLabel({ reply_from: "09:00:00", reply_until: "20:00:00" }), "Jam balas pesan 09.00 sampai 20.00 WIB");
  assert.equal(replyHoursLabel({ reply_from: "09:00:00", reply_until: null }), null);
  assert.equal(replyHoursLabel({ reply_from: null, reply_until: "20:00:00" }), null);
});

test("contactWhatsappText memakai nama depan", () => {
  const text = contactWhatsappText({
    merchantName: "Rias by Sekar", customerName: "Ayu Lestari", code: "BK-7F3A9C", startISO: "2026-11-21T03:00:00Z",
  });
  assert.ok(text.startsWith("Halo Rias by Sekar, saya Ayu. Soal booking BK-7F3A9C, "));
});
