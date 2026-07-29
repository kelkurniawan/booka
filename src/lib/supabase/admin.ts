import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env/server";
import type { Database } from "@/types/database";

/**
 * Klien service role — MELEWATI RLS.
 *
 * Hanya untuk alur yang memang tidak punya sesi user atau butuh menulis ke
 * tabel yang tertutup bagi klien browser:
 *
 *   - POST /api/bookings        (transaksi anti double-booking)
 *   - POST /api/webhooks/*      (callback payment gateway)
 *   - GET  /api/cron/*          (auto-cancel booking kedaluwarsa)
 *   - OAuth callback            (menyimpan token merchant ke schema private)
 *
 * Jangan pernah memakainya di jalur yang datanya berasal dari input pengguna
 * tanpa memfilter `merchant_id` secara eksplisit — di sini tidak ada RLS yang
 * menjaga.
 */
export function createAdminClient() {
  const env = serverEnv();

  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
