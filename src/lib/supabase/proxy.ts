import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { ROUTES, isGuestOnlyPath, isProtectedPath } from "@/lib/routes";
import type { Database } from "@/types/database";

/**
 * Menyegarkan sesi Supabase dan menegakkan aturan akses rute.
 *
 * Dipanggil dari src/proxy.ts pada setiap request halaman. Selain merefresh
 * token, di sinilah aturan navigasi ditegakkan:
 *
 *   1. /dashboard dan /onboarding butuh sesi -- ini batas keamanannya,
 *      ditegakkan dengan getUser() di bawah.
 *   2. Merchant yang sudah onboarding tidak bisa kembali ke /onboarding
 *      atau /login.
 *   3. Merchant yang belum mengisi username diarahkan ke /onboarding --
 *      TAPI proxy ini cuma menegakkannya untuk rute /onboarding sendiri
 *      (memantulkan merchant yang SUDAH onboarding keluar dari halaman
 *      itu). Untuk /dashboard/*, redirect "belum onboarding -> /onboarding"
 *      sepenuhnya jadi tanggung jawab src/app/dashboard/layout.tsx (lewat
 *      requireMerchant() di src/lib/auth/session.ts), yang membungkus SEMUA
 *      rute /dashboard/* tanpa kecuali. Ini BUKAN lubang keamanan: proxy
 *      dulu melakukan query merchants yang sama persis untuk /dashboard/*,
 *      murni duplikat dari yang sudah dilakukan layout satu request pass
 *      kemudian. Menghapusnya di sini menghapus satu query per navigasi
 *      dashboard tanpa mengubah ke mana user berakhir.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Env dibaca langsung, bukan lewat serverEnv(), karena modul ini ikut
  // ter-bundle ke Edge Runtime dan tidak boleh menarik `server-only`.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Tanpa konfigurasi Supabase tidak ada sesi yang bisa diverifikasi, jadi
    // rute privat ditutup total daripada dibiarkan terbuka.
    if (isProtectedPath(request.nextUrl.pathname)) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY belum diisi. " +
          "Salin .env.example ke .env.local dan lengkapi nilainya.",
      );
    }
    return response;
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() memvalidasi token ke server Auth. Jangan diganti getSession(),
  // yang hanya membaca cookie dan bisa dipalsukan.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const protectedPath = isProtectedPath(pathname);

  if (!user) {
    if (protectedPath) {
      const url = request.nextUrl.clone();
      url.pathname = ROUTES.login;
      url.search = "";
      url.searchParams.set("next", pathname);
      return withCookies(NextResponse.redirect(url), response);
    }
    return response;
  }

  // /reset-password sengaja tidak termasuk di sini — halaman itu justru dibuka
  // dalam keadaan bersesi, lewat tautan pemulihan dari email.
  if (isGuestOnlyPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.dashboard;
    url.search = "";
    return withCookies(NextResponse.redirect(url), response);
  }

  if (pathname === ROUTES.onboarding) {
    // Satu lookup primary key, hanya untuk /onboarding -- satu-satunya rute
    // privat yang TIDAK dibungkus dashboard/layout.tsx, jadi proxy-lah
    // satu-satunya tempat yang bisa memantulkan merchant yang sudah
    // onboarding keluar dari halaman ini. (Redirect sebaliknya -- belum
    // onboarding ke /onboarding -- untuk /dashboard/* ditangani layout,
    // lihat komentar di atas fungsi ini.)
    const { data: merchant } = await supabase
      .from("merchants")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    if (merchant?.username) {
      const url = request.nextUrl.clone();
      url.pathname = ROUTES.dashboard;
      url.search = "";
      return withCookies(NextResponse.redirect(url), response);
    }
  }

  return response;
}

/**
 * Memindahkan cookie sesi yang baru di-refresh ke response redirect. Tanpa ini
 * token hasil refresh hilang dan user terlempar ke login pada request
 * berikutnya.
 */
function withCookies(target: NextResponse, source: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}
