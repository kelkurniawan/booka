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
 *   3. Merchant yang belum mengisi username diarahkan ke /onboarding.
 *      Lookup `merchants` untuk aturan ini dijalankan di TIGA kondisi,
 *      bukan untuk semua request privat -- lihat pembagiannya di dalam
 *      `updateSession`:
 *        a. GET ke /dashboard/* -- TIDAK di sini. src/app/dashboard/layout.tsx
 *           (lewat requireMerchant() di src/lib/auth/session.ts) membungkus
 *           SEMUA rute /dashboard/* tanpa kecuali dan menegakkan redirect
 *           yang identik satu request pass kemudian, jadi query di sini
 *           murni duplikat -- inilah optimasinya, satu query lebih sedikit
 *           per navigasi halaman dashboard.
 *        b. Non-GET ke /dashboard/* (Server Action) -- DI SINI. Server
 *           Action dieksekusi sebagai handler POST langsung; Next.js TIDAK
 *           me-render layout.tsx dulu sebelum action-nya jalan (render
 *           ulang RSC baru terjadi SETELAH action selesai), jadi
 *           requireMerchant() di layout datang terlambat untuk request
 *           semacam ini. Proxy me-redirect request ini ke /onboarding
 *           SEBELUM sampai ke handler action -- TAPI ini bukan hard-block:
 *           `NextResponse.redirect` di sini default 307, yang
 *           mempertahankan method dan body, dan action client Next.js
 *           mengikuti redirect (mem-POST ulang ke /onboarding, rute yang
 *           dikecualikan gate ini). Jadi mutasinya "dibelokkan", bukan
 *           ditolak murni -- perilaku redirect yang SAMA seperti yang
 *           sudah berlaku untuk request lain ke rute privat sebelum task
 *           ini, bukan sesuatu yang baru diperkenalkan di sini.
 *        c. /onboarding (semua method) -- DI SINI, karena tidak ada
 *           dashboard/layout.tsx yang membungkusnya -- proxy satu-satunya
 *           tempat yang bisa menegakkan aturan ini untuk rute tersebut,
 *           termasuk memantulkan merchant yang SUDAH onboarding keluar
 *           dari halaman ini.
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

  const onOnboarding = pathname === ROUTES.onboarding;

  // Lookup merchants dijalankan untuk /onboarding (semua method) ATAU
  // untuk /dashboard/* yang non-GET (Server Action) -- lihat kondisi (a),
  // (b), (c) di komentar atas fungsi ini. GET ke /dashboard/* SENGAJA
  // dilewati: itu tanggung jawab dashboard/layout.tsx satu request pass
  // kemudian.
  const needsOnboardingLookup =
    onOnboarding || (protectedPath && request.method !== "GET");

  if (needsOnboardingLookup) {
    const { data: merchant } = await supabase
      .from("merchants")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    const onboarded = Boolean(merchant?.username);

    // Non-GET ke /dashboard/* dari merchant yang belum onboarding --
    // dibelokkan (redirect 307, bukan hard-block) ke /onboarding di sini
    // karena layout.tsx datang terlambat untuk Server Action (lihat poin b
    // di komentar atas fungsi ini).
    if (!onboarded && !onOnboarding) {
      const url = request.nextUrl.clone();
      url.pathname = ROUTES.onboarding;
      url.search = "";
      return withCookies(NextResponse.redirect(url), response);
    }

    // Merchant yang sudah onboarding tidak boleh balik ke /onboarding.
    if (onboarded && onOnboarding) {
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
