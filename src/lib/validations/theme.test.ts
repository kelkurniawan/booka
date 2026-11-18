import assert from "node:assert/strict";
import test from "node:test";

import { faqSchema, themeSchema } from "./theme";

test("menerima tema minimal", () => {
  const hasil = themeSchema.safeParse({
    preset: "HANGAT",
    background_style: "SOLID",
    background_overlay: "45",
    text_scale: "SEDANG",
  });
  assert.ok(hasil.success, JSON.stringify(hasil.error?.issues));
  assert.equal(hasil.data.accent, null);
  assert.equal(hasil.data.font_pair, null);
});

test("menormalkan hex huruf besar dan menolak yang bukan hex", () => {
  const ok = themeSchema.safeParse({
    preset: "BERSIH",
    background_style: "SOLID",
    background_overlay: "45",
    text_scale: "SEDANG",
    accent: "#FF8800",
  });
  assert.ok(ok.success);
  assert.equal(ok.data.accent, "#ff8800");

  const gagal = themeSchema.safeParse({
    preset: "BERSIH",
    background_style: "SOLID",
    background_overlay: "45",
    text_scale: "SEDANG",
    accent: "merah",
  });
  assert.equal(gagal.success, false);
});

test("menolak overlay di luar 0-80", () => {
  const gagal = themeSchema.safeParse({
    preset: "BERSIH",
    background_style: "SOLID",
    background_overlay: "95",
    text_scale: "SEDANG",
  });
  assert.equal(gagal.success, false);
});

test("background IMAGE wajib disertai path gambar", () => {
  const gagal = themeSchema.safeParse({
    preset: "BERSIH",
    background_style: "IMAGE",
    background_overlay: "45",
    text_scale: "SEDANG",
  });
  assert.equal(gagal.success, false);
});

test("FAQ menolak pertanyaan terlalu pendek dan jawaban kosong", () => {
  assert.equal(faqSchema.safeParse({ question: "ab", answer: "x" }).success, false);
  assert.equal(
    faqSchema.safeParse({ question: "Bisa reschedule?", answer: "  " }).success,
    false,
  );
  assert.ok(faqSchema.safeParse({ question: "Bisa reschedule?", answer: "Bisa." }).success);
});

// Objek masukan lengkap yang sudah lulus; tiap tes mengubah satu field saja.
const masukanLengkap = {
  preset: "BERSIH",
  background_style: "SOLID",
  background_overlay: "45",
  text_scale: "SEDANG",
  section_order: "FAQ,PROMO,SERVICES,LINKS",
  hidden_sections: "",
};

test("section_order berupa permutasi persis empat bagian", () => {
  const ok = themeSchema.safeParse(masukanLengkap);
  assert.ok(ok.success, JSON.stringify(ok.error?.issues));
  assert.deepEqual(ok.data.section_order, ["FAQ", "PROMO", "SERVICES", "LINKS"]);
});

test("section_order menolak yang tidak lengkap, ganda, atau berisi kunci asing", () => {
  for (const section_order of ["PROMO,SERVICES,FAQ", "PROMO,PROMO,FAQ,LINKS", "PROMO,SERVICES,KONTAK,LINKS"]) {
    const gagal = themeSchema.safeParse({ ...masukanLengkap, section_order });
    assert.equal(gagal.success, false, section_order);
    assert.equal(
      gagal.error?.issues[0].message,
      "Susunan halaman tidak lengkap. Muat ulang halaman lalu coba lagi.",
    );
  }
});

test("hidden_sections kosong jadi array kosong", () => {
  const ok = themeSchema.safeParse(masukanLengkap);
  assert.ok(ok.success);
  assert.deepEqual(ok.data.hidden_sections, []);
});

test("hidden_sections menolak SERVICES, duplikat, dan kunci asing", () => {
  const services = themeSchema.safeParse({ ...masukanLengkap, hidden_sections: "SERVICES" });
  assert.equal(services.success, false);
  assert.equal(services.error?.issues[0].message, "Bagian Layanan selalu tampil.");

  const ganda = themeSchema.safeParse({ ...masukanLengkap, hidden_sections: "FAQ,FAQ" });
  assert.equal(ganda.success, false);

  const asing = themeSchema.safeParse({ ...masukanLengkap, hidden_sections: "KONTAK" });
  assert.equal(asing.success, false);

  const ok = themeSchema.safeParse({ ...masukanLengkap, hidden_sections: "PROMO,FAQ" });
  assert.ok(ok.success);
  assert.deepEqual(ok.data.hidden_sections, ["PROMO", "FAQ"]);
});

test("background MOTION diterima, gaya tombol dan gerak dibatasi", () => {
  const motion = themeSchema.safeParse({ ...masukanLengkap, background_style: "MOTION" });
  assert.ok(motion.success, JSON.stringify(motion.error?.issues));

  const tombol = themeSchema.safeParse({ ...masukanLengkap, button_style: "GARIS" });
  assert.equal(tombol.success, false);

  const gerak = themeSchema.safeParse({ ...masukanLengkap, background_motion: "BOLA" });
  assert.equal(gerak.success, false);

  const ok = themeSchema.safeParse({
    ...masukanLengkap,
    button_style: "OUTLINE",
    background_motion: "AURORA",
    background_motion_speed: "NORMAL",
  });
  assert.ok(ok.success);
  assert.equal(ok.data.button_style, "OUTLINE");
});

test("logo_path dan cover_path kosong jadi null", () => {
  const ok = themeSchema.safeParse({ ...masukanLengkap, logo_path: "", cover_path: "  " });
  assert.ok(ok.success);
  assert.equal(ok.data.logo_path, null);
  assert.equal(ok.data.cover_path, null);
});
