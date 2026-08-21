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
