import { z } from "zod";

import { MEDIA_LIMITS } from "@/lib/media/limits";

const HEX = /^#[0-9a-f]{6}$/;

/** String kosong dari FormData berarti "tidak diisi", bukan nilai kosong. */
const hexOpsional = z
  .string()
  .trim()
  .toLowerCase()
  .transform((nilai) => (nilai === "" ? null : nilai))
  .nullable()
  .refine((nilai) => nilai === null || HEX.test(nilai), {
    message: "Warna harus berupa kode hex enam digit, misalnya #b8613a",
  })
  .default(null);

const teksOpsional = z
  .string()
  .trim()
  .transform((nilai) => (nilai === "" ? null : nilai))
  .nullable()
  .default(null);

export const themeSchema = z
  .object({
    preset: z.enum(["BERSIH", "HANGAT", "MALAM", "PASTEL", "BERANI", "ELEGAN"]),
    accent: hexOpsional,
    background_style: z.enum(["SOLID", "GRADIENT", "IMAGE"]),
    background_color: hexOpsional,
    background_image_path: teksOpsional,
    background_overlay: z.coerce
      .number()
      .int()
      .min(0, "Overlay minimal 0")
      .max(80, "Overlay maksimal 80"),
    font_pair: z
      .enum(["NETRAL", "KLASIK", "MODERN", "HANGAT", "TEGAS", "RAPI"])
      .nullable()
      .default(null),
    text_scale: z.enum(["KECIL", "SEDANG", "BESAR"]),
    corner_style: z.enum(["TAJAM", "LEMBUT", "BULAT"]).nullable().default(null),
  })
  // Cermin constraint merchant_themes_image_requires_path. Ditolak di sini juga
  // supaya merchant dapat pesan yang bisa dibaca, bukan galat Postgres mentah.
  .refine(
    (nilai) => nilai.background_style !== "IMAGE" || nilai.background_image_path !== null,
    {
      path: ["background_image_path"],
      message: "Unggah dulu gambar backgroundnya.",
    },
  );

export type ThemeInput = z.infer<typeof themeSchema>;

export const faqSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "Pertanyaan minimal 3 karakter")
    .max(200, "Pertanyaan maksimal 200 karakter"),
  answer: z
    .string()
    .trim()
    .min(1, "Jawaban tidak boleh kosong")
    .max(1000, "Jawaban maksimal 1000 karakter"),
});

// Angka yang sama dengan trigger merchant_faqs_enforce_limit. Diambil dari
// MEDIA_LIMITS supaya ketiganya -- database, validasi, dan UI -- tidak bisa
// berbeda diam-diam.
export const faqListSchema = z
  .array(faqSchema)
  .max(MEDIA_LIMITS.maxFaqs, `Maksimal ${MEDIA_LIMITS.maxFaqs} pertanyaan pada FAQ`);
