import { NextResponse, type NextRequest } from "next/server";

import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign out lewat POST supaya tidak bisa dipicu dari tautan atau <img> milik
 * situs lain (logout CSRF).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase.auth.signOut();
  }

  return NextResponse.redirect(new URL(ROUTES.login, request.url), {
    status: 303,
  });
}
