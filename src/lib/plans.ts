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
  /** Harga bulanan dalam rupiah, untuk JSON-LD. Starter gratis (0). */
  monthlyPriceIdr: number;
  /** Untuk siapa paket ini, satu kalimat pendek. */
  audience: string;
  features: PlanFeature[];
};

/**
 * Batas transaksi bulanan Starter. WAJIB sama dengan angka di fungsi
 * SQL `my_quota_usage` / trigger `bookings_enforce_quota`
 * (supabase/migrations/20260730000200_enforce_booking_quota.sql): tidak ada
 * sumber TS untuk angka itu, jadi ubah keduanya bersama.
 */
export const STARTER_MONTHLY_TRANSACTIONS = 10;

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
    monthlyPriceIdr: 0,
    audience: "Baru mulai, ingin coba dulu",
    features: [
      { label: `${STARTER_MONTHLY_TRANSACTIONS} transaksi per bulan` },
      { label: "1 jenis layanan" },
      { label: "Halaman booking + QRIS" },
      { label: "Notifikasi email & WhatsApp" },
      { label: "3 tema halaman + FAQ" },
      { label: "Ada watermark Marky" },
    ],
  },
  {
    tier: "PRO",
    name: "Pro",
    price: "Rp79.000",
    period: "per bulan",
    monthlyPriceIdr: 79000,
    audience: "Sudah rutin menerima pesanan",
    features: [
      { label: "Transaksi tanpa batas" },
      { label: "Layanan tanpa batas" },
      { label: "Pengingat ke pelanggan lewat WhatsApp, email, dan notifikasi HP" },
      { label: "Tanpa watermark" },
      { label: "Semua tema, warna, dan font sendiri" },
      { label: "Video pada layanan" },
      { label: "Voucher dan banner promosi" },
      { label: "Foto sampul, gaya tombol, dan latar bergerak" },
    ],
  },
  {
    tier: "STUDIO",
    name: "Studio",
    price: "Rp199.000",
    period: "per bulan",
    monthlyPriceIdr: 199000,
    audience: "Punya tim dan beberapa staf",
    features: [
      { label: "Semua fitur Pro" },
      { label: "Staf dengan jadwal, foto, dan klip sendiri" },
      { label: "Laporan dan analitik" },
      { label: "Domain sendiri" },
    ],
  },
];

export const COMING_SOON_LABEL = "Segera hadir";

export type ComparisonRow = {
  label: string;
  /** null berarti paket tidak termasuk fitur ini (ditampilkan "Tidak"). */
  values: Record<SubscriptionTier, string | null>;
};

/** Tabel perbandingan di landing page; isinya dari kanvas, satu sumber dengan PLANS. */
export const PLAN_COMPARISON: readonly ComparisonRow[] = [
  {
    label: "Transaksi per bulan",
    values: { STARTER: String(STARTER_MONTHLY_TRANSACTIONS), PRO: "Tanpa batas", STUDIO: "Tanpa batas" },
  },
  {
    label: "Jenis layanan",
    values: { STARTER: "1", PRO: "Tanpa batas", STUDIO: "Tanpa batas" },
  },
  {
    label: "Halaman booking dan QRIS",
    values: { STARTER: "Ya", PRO: "Ya", STUDIO: "Ya" },
  },
  {
    label: "Notifikasi email dan WhatsApp",
    values: { STARTER: "Ya", PRO: "Ya", STUDIO: "Ya" },
  },
  {
    label: "Reminder WhatsApp H-1",
    values: { STARTER: null, PRO: "Ya", STUDIO: "Ya" },
  },
  {
    label: "Tema, warna, dan font sendiri",
    values: { STARTER: "3 tema", PRO: "Semua", STUDIO: "Semua" },
  },
  {
    label: "Staf dengan jadwal sendiri",
    values: { STARTER: null, PRO: null, STUDIO: "Ya" },
  },
  {
    label: "Domain sendiri",
    values: { STARTER: null, PRO: null, STUDIO: "Ya" },
  },
];
