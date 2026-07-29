import "server-only";

import { z } from "zod";

/**
 * Environment variables khusus server. `server-only` membuat build gagal
 * kalau modul ini pernah ter-import dari komponen client, sehingga service
 * role key dan kredensial payment tidak mungkin bocor ke bundle browser.
 */
const serverEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  /**
   * Kunci AES-256-GCM (base64, 32 byte) untuk mengenkripsi token payment
   * gateway milik merchant. Belum dipakai sampai Phase 3, jadi opsional.
   */
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine(
      (value) => Buffer.from(value, "base64").length === 32,
      "TOKEN_ENCRYPTION_KEY harus 32 byte dalam base64 (openssl rand -base64 32)",
    )
    .optional(),

  MIDTRANS_CLIENT_ID: z.string().optional(),
  MIDTRANS_CLIENT_SECRET: z.string().optional(),
  MIDTRANS_ENV: z.enum(["sandbox", "production"]).default("sandbox"),

  XENDIT_CLIENT_ID: z.string().optional(),
  XENDIT_CLIENT_SECRET: z.string().optional(),
  XENDIT_SECRET_KEY: z.string().optional(),
  XENDIT_ENV: z.enum(["sandbox", "production"]).default("sandbox"),

  CRON_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/**
 * Validasi lazy dengan hasil di-cache: `next build` tetap jalan tanpa
 * `.env.local`, tapi request pertama yang butuh env langsung gagal dengan
 * pesan yang menyebut variabel mana yang kurang.
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
    MIDTRANS_CLIENT_ID: process.env.MIDTRANS_CLIENT_ID,
    MIDTRANS_CLIENT_SECRET: process.env.MIDTRANS_CLIENT_SECRET,
    MIDTRANS_ENV: process.env.MIDTRANS_ENV,
    XENDIT_CLIENT_ID: process.env.XENDIT_CLIENT_ID,
    XENDIT_CLIENT_SECRET: process.env.XENDIT_CLIENT_SECRET,
    XENDIT_SECRET_KEY: process.env.XENDIT_SECRET_KEY,
    XENDIT_ENV: process.env.XENDIT_ENV,
    CRON_SECRET: process.env.CRON_SECRET,
  });

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Environment variable server tidak valid.\n${detail}\n\nSalin .env.example ke .env.local dan lengkapi nilainya.`,
    );
  }

  cached = parsed.data;
  return cached;
}
