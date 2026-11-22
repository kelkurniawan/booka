import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { markDataUri } from "@/lib/brand/mark";
import { OG_IMAGE_SIZE } from "@/lib/site";

// Satori tidak membaca oklch, jadi hex dari token Coral (Keputusan 19).
const PAPER = "#f7f3ef";
const INK = "#1d1814";
const MUTED = "#625a54";
const STAMP = "#b8492f";

/** Kartu OG bersama untuk beranda dan halaman per jenis usaha. */
export async function renderOgCard({ title, subtitle }: { title: string; subtitle: string }) {
  const font = await readFile(
    join(process.cwd(), "src/assets/fonts/general-sans/GeneralSans-Semibold.otf"),
  );
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
          background: PAPER,
          color: INK,
          fontFamily: "General Sans",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Satori hanya mengenal <img> */}
            <img src={markDataUri({ color: INK })} width={46} height={46} alt="" />
            <div style={{ fontSize: 44, letterSpacing: -2 }}>marky</div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: STAMP,
              border: `3px solid ${STAMP}`,
              borderRadius: 8,
              padding: "4px 18px",
              transform: "rotate(-4deg)",
            }}
          >
            Lunas
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, lineHeight: 1.05, letterSpacing: -2 }}>{title}</div>
          <div style={{ fontSize: 34, color: MUTED }}>{subtitle}</div>
        </div>
      </div>
    ),
    { ...OG_IMAGE_SIZE, fonts: [{ name: "General Sans", data: font, style: "normal", weight: 600 }] },
  );
}
