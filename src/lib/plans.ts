import type { SubscriptionTier } from "@/types/database";

export type PlanFeature = {
  label: string;
  /**
   * True selama fiturnya belum benar-benar jalan. Ditampilkan dengan label
   * "Segera hadir" alih-alih dijanjikan seakan sudah ada -- merchant yang
   * membayar untuk fitur yang tidak ada adalah masalah kepercayaan, bukan
   * sekadar bug.
   */
  comingSoon?: boolean;
};

export type Plan = {
  tier: SubscriptionTier;
  name: string;
  price: string;
  period: string;
  /** Untuk siapa paket ini, satu kalimat pendek. */
  audience: string;
  features: PlanFeature[];
};

/**
 * Satu-satunya sumber daftar paket. Dipakai halaman depan dan
 * /dashboard/billing, dan batasnya WAJIB sejalan dengan penegakan di
 * database (trigger enforce_service_limit, bookings_enforce_quota,
 * merchant_themes_enforce_tier) serta /syarat.
 */
export const PLANS: Plan[] = [
  {
    tier: "STARTER",
    name: "Starter",
    price: "Gratis",
    period: "selamanya",
    audience: "Baru mulai, ingin coba dulu",
    features: [
      { label: "10 transaksi per bulan" },
      { label: "1 jenis layanan" },
      { label: "Halaman booking + QRIS" },
      { label: "Notifikasi email & WhatsApp" },
      { label: "3 tema halaman + FAQ" },
      { label: "Ada watermark Booka" },
    ],
  },
  {
    tier: "PRO",
    name: "Pro",
    price: "Rp79.000",
    period: "per bulan",
    audience: "Sudah rutin menerima pesanan",
    features: [
      { label: "Transaksi tanpa batas" },
      { label: "Layanan tanpa batas" },
      { label: "Reminder WhatsApp H-1 ke pelanggan" },
      { label: "Tanpa watermark" },
      { label: "Semua tema, warna, dan font sendiri" },
      { label: "Video pada layanan" },
    ],
  },
  {
    tier: "STUDIO",
    name: "Studio",
    price: "Rp199.000",
    period: "per bulan",
    audience: "Punya tim dan beberapa staf",
    features: [
      { label: "Semua fitur Pro" },
      { label: "Jadwal per staf", comingSoon: true },
      { label: "Laporan dan analitik", comingSoon: true },
      { label: "Domain sendiri", comingSoon: true },
    ],
  },
];

export const COMING_SOON_LABEL = "Segera hadir";
