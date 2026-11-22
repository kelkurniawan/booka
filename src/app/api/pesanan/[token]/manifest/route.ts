import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * GET /api/pesanan/[token]/manifest
 *
 * Manifest per booking supaya "Tambahkan ke layar utama" membuka halaman
 * pesanan yang tepat (iOS hanya mengizinkan web push dari PWA terpasang).
 * Tanpa query database: bentuk token saja yang diperiksa, isinya statis.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) {
    return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }
  const path = `/pesanan/${token}`;
  return new NextResponse(
    JSON.stringify({
      name: "Booking Anda",
      short_name: "Booking",
      start_url: path,
      scope: path,
      display: "standalone",
      background_color: "#ffffff",
      // Ikon Marky (public/brand, dibuat npm run brand:icons) sebagai ikon bawaan aplikasi pesanan.
      icons: [
        { src: "/brand/marky-192.png", sizes: "192x192", type: "image/png" },
        { src: "/brand/marky-512.png", sizes: "512x512", type: "image/png" },
      ],
    }),
    { headers: { "content-type": "application/manifest+json", "cache-control": "private, no-store" } },
  );
}
