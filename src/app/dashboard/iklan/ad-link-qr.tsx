"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/** QR dari tautan pendek. Unduh PNG dan SVG lewat tautan <a download>. */
export function AdLinkQr({ url, filename, ariaLabel, canDownload = true }: { url: string; filename: string; ariaLabel: string; canDownload?: boolean }) {
  const [png, setPng] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const opts = { margin: 2, errorCorrectionLevel: "M" as const };
    QRCode.toDataURL(url, { ...opts, width: 1024 }).then((d) => live && setPng(d)).catch(() => live && setPng(null));
    QRCode.toString(url, { ...opts, type: "svg" })
      .then((s) => live && setSvg(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [url]);

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL, bukan aset yang dioptimasi */}
      {png ? <img src={png} alt={ariaLabel} width={184} height={184} className="rounded-md bg-white" /> : <div className="size-[184px] animate-pulse rounded-md bg-muted" aria-hidden />}
      <div className="flex gap-2">
        <Button asChild variant="outline" disabled={!canDownload || !png}>
          <a href={canDownload && png ? png : undefined} download={`${filename}.png`} aria-disabled={!canDownload || !png}>Unduh PNG</a>
        </Button>
        <Button asChild variant="outline" disabled={!canDownload || !svg}>
          <a href={canDownload && svg ? svg : undefined} download={`${filename}.svg`} aria-disabled={!canDownload || !svg}>Unduh SVG</a>
        </Button>
      </div>
    </div>
  );
}
