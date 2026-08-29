import type { BusinessCategory } from "@/types/database";

/**
 * Katalog jenis usaha. SENGAJA di TypeScript, bukan tabel referensi --
 * mengikuti src/lib/theme/presets.ts dan font-pairs.ts. Konsekuensinya tidak
 * ada RLS baru, tidak ada seed migration, dan integritasnya diuji unit.
 *
 * Modul ini murni: tidak boleh mengimpor React maupun next/font.
 */

/** Template layanan yang ditawarkan di langkah 2 wizard. */
export type ServiceTemplate = {
  name: string;
  /** Harus di dalam constraint services_duration_range: 5..480. */
  durationMinutes: number;
  /**
   * Teks bantu di bawah kolom harga, misal "Umumnya Rp 40.000-80.000".
   * TIDAK PERNAH mengisi kolom harga -- harga adalah keputusan merchant.
   */
  priceHint: string;
};

export type BusinessType = {
  /** Harus lolos constraint merchant_profiles_type_slug_format. */
  slug: string;
  label: string;
  templates: ServiceTemplate[];
};

export type BusinessCategoryEntry = {
  id: BusinessCategory;
  label: string;
  /** Nama ikon lucide-react, dipetakan di komponen agar modul ini tetap murni. */
  icon: string;
  types: BusinessType[];
};

