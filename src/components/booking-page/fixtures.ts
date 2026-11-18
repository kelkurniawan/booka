import type { PickerTable, TablePickerData } from "@/lib/booking/reservation";
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
    party_min: null,
    party_max: null,
    seat_duration_minutes: null,
    court_unit_minutes: null,
    court_max_minutes: null,
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
    section_order: ["LINKS", "PROMO", "SERVICES", "FAQ"],
    hidden_sections: [],
    show_social_icons: true,
    public_whatsapp: false,
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
  party_size: null,
  table_label: null,
  customer_note: null,
  capacity_mode: "NONE" as const,
};

/** Token contoh (48 hex) untuk story /pesanan/[token]. */
export const sampleToken = "0".repeat(48);

const svgUri = (fill: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${fill}"/></svg>`)}`;

/** Staf contoh untuk story; nama dan isinya fiktif. */
export const sampleStaff = [
  { id: "s1", name: "Sekar Contoh", role: "Penata rias", bio: null, tags: [], photoUrl: null, motionUrl: null, posterUrl: null },
  { id: "s2", name: "Dewi Contoh", role: "Terapis", bio: null, tags: [], photoUrl: null, motionUrl: null, posterUrl: null },
  { id: "s3", name: "Rani Contoh", role: null, bio: null, tags: [], photoUrl: null, motionUrl: null, posterUrl: null },
];

export const sampleStaffProfile = {
  ...sampleStaff[0],
  bio: "Sepuluh tahun merias pengantin dan acara keluarga.",
  tags: ["Pengantin", "Natural", "Hijab"],
  photoUrl: svgUri("#c9b8a6"),
  posterUrl: svgUri("#a89684"),
  motionUrl: "/contoh-klip.mp4",
};

function meja(
  id: string,
  areaId: string,
  name: string,
  [minSeats, maxSeats]: [number, number],
  [x, y, w, h]: [number, number, number, number],
  shape: PickerTable["shape"],
  note: string,
  status: PickerTable["status"],
): PickerTable {
  return { id, areaId, name, minSeats, maxSeats, shape, x, y, w, h, note, status };
}

/** Denah contoh restoran (fiktif) untuk 4 tamu: area Dalam D1 sampai D8, Teras T1 sampai T4. */
export const fixtureTablePicker: TablePickerData = {
  areas: [
    { id: "area-dalam", name: "Dalam" },
    { id: "area-teras", name: "Teras" },
  ],
  tables: [
    meja("d1", "area-dalam", "D1", [2, 2], [1, 2, 4, 4], "ROUND", "dekat jendela", "TOO_SMALL"),
    meja("d2", "area-dalam", "D2", [2, 2], [7, 2, 4, 4], "ROUND", "dekat jendela", "TOO_SMALL"),
    meja("d3", "area-dalam", "D3", [4, 4], [13, 2, 4, 4], "ROUND", "dekat jendela", "FREE"),
    meja("d4", "area-dalam", "D4", [4, 4], [19, 2, 4, 4], "ROUND", "dekat jendela", "TAKEN"),
    meja("d5", "area-dalam", "D5", [4, 6], [2, 9, 8, 5], "RECT", "tengah ruangan", "FREE"),
    meja("d6", "area-dalam", "D6", [4, 6], [13, 9, 8, 5], "RECT", "tengah ruangan", "FREE"),
    meja("d7", "area-dalam", "D7", [2, 4], [2, 16, 5, 5], "RECT", "dekat pintu", "FREE"),
    meja("d8", "area-dalam", "D8", [6, 8], [10, 16, 10, 5], "RECT", "meja panjang", "TAKEN"),
    meja("t1", "area-teras", "T1", [2, 4], [2, 3, 5, 5], "ROUND", "teras, bebas rokok", "FREE"),
    meja("t2", "area-teras", "T2", [2, 4], [9, 3, 5, 5], "ROUND", "teras, bebas rokok", "TAKEN"),
    meja("t3", "area-teras", "T3", [4, 4], [16, 3, 5, 5], "ROUND", "teras, bebas rokok", "FREE"),
    meja("t4", "area-teras", "T4", [6, 10], [4, 13, 16, 6], "RECT", "teras, meja panjang", "FREE"),
  ],
};

/** Slot reservasi contoh: dua jam terakhir hampir penuh. */
export const sampleSeatSlots = sampleSlots.map((slot, i) => ({
  ...slot,
  remaining: i === 6 ? 2 : i === 7 ? 1 : null,
}));
