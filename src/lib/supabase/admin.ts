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

  // Diperiksa di sini, bukan di serverEnv(), supaya Phase 1–2 — yang sama
  // sekali tidak memakai klien ini — tetap jalan tanpa secret key.
  if (!env.supabaseSecretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY (atau SUPABASE_SERVICE_ROLE_KEY) belum diisi. " +
        "Ambil dari Supabase → Project Settings → API Keys, lalu simpan di .env.local.",
    );
  }

  return createSupabaseClient<Database>(
    env.supabaseUrl,
    env.supabaseSecretKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
