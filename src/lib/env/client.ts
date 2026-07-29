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
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url("NEXT_PUBLIC_APP_URL harus berupa URL lengkap"),
  NEXT_PUBLIC_SUPABASE_URL: z.url("NEXT_PUBLIC_SUPABASE_URL harus berupa URL lengkap"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY wajib diisi"),
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
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Environment variable publik tidak valid.\n${detail}\n\nSalin .env.example ke .env.local dan lengkapi nilainya.`,
    );
  }

  cached = parsed.data;
  return cached;
}
