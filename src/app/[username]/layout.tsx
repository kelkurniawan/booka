import type { ReactNode } from "react";

/**
 * Rute ini sengaja punya layout sendiri supaya aturan @font-face keenam
 * keluarga tema hanya ikut di CSS halaman publik -- dashboard dan landing tidak
 * perlu menanggungnya. Kelas variabelnya sendiri dipasang BookingPageShell,
 * karena preview di dashboard memakai shell yang sama tanpa lewat layout ini.
 */
export default function MerchantPublicLayout({ children }: { children: ReactNode }) {
  return children;
}
