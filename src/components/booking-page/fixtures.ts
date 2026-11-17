import { resolveTheme } from "@/lib/theme/resolve";
import type { ResolvedTheme } from "@/lib/theme/types";
import type {
  Merchant,
  MerchantFaq,
  MerchantTheme,
  Service,
  ThemePreset,
} from "@/types/database";

// Data contoh untuk Storybook dan uji. Semuanya fiktif: tanpa angka kinerja
// atau testimoni karangan. Jangan impor src/lib/theme/fonts.ts dari sini.

export const sampleMerchant: Pick<
  Merchant,
  "id" | "full_name" | "bio" | "avatar_url" | "subscription_tier"
> & { username: string } = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "rias-by-sekar",
  full_name: "Rias by Sekar (contoh)",
  bio: "Contoh profil: rias untuk wisuda, pesta, dan pengantin.",
  avatar_url: null,
  subscription_tier: "PRO",
};

const waktu = "2026-01-01T00:00:00Z";

function layanan(
  id: string,
  name: string,
  description: string,
  price: number,
  duration_minutes: number,
  sort_order: number,
): Service {
  return {
    id,
    merchant_id: sampleMerchant.id,
    name,
    description,
    price,
    duration_minutes,
    is_active: true,
    sort_order,
    created_at: waktu,
    updated_at: waktu,
  };
}

export const sampleServices: Service[] = [
  layanan("00000000-0000-4000-8000-0000000000a1", "Makeup Wisuda", "Contoh layanan: riasan natural tahan seharian.", 350000, 90, 0),
  layanan("00000000-0000-4000-8000-0000000000a2", "Makeup Pesta", "Contoh layanan: riasan untuk acara malam.", 450000, 120, 1),
  layanan("00000000-0000-4000-8000-0000000000a3", "Makeup Pengantin", "Contoh layanan: termasuk uji coba riasan.", 1500000, 240, 2),
];

export const sampleFaqs: MerchantFaq[] = [
  { question: "Apakah bisa datang ke rumah?", answer: "Contoh jawaban: bisa, dengan biaya transport sesuai jarak." },
  { question: "Berapa DP yang harus dibayar?", answer: "Contoh jawaban: DP dibayar saat memesan, sisanya di hari acara." },
].map((faq, index) => ({
  id: `00000000-0000-4000-8000-0000000000f${index}`,
  merchant_id: sampleMerchant.id,
  ...faq,
  sort_order: index,
  created_at: waktu,
  updated_at: waktu,
}));

/** Tema PRO dengan preset tertentu, lewat resolveTheme seperti halaman asli. */
export function sampleTheme(preset: ThemePreset): ResolvedTheme {
  const row: MerchantTheme = {
    merchant_id: sampleMerchant.id,
    preset,
    accent: null,
    background_style: "SOLID",
    background_color: null,
    background_image_path: null,
    background_overlay: 40,
    font_pair: null,
    text_scale: "SEDANG",
    corner_style: null,
    created_at: waktu,
    updated_at: waktu,
  };
  return resolveTheme("PRO", row);
}