export const BUSINESS_CATEGORIES: readonly BusinessCategoryEntry[] = [
  {
    id: "KECANTIKAN",
    label: "Kecantikan & Perawatan",
    icon: "Scissors",
    types: [
      {
        slug: "salon-rambut",
        label: "Salon rambut",
        templates: [
          { name: "Potong rambut", durationMinutes: 45, priceHint: "Umumnya Rp 50.000-120.000" },
          { name: "Cuci & blow", durationMinutes: 45, priceHint: "Umumnya Rp 50.000-100.000" },
          { name: "Pewarnaan", durationMinutes: 120, priceHint: "Umumnya Rp 250.000-800.000" },
          { name: "Smoothing", durationMinutes: 180, priceHint: "Umumnya Rp 400.000-1.500.000" },
          { name: "Creambath", durationMinutes: 60, priceHint: "Umumnya Rp 75.000-150.000" },
        ],
      },
      {
        slug: "barbershop",
        label: "Barbershop",
        templates: [
          { name: "Potong rambut", durationMinutes: 45, priceHint: "Umumnya Rp 40.000-80.000" },
          { name: "Potong + keramas", durationMinutes: 60, priceHint: "Umumnya Rp 60.000-110.000" },
          { name: "Cukur jenggot", durationMinutes: 30, priceHint: "Umumnya Rp 30.000-60.000" },
          { name: "Pewarnaan", durationMinutes: 90, priceHint: "Umumnya Rp 150.000-400.000" },
        ],
      },
      {
        slug: "nail-art",
        label: "Nail art",
        templates: [
          { name: "Manicure", durationMinutes: 45, priceHint: "Umumnya Rp 50.000-100.000" },
          { name: "Pedicure", durationMinutes: 60, priceHint: "Umumnya Rp 60.000-120.000" },
          { name: "Nail art gel", durationMinutes: 90, priceHint: "Umumnya Rp 100.000-250.000" },
          { name: "Sambung kuku (nail extension)", durationMinutes: 120, priceHint: "Umumnya Rp 150.000-350.000" },
          { name: "Lepas gel/acrylic", durationMinutes: 30, priceHint: "Umumnya Rp 30.000-60.000" },
        ],
      },
      {
        slug: "eyelash-alis",
        label: "Eyelash & alis",
        templates: [
          { name: "Sulam alis", durationMinutes: 90, priceHint: "Umumnya Rp 150.000-400.000" },
          { name: "Extension bulu mata", durationMinutes: 90, priceHint: "Umumnya Rp 100.000-300.000" },
          { name: "Lash lift", durationMinutes: 60, priceHint: "Umumnya Rp 100.000-200.000" },
          { name: "Threading alis", durationMinutes: 20, priceHint: "Umumnya Rp 25.000-50.000" },
          { name: "Tinting alis", durationMinutes: 30, priceHint: "Umumnya Rp 40.000-80.000" },
        ],
      },
      {
        slug: "facial-skincare",
        label: "Facial & skincare",
        templates: [
          { name: "Facial wajah dasar", durationMinutes: 60, priceHint: "Umumnya Rp 100.000-200.000" },
          { name: "Chemical peeling", durationMinutes: 45, priceHint: "Umumnya Rp 150.000-350.000" },
          { name: "Microdermabrasi", durationMinutes: 60, priceHint: "Umumnya Rp 200.000-450.000" },
          { name: "Ekstraksi komedo", durationMinutes: 45, priceHint: "Umumnya Rp 80.000-150.000" },
          { name: "Masker skincare", durationMinutes: 30, priceHint: "Umumnya Rp 60.000-120.000" },
        ],
      },
      {
        slug: "spa-pijat",
        label: "Spa & pijat",
        templates: [
          { name: "Pijat relaksasi", durationMinutes: 60, priceHint: "Umumnya Rp 100.000-200.000" },
          { name: "Lulur badan", durationMinutes: 90, priceHint: "Umumnya Rp 120.000-250.000" },
          { name: "Spa refleksi kaki", durationMinutes: 60, priceHint: "Umumnya Rp 80.000-150.000" },
          { name: "Totok wajah", durationMinutes: 45, priceHint: "Umumnya Rp 100.000-200.000" },
          { name: "Paket spa pasangan", durationMinutes: 120, priceHint: "Umumnya Rp 300.000-600.000" },
        ],
      },
    ],
  },
  {
    id: "KESEHATAN",
    label: "Kesehatan & Kebugaran",
    icon: "HeartPulse",
    types: [
      {
        slug: "klinik",
        label: "Klinik & praktik dokter",
        templates: [
          { name: "Konsultasi dokter umum", durationMinutes: 20, priceHint: "Umumnya Rp 100.000-200.000" },
          { name: "Pemeriksaan kesehatan rutin", durationMinutes: 30, priceHint: "Umumnya Rp 150.000-300.000" },
          { name: "Vaksinasi", durationMinutes: 15, priceHint: "Umumnya Rp 150.000-500.000" },
          { name: "Medical check-up dasar", durationMinutes: 60, priceHint: "Umumnya Rp 300.000-800.000" },
          { name: "Konsultasi dokter spesialis", durationMinutes: 30, priceHint: "Umumnya Rp 200.000-500.000" },
        ],
      },
      {
        slug: "fisioterapi",
        label: "Fisioterapi",
        templates: [
          { name: "Evaluasi awal fisioterapi", durationMinutes: 30, priceHint: "Umumnya Rp 100.000-200.000" },
          { name: "Terapi fisik cedera olahraga", durationMinutes: 45, priceHint: "Umumnya Rp 150.000-300.000" },
          { name: "Terapi pasca stroke", durationMinutes: 60, priceHint: "Umumnya Rp 200.000-400.000" },
          { name: "Terapi nyeri punggung", durationMinutes: 45, priceHint: "Umumnya Rp 150.000-300.000" },
          { name: "Terapi tumbuh kembang anak", durationMinutes: 45, priceHint: "Umumnya Rp 150.000-350.000" },
        ],
      },
      {
        slug: "pijat-terapi",
        label: "Pijat terapi",
        templates: [
          { name: "Pijat urut tradisional", durationMinutes: 60, priceHint: "Umumnya Rp 80.000-150.000" },
          { name: "Pijat cedera olahraga", durationMinutes: 60, priceHint: "Umumnya Rp 100.000-200.000" },
          { name: "Bekam", durationMinutes: 45, priceHint: "Umumnya Rp 70.000-150.000" },
          { name: "Refleksi kaki", durationMinutes: 45, priceHint: "Umumnya Rp 60.000-120.000" },
          { name: "Pijat ibu hamil", durationMinutes: 60, priceHint: "Umumnya Rp 100.000-200.000" },
        ],
      },
      {
        slug: "personal-trainer",
        label: "Personal trainer",
        templates: [
          { name: "Sesi latihan personal", durationMinutes: 60, priceHint: "Umumnya Rp 100.000-300.000" },
          { name: "Program penurunan berat badan", durationMinutes: 60, priceHint: "Umumnya Rp 150.000-350.000" },
          { name: "Latihan pembentukan otot", durationMinutes: 60, priceHint: "Umumnya Rp 150.000-350.000" },
          { name: "Konsultasi program latihan", durationMinutes: 30, priceHint: "Umumnya Rp 50.000-150.000" },
        ],
      },
      {
        slug: "yoga-pilates",
        label: "Studio yoga/pilates",
        templates: [
          { name: "Kelas yoga grup", durationMinutes: 60, priceHint: "Umumnya Rp 50.000-100.000" },
          { name: "Kelas pilates grup", durationMinutes: 60, priceHint: "Umumnya Rp 60.000-120.000" },
          { name: "Sesi privat yoga", durationMinutes: 60, priceHint: "Umumnya Rp 150.000-300.000" },
          { name: "Yoga prenatal", durationMinutes: 60, priceHint: "Umumnya Rp 70.000-150.000" },
        ],
      },
      {
        slug: "konsultasi-gizi",
        label: "Konsultasi gizi",
        templates: [
          { name: "Konsultasi gizi awal", durationMinutes: 45, priceHint: "Umumnya Rp 150.000-300.000" },
          { name: "Penyusunan program diet", durationMinutes: 60, priceHint: "Umumnya Rp 200.000-400.000" },
          { name: "Konsultasi gizi lanjutan", durationMinutes: 30, priceHint: "Umumnya Rp 100.000-200.000" },
          { name: "Evaluasi pola makan", durationMinutes: 30, priceHint: "Umumnya Rp 100.000-200.000" },
        ],
      },
    ],
  },
  {
    id: "FOTOGRAFI",
    label: "Fotografi & Videografi",
    icon: "Camera",
    types: [
      {
        slug: "studio-foto",
        label: "Studio foto",
        templates: [
          { name: "Sesi foto studio individu", durationMinutes: 60, priceHint: "Umumnya Rp 150.000-350.000" },
          { name: "Sesi foto keluarga", durationMinutes: 90, priceHint: "Umumnya Rp 300.000-600.000" },
          { name: "Sesi foto konsep/tema", durationMinutes: 120, priceHint: "Umumnya Rp 400.000-800.000" },
          { name: "Cetak & edit foto tambahan", durationMinutes: 30, priceHint: "Umumnya Rp 50.000-150.000" },
        ],
      },
      {
        slug: "prewedding",
        label: "Prewedding",
        templates: [
          { name: "Paket prewedding indoor", durationMinutes: 180, priceHint: "Umumnya Rp 1.500.000-3.500.000" },
          { name: "Paket prewedding outdoor", durationMinutes: 240, priceHint: "Umumnya Rp 2.000.000-5.000.000" },
          { name: "Paket prewedding konsep khusus", durationMinutes: 300, priceHint: "Umumnya Rp 3.000.000-7.000.000" },
          { name: "Sesi foto engagement", durationMinutes: 120, priceHint: "Umumnya Rp 1.000.000-2.500.000" },
        ],
      },
      {
        slug: "dokumentasi-acara",
        label: "Dokumentasi acara",
        templates: [
          { name: "Dokumentasi pernikahan (half day)", durationMinutes: 360, priceHint: "Umumnya Rp 2.500.000-6.000.000" },
          { name: "Dokumentasi ulang tahun", durationMinutes: 180, priceHint: "Umumnya Rp 800.000-2.000.000" },
          { name: "Dokumentasi acara korporat", durationMinutes: 240, priceHint: "Umumnya Rp 1.500.000-3.500.000" },
          { name: "Dokumentasi wisuda", durationMinutes: 120, priceHint: "Umumnya Rp 500.000-1.200.000" },
        ],
      },
      {
        slug: "foto-produk",
        label: "Foto produk",
        templates: [
          { name: "Foto produk katalog", durationMinutes: 60, priceHint: "Umumnya Rp 150.000-400.000" },
          { name: "Foto produk untuk marketplace", durationMinutes: 45, priceHint: "Umumnya Rp 100.000-300.000" },
          { name: "Foto produk dengan model", durationMinutes: 90, priceHint: "Umumnya Rp 300.000-700.000" },
          { name: "Video singkat produk", durationMinutes: 60, priceHint: "Umumnya Rp 250.000-600.000" },
        ],
      },
      {
        slug: "videografi",
        label: "Videografi",
        templates: [
          { name: "Video pernikahan (highlight)", durationMinutes: 360, priceHint: "Umumnya Rp 3.000.000-8.000.000" },
          { name: "Video profil bisnis", durationMinutes: 180, priceHint: "Umumnya Rp 1.500.000-4.000.000" },
          { name: "Video dokumentasi acara", durationMinutes: 240, priceHint: "Umumnya Rp 1.500.000-3.500.000" },
          { name: "Video konten media sosial", durationMinutes: 90, priceHint: "Umumnya Rp 500.000-1.500.000" },
        ],
      },
    ],
  },
  {
    id: "ACARA",
    label: "Perias & Jasa Acara",
    icon: "PartyPopper",
    types: [
      {
        slug: "mua",
        label: "Perias (MUA)",
        templates: [
          { name: "Make up wisuda", durationMinutes: 60, priceHint: "Umumnya Rp 150.000-350.000" },
          { name: "Make up pesta", durationMinutes: 60, priceHint: "Umumnya Rp 200.000-450.000" },
          { name: "Make up pengantin", durationMinutes: 120, priceHint: "Umumnya Rp 1.000.000-3.000.000" },
          { name: "Make up prewedding", durationMinutes: 90, priceHint: "Umumnya Rp 500.000-1.200.000" },
          { name: "Touch up di lokasi", durationMinutes: 30, priceHint: "Umumnya Rp 100.000-250.000" },
        ],
      },
      {
        slug: "dekorasi",
        label: "Dekorasi",
        templates: [
          { name: "Dekorasi ulang tahun", durationMinutes: 180, priceHint: "Umumnya Rp 500.000-1.500.000" },
          { name: "Dekorasi pernikahan", durationMinutes: 360, priceHint: "Umumnya Rp 3.000.000-10.000.000" },
          { name: "Dekorasi balon", durationMinutes: 120, priceHint: "Umumnya Rp 300.000-800.000" },
          { name: "Dekorasi backdrop foto", durationMinutes: 90, priceHint: "Umumnya Rp 250.000-700.000" },
        ],
      },
      {
        slug: "wedding-organizer",
        label: "Wedding organizer",
        templates: [
          { name: "Paket WO akad nikah", durationMinutes: 300, priceHint: "Umumnya Rp 3.000.000-7.000.000" },
          { name: "Paket WO full wedding", durationMinutes: 480, priceHint: "Umumnya Rp 8.000.000-25.000.000" },
          { name: "Konsultasi perencanaan acara", durationMinutes: 60, priceHint: "Umumnya Rp 200.000-500.000" },
          { name: "Koordinasi hari-H", durationMinutes: 480, priceHint: "Umumnya Rp 2.000.000-5.000.000" },
        ],
      },
      {
        slug: "sewa-busana",
        label: "Sewa busana",
        templates: [
          { name: "Sewa gaun pesta", durationMinutes: 30, priceHint: "Umumnya Rp 150.000-500.000" },
          { name: "Sewa jas pengantin", durationMinutes: 30, priceHint: "Umumnya Rp 300.000-800.000" },
          { name: "Sewa kebaya", durationMinutes: 30, priceHint: "Umumnya Rp 250.000-700.000" },
          { name: "Sewa busana anak", durationMinutes: 20, priceHint: "Umumnya Rp 75.000-200.000" },
        ],
      },
      {
        slug: "katering",
        label: "Katering",
        templates: [
          { name: "Katering nasi kotak", durationMinutes: 60, priceHint: "Umumnya Rp 25.000-50.000 per porsi" },
          { name: "Katering prasmanan", durationMinutes: 120, priceHint: "Umumnya Rp 50.000-100.000 per porsi" },
          { name: "Katering snack box", durationMinutes: 60, priceHint: "Umumnya Rp 15.000-35.000 per porsi" },
          { name: "Katering tumpeng", durationMinutes: 90, priceHint: "Umumnya Rp 250.000-600.000" },
        ],
      },
      {
        slug: "hiburan-musik",
        label: "Hiburan & musik",
        templates: [
          { name: "Live music akustik", durationMinutes: 120, priceHint: "Umumnya Rp 800.000-2.000.000" },
          { name: "Band pengiring acara", durationMinutes: 180, priceHint: "Umumnya Rp 2.000.000-5.000.000" },
          { name: "MC acara", durationMinutes: 180, priceHint: "Umumnya Rp 500.000-1.500.000" },
          { name: "DJ acara", durationMinutes: 180, priceHint: "Umumnya Rp 1.000.000-3.000.000" },
        ],
      },
    ],
  },
  {
    id: "PENDIDIKAN",
    label: "Pendidikan & Kursus",
    icon: "GraduationCap",
    types: [
      {
        slug: "les-akademik",
        label: "Les privat akademik",
        templates: [
          { name: "Les privat matematika", durationMinutes: 60, priceHint: "Umumnya Rp 75.000-150.000" },
          { name: "Les privat semua mata pelajaran", durationMinutes: 90, priceHint: "Umumnya Rp 100.000-200.000" },
          { name: "Les persiapan ujian masuk", durationMinutes: 90, priceHint: "Umumnya Rp 100.000-250.000" },
          { name: "Les calistung anak", durationMinutes: 60, priceHint: "Umumnya Rp 60.000-120.000" },
        ],
      },
      {
        slug: "kursus-musik",
        label: "Kursus musik",
        templates: [
          { name: "Kursus piano", durationMinutes: 60, priceHint: "Umumnya Rp 100.000-200.000" },
          { name: "Kursus gitar", durationMinutes: 60, priceHint: "Umumnya Rp 80.000-180.000" },
          { name: "Kursus vokal", durationMinutes: 60, priceHint: "Umumnya Rp 100.000-200.000" },
          { name: "Kursus drum", durationMinutes: 60, priceHint: "Umumnya Rp 100.000-200.000" },
        ],
      },
      {
        slug: "kursus-bahasa",
        label: "Kursus bahasa",
        templates: [
          { name: "Kursus bahasa Inggris", durationMinutes: 60, priceHint: "Umumnya Rp 75.000-175.000" },
          { name: "Kursus bahasa Mandarin", durationMinutes: 60, priceHint: "Umumnya Rp 90.000-200.000" },
          { name: "Kursus persiapan TOEFL/IELTS", durationMinutes: 90, priceHint: "Umumnya Rp 150.000-300.000" },
          { name: "Kursus bahasa untuk anak", durationMinutes: 45, priceHint: "Umumnya Rp 60.000-130.000" },
        ],
      },
      {
        slug: "mengaji",
        label: "Mengaji",
        templates: [
          { name: "Les mengaji privat", durationMinutes: 45, priceHint: "Umumnya Rp 50.000-100.000" },
          { name: "Tahsin Al-Quran", durationMinutes: 60, priceHint: "Umumnya Rp 60.000-120.000" },
          { name: "Tahfidz Al-Quran", durationMinutes: 60, priceHint: "Umumnya Rp 60.000-130.000" },
          { name: "Kelas mengaji anak", durationMinutes: 45, priceHint: "Umumnya Rp 40.000-90.000" },
        ],
      },
      {
        slug: "kursus-keterampilan",
        label: "Kursus keterampilan",
        templates: [
          { name: "Kursus menjahit", durationMinutes: 90, priceHint: "Umumnya Rp 100.000-250.000" },
          { name: "Kursus memasak", durationMinutes: 120, priceHint: "Umumnya Rp 150.000-350.000" },
          { name: "Kursus melukis", durationMinutes: 90, priceHint: "Umumnya Rp 100.000-200.000" },
          { name: "Kursus komputer dasar", durationMinutes: 60, priceHint: "Umumnya Rp 75.000-150.000" },
        ],
      },
      {
        slug: "bimbingan-karier",
        label: "Bimbingan karier",
        templates: [
          { name: "Konsultasi CV & LinkedIn", durationMinutes: 45, priceHint: "Umumnya Rp 100.000-250.000" },
          { name: "Simulasi wawancara kerja", durationMinutes: 60, priceHint: "Umumnya Rp 150.000-350.000" },
          { name: "Konsultasi perencanaan karier", durationMinutes: 60, priceHint: "Umumnya Rp 150.000-300.000" },
          { name: "Pelatihan public speaking", durationMinutes: 90, priceHint: "Umumnya Rp 200.000-450.000" },
        ],
      },
    ],
  },
  {
    id: "HEWAN",
    label: "Perawatan Hewan",
    icon: "PawPrint",
    types: [
      {
        slug: "grooming-hewan",
        label: "Grooming",
        templates: [
          { name: "Mandi & sisir kucing", durationMinutes: 45, priceHint: "Umumnya Rp 50.000-100.000" },
          { name: "Mandi & sisir anjing", durationMinutes: 60, priceHint: "Umumnya Rp 60.000-150.000" },
          { name: "Potong kuku hewan", durationMinutes: 15, priceHint: "Umumnya Rp 20.000-40.000" },
          { name: "Grooming lengkap (mandi, potong bulu, kuku)", durationMinutes: 90, priceHint: "Umumnya Rp 100.000-250.000" },
        ],
      },
      {
        slug: "klinik-hewan",
        label: "Klinik hewan",
        templates: [
          { name: "Konsultasi dokter hewan", durationMinutes: 20, priceHint: "Umumnya Rp 100.000-200.000" },
          { name: "Vaksinasi hewan", durationMinutes: 15, priceHint: "Umumnya Rp 100.000-300.000" },
          { name: "Sterilisasi (kebiri/steril)", durationMinutes: 90, priceHint: "Umumnya Rp 300.000-800.000" },
          { name: "Pemeriksaan kesehatan hewan", durationMinutes: 30, priceHint: "Umumnya Rp 100.000-250.000" },
        ],
      },
      {
        slug: "penitipan-hewan",
        label: "Penitipan",
        templates: [
          { name: "Penitipan harian", durationMinutes: 480, priceHint: "Umumnya Rp 50.000-100.000 per hari" },
          { name: "Penitipan menginap", durationMinutes: 480, priceHint: "Umumnya Rp 75.000-150.000 per malam" },
          { name: "Penitipan dengan grooming", durationMinutes: 480, priceHint: "Umumnya Rp 120.000-250.000 per hari" },
          { name: "Antar-jemput hewan", durationMinutes: 60, priceHint: "Umumnya Rp 30.000-75.000" },
        ],
      },
      {
        slug: "pelatihan-hewan",
        label: "Pelatihan",
        templates: [
          { name: "Pelatihan dasar kepatuhan", durationMinutes: 60, priceHint: "Umumnya Rp 100.000-200.000" },
          { name: "Pelatihan mengatasi masalah perilaku", durationMinutes: 60, priceHint: "Umumnya Rp 150.000-300.000" },
          { name: "Sesi sosialisasi hewan", durationMinutes: 45, priceHint: "Umumnya Rp 75.000-150.000" },
          { name: "Pelatihan lanjutan (trik & komando)", durationMinutes: 60, priceHint: "Umumnya Rp 150.000-300.000" },
        ],
      },
    ],
  },
  {
    id: "OTOMOTIF",
    label: "Otomotif",
    icon: "Car",
    types: [
      {
        slug: "bengkel-mobil",
        label: "Bengkel mobil",
        templates: [
          { name: "Servis berkala", durationMinutes: 120, priceHint: "Umumnya Rp 150.000-400.000" },
          { name: "Ganti oli mesin", durationMinutes: 30, priceHint: "Umumnya Rp 100.000-300.000" },
          { name: "Tune up mesin", durationMinutes: 90, priceHint: "Umumnya Rp 150.000-350.000" },
          { name: "Servis rem", durationMinutes: 60, priceHint: "Umumnya Rp 100.000-300.000" },
          { name: "Spooring & balancing", durationMinutes: 60, priceHint: "Umumnya Rp 100.000-200.000" },
        ],
      },
      {
        slug: "bengkel-motor",
        label: "Bengkel motor",
        templates: [
          { name: "Servis berkala motor", durationMinutes: 60, priceHint: "Umumnya Rp 50.000-150.000" },
          { name: "Ganti oli motor", durationMinutes: 20, priceHint: "Umumnya Rp 50.000-120.000" },
          { name: "Ganti ban motor", durationMinutes: 30, priceHint: "Umumnya Rp 75.000-200.000" },
          { name: "Servis kelistrikan motor", durationMinutes: 60, priceHint: "Umumnya Rp 75.000-200.000" },
        ],
      },
      {
        slug: "salon-detailing",
        label: "Salon & detailing",
        templates: [
          { name: "Cuci detailing mobil", durationMinutes: 120, priceHint: "Umumnya Rp 100.000-250.000" },
          { name: "Poles bodi mobil", durationMinutes: 180, priceHint: "Umumnya Rp 300.000-700.000" },
          { name: "Coating mobil", durationMinutes: 300, priceHint: "Umumnya Rp 1.000.000-3.000.000" },
          { name: "Cuci karpet & jok mobil", durationMinutes: 90, priceHint: "Umumnya Rp 150.000-350.000" },
        ],
      },
      {
        slug: "cuci-kendaraan",
        label: "Cuci kendaraan",
        templates: [
          { name: "Cuci mobil standar", durationMinutes: 45, priceHint: "Umumnya Rp 30.000-60.000" },
          { name: "Cuci motor standar", durationMinutes: 20, priceHint: "Umumnya Rp 15.000-30.000" },
          { name: "Cuci mobil + wax", durationMinutes: 60, priceHint: "Umumnya Rp 50.000-100.000" },
          { name: "Semir ban", durationMinutes: 10, priceHint: "Umumnya Rp 10.000-20.000" },
        ],
      },
      {
        slug: "servis-ac-mobil",
        label: "Servis AC mobil",
        templates: [
          { name: "Servis AC mobil standar", durationMinutes: 60, priceHint: "Umumnya Rp 100.000-250.000" },
          { name: "Isi freon AC mobil", durationMinutes: 30, priceHint: "Umumnya Rp 100.000-200.000" },
          { name: "Ganti kompresor AC", durationMinutes: 120, priceHint: "Umumnya Rp 800.000-2.000.000" },
          { name: "Cuci evaporator AC", durationMinutes: 90, priceHint: "Umumnya Rp 200.000-400.000" },
        ],
      },
    ],
  },
  {
    id: "SERVIS",
    label: "Servis & Perbaikan",
    icon: "Wrench",
    types: [
      {
        slug: "servis-ac",
        label: "Servis AC",
        templates: [
          { name: "Cuci AC rumah", durationMinutes: 60, priceHint: "Umumnya Rp 50.000-100.000" },
          { name: "Isi freon AC rumah", durationMinutes: 45, priceHint: "Umumnya Rp 100.000-250.000" },
          { name: "Perbaikan AC", durationMinutes: 90, priceHint: "Umumnya Rp 150.000-400.000" },
          { name: "Pasang AC baru", durationMinutes: 180, priceHint: "Umumnya Rp 300.000-700.000" },
        ],
      },
      {
        slug: "servis-elektronik",
        label: "Servis elektronik",
        templates: [
          { name: "Servis TV", durationMinutes: 60, priceHint: "Umumnya Rp 100.000-250.000" },
          { name: "Servis kulkas", durationMinutes: 90, priceHint: "Umumnya Rp 150.000-350.000" },
          { name: "Servis mesin cuci", durationMinutes: 90, priceHint: "Umumnya Rp 150.000-350.000" },
          { name: "Servis kipas angin", durationMinutes: 30, priceHint: "Umumnya Rp 50.000-100.000" },
        ],
      },
      {
        slug: "servis-gadget",
        label: "Servis gadget",
        templates: [
          { name: "Ganti layar HP", durationMinutes: 60, priceHint: "Umumnya Rp 200.000-800.000" },
          { name: "Ganti baterai HP", durationMinutes: 30, priceHint: "Umumnya Rp 100.000-300.000" },
          { name: "Servis laptop", durationMinutes: 90, priceHint: "Umumnya Rp 150.000-500.000" },
          { name: "Instal ulang software", durationMinutes: 60, priceHint: "Umumnya Rp 75.000-200.000" },
        ],
      },
      {
        slug: "laundry",
        label: "Laundry",
        templates: [
          { name: "Cuci kiloan reguler", durationMinutes: 30, priceHint: "Umumnya Rp 6.000-10.000 per kg" },
          { name: "Cuci kiloan express (same day)", durationMinutes: 30, priceHint: "Umumnya Rp 12.000-20.000 per kg" },
          { name: "Cuci sepatu", durationMinutes: 30, priceHint: "Umumnya Rp 25.000-60.000" },
          { name: "Cuci selimut/bed cover", durationMinutes: 30, priceHint: "Umumnya Rp 30.000-70.000" },
        ],
      },
      {
        slug: "kebersihan-rumah",
        label: "Kebersihan rumah",
        templates: [
          { name: "Bersih-bersih rumah reguler", durationMinutes: 180, priceHint: "Umumnya Rp 150.000-350.000" },
          { name: "General cleaning", durationMinutes: 300, priceHint: "Umumnya Rp 300.000-700.000" },
          { name: "Cuci sofa", durationMinutes: 90, priceHint: "Umumnya Rp 100.000-250.000" },
          { name: "Cuci kasur/springbed", durationMinutes: 60, priceHint: "Umumnya Rp 80.000-200.000" },
        ],
      },
      {
        slug: "tukang-renovasi",
        label: "Tukang & renovasi",
        templates: [
          { name: "Perbaikan ringan rumah", durationMinutes: 120, priceHint: "Umumnya Rp 150.000-400.000" },
          { name: "Pengecatan ruangan", durationMinutes: 240, priceHint: "Umumnya Rp 300.000-800.000" },
          { name: "Pasang keramik", durationMinutes: 300, priceHint: "Umumnya Rp 500.000-1.500.000" },
          { name: "Perbaikan atap bocor", durationMinutes: 180, priceHint: "Umumnya Rp 300.000-700.000" },
        ],
      },
    ],
  },
  {
    id: "KONSULTASI",
    label: "Konsultasi Profesional",
    icon: "Briefcase",
    types: [
      {
        slug: "psikolog-konseling",
        label: "Psikolog & konseling",
        templates: [
          { name: "Konsultasi psikolog individu", durationMinutes: 60, priceHint: "Umumnya Rp 250.000-600.000" },
          { name: "Konseling pasangan", durationMinutes: 90, priceHint: "Umumnya Rp 350.000-800.000" },
          { name: "Konsultasi anak & remaja", durationMinutes: 60, priceHint: "Umumnya Rp 250.000-600.000" },
          { name: "Terapi kelompok", durationMinutes: 90, priceHint: "Umumnya Rp 150.000-400.000" },
        ],
      },
      {
        slug: "konsultan-bisnis",
        label: "Konsultan bisnis",
        templates: [
          { name: "Konsultasi strategi bisnis", durationMinutes: 60, priceHint: "Umumnya Rp 300.000-800.000" },
          { name: "Penyusunan rencana bisnis", durationMinutes: 120, priceHint: "Umumnya Rp 500.000-1.500.000" },
          { name: "Konsultasi keuangan usaha", durationMinutes: 60, priceHint: "Umumnya Rp 300.000-700.000" },
          { name: "Pendampingan startup", durationMinutes: 90, priceHint: "Umumnya Rp 400.000-1.000.000" },
        ],
      },
      {
        slug: "konsultan-pajak",
        label: "Konsultan pajak",
        templates: [
          { name: "Konsultasi pajak pribadi", durationMinutes: 45, priceHint: "Umumnya Rp 150.000-350.000" },
          { name: "Konsultasi pajak usaha", durationMinutes: 60, priceHint: "Umumnya Rp 250.000-600.000" },
          { name: "Pelaporan SPT tahunan", durationMinutes: 60, priceHint: "Umumnya Rp 200.000-500.000" },
          { name: "Pendampingan audit pajak", durationMinutes: 120, priceHint: "Umumnya Rp 500.000-1.500.000" },
        ],
      },
      {
        slug: "notaris-hukum",
        label: "Notaris & hukum",
        templates: [
          { name: "Konsultasi hukum", durationMinutes: 45, priceHint: "Umumnya Rp 200.000-500.000" },
          { name: "Pembuatan akta notaris", durationMinutes: 60, priceHint: "Umumnya Rp 500.000-2.000.000" },
          { name: "Legalisasi dokumen", durationMinutes: 30, priceHint: "Umumnya Rp 100.000-300.000" },
          { name: "Pendampingan penyusunan kontrak", durationMinutes: 90, priceHint: "Umumnya Rp 400.000-1.000.000" },
        ],
      },
      {
        slug: "desain-kreatif",
        label: "Desain & kreatif",
        templates: [
          { name: "Desain logo", durationMinutes: 120, priceHint: "Umumnya Rp 300.000-1.000.000" },
          { name: "Desain konten media sosial", durationMinutes: 60, priceHint: "Umumnya Rp 100.000-300.000" },
          { name: "Desain kemasan produk", durationMinutes: 120, priceHint: "Umumnya Rp 300.000-800.000" },
          { name: "Konsultasi branding", durationMinutes: 60, priceHint: "Umumnya Rp 250.000-600.000" },
        ],
      },
    ],
  },
  {
    id: "LAINNYA",
    label: "Lainnya",
    icon: "Sparkles",
    types: [],
  },
];

export const BUSINESS_TYPE_SLUGS: readonly string[] = BUSINESS_CATEGORIES.flatMap(
  (category) => category.types.map((type) => type.slug),
);

export function findCategory(
  id: BusinessCategory,
): BusinessCategoryEntry | undefined {
  return BUSINESS_CATEGORIES.find((category) => category.id === id);
}

export function typesForCategory(
  id: BusinessCategory,
): readonly BusinessType[] {
  return findCategory(id)?.types ?? [];
}

export function findBusinessType(slug: string): BusinessType | undefined {
  for (const category of BUSINESS_CATEGORIES) {
    const found = category.types.find((type) => type.slug === slug);
    if (found) return found;
  }
  return undefined;
}
