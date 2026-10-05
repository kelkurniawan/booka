import { NextResponse, type NextRequest } from "next/server";

import { routeCustomDomain } from "./routing";

/** Lama hasil resolve disimpan di memori instance (termasuk hasil "tidak dikenal"). */
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 1_000;
const cache = new Map<string, { username: string | null; expires: number }>();

/**
 * Host -> username lewat RPC resolve_custom_domain, sebagai anon tanpa sesi.
 * fetch langsung ke PostgREST (bukan klien Supabase) supaya proxy tidak
 * membangun klien bercookie untuk request publik ini.
 */
async function resolveHost(host: string): Promise<string | null> {
  const cached = cache.get(host);
  if (cached && cached.expires > Date.now()) return cached.username;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  let username: string | null = null;
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/resolve_custom_domain`, {
      method: "POST",
      headers: { apikey: supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify({ p_host: host }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    username = (await response.json()) as string | null;
  } catch (error) {
    // Jangan di-cache: gangguan sesaat tidak boleh mematikan domain selama
    // satu menit penuh.
    console.error("[domain] gagal me-resolve host", { host, error });
    return null;
  }

  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(host, { username, expires: Date.now() + CACHE_TTL_MS });
  return username;
}

/**
 * Menangani request yang datang lewat domain merchant. Dipanggil proxy
 * hanya bila host BUKAN host Booka sendiri (lihat isAppHost).
 *
 * Mengembalikan null untuk host yang tidak dikenal, dan proxy melanjutkan
 * seperti biasa. Sengaja bukan 404: NEXT_PUBLIC_APP_URL yang salah isi akan
 * membuat SEMUA host terlihat asing, dan 404 di sini berarti seluruh situs
 * mati tanpa pesan error yang jelas.
 */
export async function handleCustomDomain(
  request: NextRequest,
  host: string,
): Promise<NextResponse | null> {
  const username = await resolveHost(host.split(":")[0].toLowerCase());
  if (!username) return null;

  const route = routeCustomDomain(request.nextUrl.pathname, username);

  if (route.type === "pass") return NextResponse.next();

  if (route.type === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = route.pathname;
    return NextResponse.rewrite(url);
  }

  // Origin dibangun dari host yang diminta pengunjung, bukan
  // request.nextUrl.origin -- di belakang proxy/dev server, origin internal
  // bisa berupa localhost.
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const target = route.toApp
    ? new URL(route.pathname, process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin)
    : new URL(route.pathname, `${proto}://${host}`);
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target);
}
