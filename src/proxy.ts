import type { NextRequest } from "next/server";

import { handleCustomDomain } from "@/lib/domains/proxy";
import { isAppHost } from "@/lib/domains/routing";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 mengganti nama konvensi `middleware.ts` menjadi `proxy.ts`
 * dengan named export `proxy`.
 *
 * Request lewat domain sendiri merchant (paket Studio) ditangani terpisah
 * dan TIDAK melewati updateSession: di sana hanya halaman publik yang
 * hidup, jadi tidak ada sesi yang perlu disegarkan.
 */
export async function proxy(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  if (host && !isAppHost(host, process.env.NEXT_PUBLIC_APP_URL)) {
    const handled = await handleCustomDomain(request, host);
    if (handled) return handled;
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Jalankan pada semua path kecuali:
     *   - aset build Next.js (_next/static, _next/image)
     *   - favicon dan berkas statis di /public
     *   - route handler di /api (menangani sesinya sendiri; membiarkannya
     *     lewat sini akan menambah satu round-trip ke Auth per webhook)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
