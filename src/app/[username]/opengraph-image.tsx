import { ImageResponse } from "next/og";

import { OG_IMAGE_SIZE } from "@/lib/site";
import { createPublicClient } from "@/lib/supabase/server";
import { resolveTheme } from "@/lib/theme/resolve";
import type { MerchantTheme } from "@/types/database";

export const alt = "Halaman booking";
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

/** Bio panjang dipotong supaya tidak meluber keluar kanvas. */
const BIO_MAX_CHARS = 140;

/**
 * Pratinjau tautan merchant saat dibagikan di WhatsApp/Instagram.
 *
 * Warnanya diambil dari `resolveTheme()` -- satu-satunya sumber tampilan
 * halaman publik (AGENTS.md) -- supaya pratinjau dan halamannya tidak
 * pernah berbeda warna. Foto profil SENGAJA tidak dimuat: URL-nya bisa dari
 * Google atau bucket kita, dan satu gambar yang gagal diambil membuat
 * seluruh pratinjau gagal. Inisial nama cukup sebagai penanda.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const { data: merchant } = await createPublicClient()
    .from("merchants")
    .select("username, full_name, bio, subscription_tier, merchant_themes(*)")
    .eq("username", username)
    .maybeSingle();

  const themeRaw = (merchant as { merchant_themes?: MerchantTheme | MerchantTheme[] | null } | null)
    ?.merchant_themes;
  const themeRow = Array.isArray(themeRaw) ? (themeRaw[0] ?? null) : (themeRaw ?? null);
  const theme = resolveTheme(merchant?.subscription_tier ?? "STARTER", themeRow);

  const name = merchant?.full_name ?? merchant?.username ?? username;
  const bio = merchant?.bio
    ? merchant.bio.length > BIO_MAX_CHARS
      ? `${merchant.bio.slice(0, BIO_MAX_CHARS - 1)}…`
      : merchant.bio
    : "Pilih layanan, jadwal, dan bayar DP lewat QRIS.";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: theme.background,
          color: theme.foreground,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <div
            style={{
              width: 128,
              height: 128,
              borderRadius: 64,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 64,
              fontWeight: 700,
              background: theme.accentFill,
              color: theme.accentForeground,
            }}
          >
            {name.trim().charAt(0).toUpperCase() || "B"}
          </div>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, maxWidth: 840 }}>
            {name}
          </div>
        </div>
        <div style={{ fontSize: 36, color: theme.mutedForeground, lineHeight: 1.35 }}>{bio}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30 }}>
          <div
            style={{
              padding: "14px 28px",
              borderRadius: 999,
              background: theme.accentFill,
              color: theme.accentForeground,
            }}
          >
            Pesan jadwal sekarang
          </div>
          <div style={{ fontFamily: "monospace", color: theme.mutedForeground }}>booka</div>
        </div>
      </div>
    ),
    size,
  );
}
