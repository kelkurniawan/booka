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
    return NextResponse.redirect(`${origin}${ROUTES.authError}?reason=${reasonCode(error)}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

/**
 * Menerjemahkan kegagalan `exchangeCodeForSession` menjadi kode sebab yang
 * stabil untuk halaman /auth/auth-code-error.
 *
 * Sengaja BUKAN meneruskan `error.message` mentah. Pesan supabase-js berupa
 * kalimat bahasa Inggris yang bisa berubah sewaktu-waktu, dan halaman error
 * mencocokkannya dengan tabel kode — teks bebas tidak pernah cocok, sehingga
 * SEMUA kegagalan tampil sebagai "tautan kedaluwarsa". Itu menyembunyikan
 * sebab yang paling sering terjadi dan paling bisa ditindaklanjuti pengguna:
 * tautan PKCE dibuka di browser/perangkat yang berbeda dari yang memintanya
 * (minta tautan di laptop, buka emailnya di HP), yang sama sekali bukan soal
 * kedaluwarsa.
 */
function reasonCode(error: { message: string }): string {
  const message = error.message.toLowerCase();

  if (message.includes("code verifier")) return "pkce_verifier_missing";
  if (message.includes("expired")) return "otp_expired";
  if (message.includes("already used") || message.includes("invalid")) return "code_used";

  return "exchange_failed";
}
