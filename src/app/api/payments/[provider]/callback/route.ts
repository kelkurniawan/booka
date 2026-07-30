import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { serverEnv } from "@/lib/env/server";
import { storeMerchantCredential } from "@/lib/payments/credentials";
import {
  getOAuthConfig,
  isOAuthConfigured,
  oauthStateCookieName,
  parseProviderParam,
} from "@/lib/payments/oauth-config";
import { ROUTES } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { PaymentEnvironment, PaymentProvider } from "@/types/database";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  /** ID akun merchant di sisi provider, kalau providernya mengembalikannya. */
  merchant_id?: string;
};

/** Perbandingan string yang tahan timing attack -- dipakai untuk cek `state` OAuth. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function environmentFromServerEnv(provider: PaymentProvider): PaymentEnvironment {
  const env = serverEnv();
  const processEnv = provider === "MIDTRANS" ? env.midtransEnv : env.xenditEnv;
  return processEnv === "production" ? "PRODUCTION" : "SANDBOX";
}

/**
 * Selesaikan alur OAuth Connect: verifikasi `state`, tukar `code` dengan
 * token, lalu simpan koneksi (`connection_mode = 'OAUTH'`) dan kredensial
 * terenkripsi.
 *
 * Ditulis lengkap sesuai briefing meski MIDTRANS_CLIENT_ID/XENDIT_CLIENT_ID
 * masih kosong hari ini -- connect/route.ts sudah menolak sebelum sampai
 * sini kalau client id belum ada, tapi handler ini tetap menjaga diri
 * sendiri (memeriksa isOAuthConfigured lagi) untuk kasus URL callback
 * diakses langsung.
 */
export async function GET(
  request: NextRequest,
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

  function failRedirect(reason: string) {
    const url = new URL(ROUTES.payments, appUrl);
    url.searchParams.set("oauth_error", reason);
    url.searchParams.set("provider", provider as PaymentProvider);
    const response = NextResponse.redirect(url);
    response.cookies.delete(oauthStateCookieName(provider as PaymentProvider));
    return response;
  }

  const searchParams = request.nextUrl.searchParams;
  const providerError = searchParams.get("error");
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get(oauthStateCookieName(provider))?.value;

  if (providerError) return failRedirect("denied");
  if (!code || !state || !expectedState || !safeEqual(state, expectedState)) {
    return failRedirect("invalid_state");
  }

  const config = getOAuthConfig(provider);
  if (!isOAuthConfigured(config) || !config.clientSecret) {
    return failRedirect("not_configured");
  }

  let tokenResponse: TokenResponse;
  try {
    const tokenRequest = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId as string,
        client_secret: config.clientSecret,
        code,
        redirect_uri: new URL(
          `/api/payments/${provider.toLowerCase()}/callback`,
          appUrl,
        ).toString(),
      }),
    });

    if (!tokenRequest.ok) return failRedirect("token_exchange_failed");
    tokenResponse = (await tokenRequest.json()) as TokenResponse;
  } catch {
    return failRedirect("token_exchange_failed");
  }

  if (!tokenResponse.access_token) return failRedirect("token_exchange_failed");

  const admin = createAdminClient();
  const { data: connection, error: connectionError } = await admin
    .from("payment_connections")
    .upsert(
      {
        merchant_id: user.id,
        provider,
        provider_account_id: tokenResponse.merchant_id ?? null,
        status: "ACTIVE",
        connection_mode: "OAUTH",
        environment: environmentFromServerEnv(provider),
        scope: tokenResponse.scope ?? null,
        token_expires_at: tokenResponse.expires_in
          ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
          : null,
      },
      { onConflict: "merchant_id,provider" },
    )
    .select("id")
    .single();

  if (connectionError || !connection) {
    return failRedirect("save_failed");
  }

  try {
    await storeMerchantCredential({
      merchantId: user.id,
      provider,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? null,
    });
  } catch {
    return failRedirect("save_failed");
  }

  const successUrl = new URL(ROUTES.payments, appUrl);
  successUrl.searchParams.set("connected", provider);
  const response = NextResponse.redirect(successUrl);
  response.cookies.delete(oauthStateCookieName(provider));
  return response;
}
