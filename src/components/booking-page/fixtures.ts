import type { FreeSlot } from "@/lib/booking/slots";
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
    payment_mode: "FULL",
    deposit_type: null,
    deposit_value: null,
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
export function sampleTheme(
  preset: ThemePreset,
  ubah: Partial<MerchantTheme> = {},
): ResolvedTheme {
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
    logo_path: null,
    cover_path: null,
    button_style: "FILLED",
    section_order: ["PROMO", "SERVICES", "FAQ"],
    hidden_sections: [],
    background_motion: "BENTUK",
    background_motion_speed: "SLOW",
    created_at: waktu,
    updated_at: waktu,
    ...ubah,
  };
  return resolveTheme("PRO", row);
}

/** Slot contoh dari pagi sampai malam, jam dinding Jakarta (UTC+7). */
export const sampleSlots: FreeSlot[] = [
  "08:00", "09:30", "11:00", "13:00", "14:30", "15:00", "16:30", "18:00", "19:30",
].map((label) => {
  const [h, m] = label.split(":").map(Number);
  const start = new Date(Date.UTC(2026, 10, 20, h - 7, m));
  return {
    label,
    startUtc: start.toISOString(),
    endUtc: new Date(start.getTime() + 90 * 60 * 1000).toISOString(),
  };
});

/** Booking contoh untuk /pesanan/[token]: Sabtu 21 Nov 2026, 10.00 sampai 11.30 WIB. */
export const sampleBooking = {
  id: "00000000-0000-4000-8000-0000000000b1",
  merchant_id: sampleMerchant.id,
  service_name: "Makeup Wisuda",
  service_price: 105000,
  start_datetime: "2026-11-21T03:00:00Z",
  end_datetime: "2026-11-21T04:30:00Z",
  customer_name: "Dewi Contoh",
  status: "PAID" as const,
  payment_url: null,
  paid_at: "2026-11-20T08:00:00Z",
  cancelled_at: null,
  cancel_reason: null,
  expires_at: "2026-11-20T08:15:00Z",
  payment_mode: "FULL" as const,
  amount_due_now: 105000,
  amount_due_on_site: 0,
  paid_on_site_at: null,
  voucher_code: null,
  discount_amount: 0,
};

/** Token contoh (48 hex) untuk story /pesanan/[token]. */
export const sampleToken = "0".repeat(48);
