import type { Metadata } from "next";

import { ROUTES } from "@/lib/routes";

// Manifest per booking untuk SEMUA halaman /pesanan/[token]/*, supaya "Tambah
// ke Layar Utama" dari halaman mana pun membuka booking yang benar (Keputusan 15).
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  return { manifest: ROUTES.bookingManifest(token) };
}

export default function BookingTokenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
