import type { Metadata } from "next";

import { ROUTES } from "@/lib/routes";

// Manifest per booking untuk SEMUA halaman /pesanan/[token]/*, supaya "Tambah
// ke Layar Utama" dari halaman mana pun membuka booking yang benar (Keputusan 15).
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  // no-referrer: halaman berikutnya (mis. terima kasih, yang memuat pixel) tidak boleh menerima URL bertoken lewat document.referrer.
  return { manifest: ROUTES.bookingManifest(token), referrer: "no-referrer" };
}

export default function BookingTokenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
