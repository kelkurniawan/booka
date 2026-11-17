"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** Kartu QR untuk melanjutkan booking di HP. Hanya tampil di layar lebar. */
export function DesktopHandoff({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let batal = false;
    QRCode.toDataURL(url, { margin: 2, width: 160, errorCorrectionLevel: "M" })
      .then((data) => {
        if (!batal) setSrc(data);
      })
      .catch(() => {
        // QR hanya bonus di desktop; tanpa gambar kartu disembunyikan.
      });
    return () => {
      batal = true;
    };
  }, [url]);

  if (!src) return null;
  return (
    <aside
      className="bg-card border-border fixed right-6 bottom-6 hidden w-48 flex-col items-center gap-2 border p-4 text-center lg:flex"
      style={{ borderRadius: "var(--radius)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={`Kode QR menuju ${url}`} width={160} height={160} />
      <p className="text-sm font-medium">Lebih nyaman di HP</p>
      <p className="text-muted-foreground text-xs">Pindai untuk lanjut booking di HP Anda.</p>
    </aside>
  );
}
