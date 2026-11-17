import { renderOgCard } from "@/lib/marketing/og";
import { OG_IMAGE_SIZE } from "@/lib/site";

export const alt = "Marky: booking, DP, dan pengingat lewat satu tautan";
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

/** Gambar pratinjau saat tautan Marky dibagikan di WhatsApp/Instagram. */
export default function Image() {
  return renderOgCard({
    title: "Booking masuk sendiri. Anda tinggal melayani.",
    subtitle: "Satu tautan di bio untuk jadwal, DP, dan pengingat.",
  });
}
