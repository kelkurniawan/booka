import type {
  AcquisitionSource,
  BookingChannel,
  IdProvince,
  MerchantGoal,
  TeamSize,
} from "@/types/database";

/**
 * Label Indonesia untuk setiap nilai enum blok opsional kuesioner onboarding.
 *
 * Modul MURNI (tidak mengimpor React) supaya dipakai bersama oleh langkah
 * wizard (`app/onboarding/steps/*`) dan `ProfileNudge` di dashboard tanpa
 * menulis label yang sama dua kali. Label kategori usaha TIDAK diulang di
 * sini -- sudah ada di `BUSINESS_CATEGORIES` (`src/lib/business/catalog.ts`).
 */

export const TEAM_SIZE_LABELS: Record<TeamSize, string> = {
  SENDIRI: "Saya sendiri",
  KECIL_2_5: "2-5 orang",
  MENENGAH_6_15: "6-15 orang",
  BESAR_15_PLUS: "Lebih dari 15 orang",
};

export const BOOKING_CHANNEL_LABELS: Record<BookingChannel, string> = {
  WHATSAPP: "Chat WhatsApp",
  INSTAGRAM_DM: "DM Instagram",
  TELEPON: "Telepon",
  DATANG_LANGSUNG: "Datang langsung",
  APLIKASI_LAIN: "Aplikasi atau website lain",
  BELUM_ADA: "Belum menerima pesanan",
};

export const MERCHANT_GOAL_LABELS: Record<MerchantGoal, string> = {
  NO_SHOW: "Pelanggan batal atau tidak datang",
  DP_SULIT: "Susah meminta DP di depan",
  JADWAL_BENTROK: "Jadwal bentrok atau dobel",
  CHAT_BERULANG: "Capek membalas pertanyaan yang sama",
  HALAMAN_RAPI: "Belum punya halaman rapi untuk dibagikan",
  LAPORAN_PEMASUKAN: "Sulit melihat pemasukan",
};

export const ACQUISITION_SOURCE_LABELS: Record<AcquisitionSource, string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  TEMAN: "Teman atau rekomendasi",
  GOOGLE: "Pencarian Google",
  KOMUNITAS: "Komunitas atau grup",
  LAINNYA: "Lainnya",
};

/**
 * Label 38 provinsi. Tipe `Record<IdProvince, string>` (BUKAN `Partial`)
 * membuat typecheck gagal bila ada provinsi yang terlewat -- itulah
 * penjaganya.
 */
export const ID_PROVINCE_LABELS: Record<IdProvince, string> = {
  ACEH: "Aceh",
  SUMATERA_UTARA: "Sumatera Utara",
  SUMATERA_BARAT: "Sumatera Barat",
  RIAU: "Riau",
  KEPULAUAN_RIAU: "Kepulauan Riau",
  JAMBI: "Jambi",
  SUMATERA_SELATAN: "Sumatera Selatan",
  KEPULAUAN_BANGKA_BELITUNG: "Kepulauan Bangka Belitung",
  BENGKULU: "Bengkulu",
  LAMPUNG: "Lampung",
  DKI_JAKARTA: "DKI Jakarta",
  JAWA_BARAT: "Jawa Barat",
  BANTEN: "Banten",
  JAWA_TENGAH: "Jawa Tengah",
  DI_YOGYAKARTA: "DI Yogyakarta",
  JAWA_TIMUR: "Jawa Timur",
  BALI: "Bali",
  NUSA_TENGGARA_BARAT: "Nusa Tenggara Barat",
  NUSA_TENGGARA_TIMUR: "Nusa Tenggara Timur",
  KALIMANTAN_BARAT: "Kalimantan Barat",
  KALIMANTAN_TENGAH: "Kalimantan Tengah",
  KALIMANTAN_SELATAN: "Kalimantan Selatan",
  KALIMANTAN_TIMUR: "Kalimantan Timur",
  KALIMANTAN_UTARA: "Kalimantan Utara",
  SULAWESI_UTARA: "Sulawesi Utara",
  GORONTALO: "Gorontalo",
  SULAWESI_TENGAH: "Sulawesi Tengah",
  SULAWESI_BARAT: "Sulawesi Barat",
  SULAWESI_SELATAN: "Sulawesi Selatan",
  SULAWESI_TENGGARA: "Sulawesi Tenggara",
  MALUKU: "Maluku",
  MALUKU_UTARA: "Maluku Utara",
  PAPUA: "Papua",
  PAPUA_BARAT: "Papua Barat",
  PAPUA_BARAT_DAYA: "Papua Barat Daya",
  PAPUA_TENGAH: "Papua Tengah",
  PAPUA_PEGUNUNGAN: "Papua Pegunungan",
  PAPUA_SELATAN: "Papua Selatan",
};
