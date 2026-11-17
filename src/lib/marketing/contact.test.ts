import test from "node:test";
import assert from "node:assert/strict";
import {
  contactLinks,
  hasUnfilledMarketingContact,
  MARKETING_CONTACT,
} from "@/lib/marketing/contact";

const BLANK = { ...MARKETING_CONTACT, email: "[EMAIL KONTAK]" };

test("nilai bawaan belum terisi dan tidak menghasilkan tautan", () => {
  assert.deepEqual(contactLinks(), []);
  assert.equal(hasUnfilledMarketingContact(), true);
});

test("nilai terisi menghasilkan tujuh tautan berurutan", () => {
  const links = contactLinks({
    whatsapp: "6281234567890",
    email: "halo@contoh.id",
    instagram: "@akun",
    threads: "akun",
    x: "akun",
    tiktok: "akun",
    discord: "https://discord.gg/abc123",
  });
  assert.deepEqual(
    links.map((link) => link.href),
    [
      "https://wa.me/6281234567890",
      "mailto:halo@contoh.id",
      "https://www.instagram.com/akun",
      "https://www.threads.net/@akun",
      "https://x.com/akun",
      "https://www.tiktok.com/@akun",
      "https://discord.gg/abc123",
    ],
  );
  assert.equal(hasUnfilledMarketingContact({
    whatsapp: "6281234567890",
    email: "halo@contoh.id",
    instagram: "@akun",
    threads: "akun",
    x: "akun",
    tiktok: "akun",
    discord: "https://discord.gg/abc123",
  }), false);
});

test("hanya nilai yang terisi yang menjadi tautan", () => {
  const links = contactLinks({ ...BLANK, x: "akun" });
  assert.equal(links.length, 1);
  assert.equal(links[0].href, "https://x.com/akun");
});

test("tidak ada href yang memuat penanda", () => {
  const links = contactLinks({ ...BLANK, whatsapp: "[NOMOR WHATSAPP MARKY]", x: "akun" });
  for (const link of links) assert.ok(!link.href.includes("["), link.href);
});

test("discord: undangan discord.gg dan discord.com/invite terisi", () => {
  for (const url of ["https://discord.gg/abc123", "https://discord.com/invite/abc123"]) {
    const links = contactLinks({ ...BLANK, discord: url });
    assert.deepEqual(links, [{ kind: "discord", href: url, label: "Discord Marky" }]);
  }
});

test("discord: penanda tidak menjadi tautan", () => {
  assert.equal(MARKETING_CONTACT.discord, "[UNDANGAN DISCORD]");
  assert.deepEqual(contactLinks({ ...BLANK, discord: "[UNDANGAN DISCORD]" }), []);
});

test("discord: URL non-Discord ditolak", () => {
  for (const url of ["https://contoh.com/invite/abc", "http://discord.gg/abc", "discord.gg/abc", "https://discord.gg.evil.id/abc", "https://discord.gg/"]) {
    assert.deepEqual(contactLinks({ ...BLANK, discord: url }), [], url);
  }
});
