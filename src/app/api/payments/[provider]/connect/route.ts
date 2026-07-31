import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { serverEnv } from "@/lib/env/server";
import {
  getOAuthConfig,
  isOAuthConfigured,
  oauthStateCookieName,
  parseProviderParam,
} from "@/lib/payments/oauth-config";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Mulai alur OAuth Connect: simpan `state` acak di cookie httpOnly, lalu
 * redirect ke halaman otorisasi provider. `state` dicocokkan lagi di
 * callback/route.ts untuk mencegah CSRF (penyerang memaksa korban menautkan
 * akun payment gateway penyerang ke merchant korban).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const appUrl = serverEnv().appUrl;
  const { provider: rawProvider } = await params;
  const provider = parseProviderParam(rawProvider);

  if (!provider) {
    return NextResponse.redirect(new URL(ROUTES.payments, appUrl));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL(ROUTES.login, appUrl));
  }

  const config = getOAuthConfig(provider);

  if (!isOAuthConfigured(config)) {
    const redirectUrl = new URL(ROUTES.payments, appUrl);
    redirectUrl.searchParams.set("oauth_error", "not_configured");
    redirectUrl.searchParams.set("provider", provider);
    return NextResponse.redirect(redirectUrl);
  }

  const state = randomBytes(32).toString("hex");

  const authorizeUrl = new URL(config.authorizeUrl);
  authorizeUrl.searchParams.set("client_id", config.clientId as string);
  authorizeUrl.searchParams.set(
    "redirect_uri",
    new URL(`/api/payments/${provider.toLowerCase()}/callback`, appUrl).toString(),
  );
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", config.scope);
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(oauthStateCookieName(provider), state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // 10 menit -- cukup untuk alur OAuth normal, cukup pendek untuk
    // membatasi jendela CSRF kalau cookie ini bocor.
    maxAge: 600,
    path: "/",
  });

  return response;
}
