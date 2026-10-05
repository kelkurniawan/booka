import { ImageResponse } from "next/og";

import { OG_IMAGE_SIZE } from "@/lib/site";

export const alt = "Booka — terima booking dan DP lewat satu tautan";
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

/** Gambar pratinjau saat tautan booka dibagikan di WhatsApp/Instagram. */
export default function Image() {
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
          background: "#faf9f7",
          color: "#18181b",
        }}
      >
        <div style={{ fontSize: 40, fontFamily: "monospace" }}>booka</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>
            Terima booking dan DP lewat satu tautan.
          </div>
          <div style={{ fontSize: 34, color: "#52525b" }}>
            Dana masuk langsung ke rekening Anda. Gratis untuk mulai.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
