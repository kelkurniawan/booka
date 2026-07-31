import { z } from "zod";

/**
 * Environment variables yang aman diekspos ke browser.
 *
 * Setiap variabel HARUS ditulis sebagai `process.env.NEXT_PUBLIC_X` secara
 * literal — Next.js mengganti ekspresi ini saat build. Destructuring atau
 * akses dinamis (`process.env[key]`) tidak akan ter-inline dan menghasilkan
 * `undefined` di browser.
 */
const rawClientEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  // Supabase mengganti anon key JWT dengan publishable key (`sb_publishable_…`).
  // Keduanya diterima: yang baru didahulukan, yang lama tetap jalan.
  supabaseKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  // Nomor WhatsApp tim Booka untuk permintaan upgrade/downgrade paket manual.
  // Opsional -- halaman Langganan menyembunyikan tombol upgrade kalau kosong.
  supportWhatsapp: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP,
};

const clientEnvSchema = z.object({
  appUrl: z
    .url("NEXT_PUBLIC_APP_URL harus berupa URL lengkap")
    .default("http://localhost:3000"),
  supabaseUrl: z.url("NEXT_PUBLIC_SUPABASE_URL harus berupa URL lengkap"),
  supabaseKey: z
    .string()
    .min(
      1,
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (atau NEXT_PUBLIC_SUPABASE_ANON_KEY) wajib diisi",
    ),
  supportWhatsapp: z.string().optional(),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

let cached: ClientEnv | null = null;

/**
 * Validasi bersifat lazy agar `next build` tetap bisa jalan di mesin tanpa
 * `.env.local` — kegagalan muncul saat variabel benar-benar dipakai, dengan
 * pesan yang menyebut nama variabelnya.
 */
export function clientEnv(): ClientEnv {
  if (cached) return cached;

  const parsed = clientEnvSchema.safeParse(rawClientEnv);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.message}`)
      .join("\n");
    throw new Error(
      `Environment variable publik tidak valid.\n${detail}\n\nSalin .env.example ke .env.local dan lengkapi nilainya.`,
    );
  }

  cached = parsed.data;
  return cached;
}
