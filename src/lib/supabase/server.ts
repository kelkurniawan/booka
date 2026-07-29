import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { serverEnv } from "@/lib/env/server";
import type { Database } from "@/types/database";

/**
 * Klien Supabase untuk Server Component, Server Action, dan Route Handler.
 * Sesi dibaca dari cookie request, sehingga query berjalan sebagai peran
 * `authenticated` milik user yang sedang login dan tunduk pada RLS.
 */
export async function createClient() {
  // cookies() dipanggil lebih dulu supaya Next.js langsung menandai segmen ini
  // dinamis, sebelum apa pun berpeluang melempar error.
  const cookieStore = await cookies();
  const env = serverEnv();

  return createServerClient<Database>(
    env.supabaseUrl,
    env.supabaseKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component tidak boleh menulis cookie. Aman diabaikan:
            // refresh token sudah ditangani di src/proxy.ts sebelum request
            // sampai ke sini.
          }
        },
      },
    },
  );
}

/**
 * Klien anon tanpa sesi, khusus halaman publik `/[username]`.
 *
 * Dipakai supaya halaman booking selalu dibaca sebagai peran `anon` — termasuk
 * ketika pengunjungnya kebetulan merchant yang sedang login. Policy `anon` dan
 * `authenticated` di RLS jadi bisa dipisah tegas, dan kolom sensitif seperti
 * `merchants.whatsapp_number` tidak pernah ikut terbaca.
 */
export function createPublicClient() {
  const env = serverEnv();

  return createServerClient<Database>(
    env.supabaseUrl,
    env.supabaseKey,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // Sengaja kosong: klien ini tidak boleh punya sesi.
        },
      },
    },
  );
}
