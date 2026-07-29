import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 mengganti nama konvensi `middleware.ts` menjadi `proxy.ts`
 * dengan named export `proxy`.
 */
export async function proxy(request: NextRequest) {
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
