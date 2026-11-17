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

test("nilai terisi menghasilkan enam tautan berurutan", () => {
  const links = contactLinks({
    whatsapp: "6281234567890",
    email: "halo@contoh.id",
    instagram: "@akun",
    threads: "akun",
    x: "akun",
    tiktok: "akun",
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
    ],
  );
  assert.equal(hasUnfilledMarketingContact({
    whatsapp: "6281234567890",
    email: "halo@contoh.id",
    instagram: "@akun",
    threads: "akun",
    x: "akun",
    tiktok: "akun",
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
