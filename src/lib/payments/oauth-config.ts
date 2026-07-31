import "server-only";

import { serverEnv } from "@/lib/env/server";
import type { PaymentProvider } from "@/types/database";

export type OAuthProviderConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
  scope: string;
};

/**
 * Konfigurasi OAuth Connect per provider.
 *
 * Midtrans dan Xendit belum menerbitkan dokumentasi publik untuk alur OAuth
 * partner-nya ke Booka -- URL di bawah adalah kerangka authorization-code
 * flow standar (OAuth 2.0), untuk diisi ulang begitu Booka menerima
 * kredensial partner resmi. Sampai saat itu tiba, `midtransClientId` /
 * `xenditClientId` di .env kosong, dan `isOAuthConfigured()` melaporkan
 * "belum aktif" sebelum URL ini pernah benar-benar dipanggil (lihat
 * connect/route.ts) -- jadi salah/belum akuratnya URL ini tidak berdampak
 * ke pengguna nyata sampai kredensial partner tersedia.
 */
export function getOAuthConfig(provider: PaymentProvider): OAuthProviderConfig {
  const env = serverEnv();

  if (provider === "MIDTRANS") {
    return {
      authorizeUrl: "https://accounts.midtrans.com/oauth/authorize",
      tokenUrl: "https://accounts.midtrans.com/oauth/token",
      clientId: env.midtransClientId,
      clientSecret: env.midtransClientSecret,
      scope: "transaction:read transaction:write",
    };
  }

  return {
    authorizeUrl: "https://dashboard.xendit.co/oauth/authorize",
    tokenUrl: "https://api.xendit.co/oauth/token",
    clientId: env.xenditClientId,
    clientSecret: env.xenditClientSecret,
    scope: "qr_code:read qr_code:write",
  };
}

export function isOAuthConfigured(config: OAuthProviderConfig): boolean {
  return Boolean(config.clientId);
}

/** Segmen URL `[provider]` (`midtrans`/`xendit`) -> enum `PaymentProvider`. */
export function parseProviderParam(raw: string): PaymentProvider | null {
  const upper = raw.toUpperCase();
  return upper === "MIDTRANS" || upper === "XENDIT" ? (upper as PaymentProvider) : null;
}

/** Nama cookie state OAuth per provider -- httpOnly, dibaca lagi di callback untuk cek CSRF. */
export function oauthStateCookieName(provider: PaymentProvider): string {
  return `oauth_state_${provider.toLowerCase()}`;
}

