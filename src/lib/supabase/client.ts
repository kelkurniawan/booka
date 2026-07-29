"use client";

import { createBrowserClient } from "@supabase/ssr";

import { clientEnv } from "@/lib/env/client";
import type { Database } from "@/types/database";

/**
 * Klien Supabase untuk komponen client. Bekerja sebagai peran `authenticated`
 * ketika ada sesi, `anon` ketika tidak — RLS yang menentukan sisanya.
 */
export function createClient() {
  const env = clientEnv();

  return createBrowserClient<Database>(
    env.supabaseUrl,
    env.supabaseKey,
  );
}
