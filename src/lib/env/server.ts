import "server-only";

import { z } from "zod";

/**
 * Environment variables khusus server. `server-only` membuat build gagal
 * kalau modul ini pernah ter-import dari komponen client, sehingga secret key
 * dan kredensial payment gateway tidak mungkin bocor ke bundle browser.
 */
const serverEnvSchema = z.object({
  appUrl: z.url().default("http://localhost:3000"),
  supabaseUrl: z.url("NEXT_PUBLIC_SUPABASE_URL harus berupa URL lengkap"),
  supabaseKey: z
    .string()
    .min(
      1,
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (atau NEXT_PUBLIC_SUPABASE_ANON_KEY) wajib diisi",
    ),

  /**
   * Secret key Supabase (`sb_secret_…`) atau service role key JWT lama.
   *
   * Opsional: sampai Phase 4 tidak ada satu pun jalur yang memakainya, dan
   * memaksanya ada hanya akan memblokir onboarding tanpa alasan.
   * `createAdminClient()` yang memeriksanya saat benar-benar dibutuhkan.
   */
  supabaseSecretKey: z.string().min(1).optional(),

  /**
   * Kunci AES-256-GCM (base64, 32 byte) untuk mengenkripsi token payment
   * gateway milik merchant. Belum dipakai sampai Phase 3.
   */
  tokenEncryptionKey: z
    .string()
    .refine(
      (value) => Buffer.from(value, "base64").length === 32,
      "TOKEN_ENCRYPTION_KEY harus 32 byte dalam base64 (openssl rand -base64 32)",
    )
    .optional(),

  midtransClientId: z.string().optional(),
  midtransClientSecret: z.string().optional(),
  midtransEnv: z.enum(["sandbox", "production"]).default("sandbox"),

  xenditClientId: z.string().optional(),
  xenditClientSecret: z.string().optional(),
  xenditSecretKey: z.string().optional(),
  xenditEnv: z.enum(["sandbox", "production"]).default("sandbox"),

  cronSecret: z.string().optional(),

  /**
   * Notifikasi. Semuanya opsional: tanpa nilai, kanal yang bersangkutan
   * dilewati (tercatat SKIPPED di notification_log), bukan membuat webhook
   * pembayaran gagal. Lihat docs/NOTIFIKASI.md.
   */
  resendApiKey: z.string().min(1).optional(),
  /** Pengirim email, mis. "Booka <notifikasi@domainanda.id>". */
  emailFrom: z.string().min(1).optional(),
  whatsappProvider: z.enum(["waha", "evolution", "fonnte"]).optional(),
  /** Base URL gateway self-host (WAHA/Evolution). Tidak dipakai Fonnte. */
  whatsappApiUrl: z.url().optional(),
  whatsappApiKey: z.string().min(1).optional(),
  /** Nama sesi WAHA atau nama instance Evolution. */
  whatsappSession: z.string().min(1).default("default"),

  /**
   * Domain sendiri merchant Studio: token Vercel (izin proyek ini) dan id
   * proyeknya. Tanpa keduanya halaman Domain menjelaskan bahwa fitur belum
   * diaktifkan, bukan gagal diam-diam.
   */
  vercelApiToken: z.string().min(1).optional(),
  vercelProjectId: z.string().min(1).optional(),
  vercelTeamId: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/**
 * Baris `KEY=` kosong di .env menghasilkan string kosong, bukan undefined --
 * tanpa ini, variabel opsional yang sengaja dikosongkan malah gagal validasi.
 */
function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}

/**
 * Validasi lazy dengan hasil di-cache: `next build` tetap jalan tanpa
 * `.env.local`, tapi request pertama yang butuh env langsung gagal dengan
 * pesan yang menyebut variabel mana yang kurang.
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse({
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseSecretKey:
      process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY,
    midtransClientId: process.env.MIDTRANS_CLIENT_ID,
    midtransClientSecret: process.env.MIDTRANS_CLIENT_SECRET,
    midtransEnv: process.env.MIDTRANS_ENV,
    xenditClientId: process.env.XENDIT_CLIENT_ID,
    xenditClientSecret: process.env.XENDIT_CLIENT_SECRET,
    xenditSecretKey: process.env.XENDIT_SECRET_KEY,
    xenditEnv: process.env.XENDIT_ENV,
    cronSecret: process.env.CRON_SECRET,
    resendApiKey: emptyToUndefined(process.env.RESEND_API_KEY),
    emailFrom: emptyToUndefined(process.env.EMAIL_FROM),
    whatsappProvider: emptyToUndefined(process.env.WHATSAPP_PROVIDER),
    whatsappApiUrl: emptyToUndefined(process.env.WHATSAPP_API_URL),
    whatsappApiKey: emptyToUndefined(process.env.WHATSAPP_API_KEY),
    whatsappSession: emptyToUndefined(process.env.WHATSAPP_SESSION),
    vercelApiToken: emptyToUndefined(process.env.VERCEL_API_TOKEN),
    vercelProjectId: emptyToUndefined(process.env.VERCEL_PROJECT_ID),
    vercelTeamId: emptyToUndefined(process.env.VERCEL_TEAM_ID),
  });

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.message}`)
      .join("\n");
    throw new Error(
      `Environment variable server tidak valid.\n${detail}\n\nSalin .env.example ke .env.local dan lengkapi nilainya.`,
    );
  }

  cached = parsed.data;
  return cached;
}
