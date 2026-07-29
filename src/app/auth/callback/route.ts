import { NextResponse, type NextRequest } from "next/server";

import { ROUTES, sanitizeRedirect } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Titik pendaratan Magic Link dan OAuth.
 *
 * Menukar `code` dengan sesi, lalu mengarahkan ke tujuan. Kalau merchant belum
 * mengisi username, proxy yang akan membelokkannya ke /onboarding — jadi di
 * sini tidak perlu ada pengecekan tambahan.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeRedirect(searchParams.get("next"));

  // Supabase mengirim error di query string kalau tautan kedaluwarsa/dibatalkan.
  const authError = searchParams.get("error");
  if (authError) {
    const description = searchParams.get("error_description") ?? authError;
    return NextResponse.redirect(
      `${origin}${ROUTES.authError}?reason=${encodeURIComponent(description)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}${ROUTES.authError}?reason=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}${ROUTES.authError}?reason=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
