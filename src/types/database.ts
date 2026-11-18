/**
 * Tipe database.
 *
 * Ditulis manual agar cocok dengan supabase/migrations/*.sql. Begitu Supabase
 * CLI tersedia, file ini bisa digantikan hasil generate:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 */

export type SubscriptionTier = "STARTER" | "PRO" | "STUDIO";
export type BookingStatus = "PENDING" | "PAID" | "CANCELLED" | "CONFIRMED" | "REQUESTED";
export type TableMode = "NONE" | "AREA" | "TABLE";
export type DiningTableShape = "ROUND" | "RECT";
export type PaymentMode = "FULL" | "DEPOSIT" | "ON_SITE" | "REQUEST";
/** ONLINE dari halaman publik, MANUAL dicatat merchant dari dashboard. */
export type BookingSource = "ONLINE" | "MANUAL";
export type DepositType = "PERCENT" | "FIXED";
export type OnSitePaymentMethod = "CASH" | "QRIS" | "TRANSFER";
export type VoucherKind = "PERCENT" | "FIXED";
export type VoucherVisibility = "PUBLIC" | "PRIVATE";
export type BannerSource = "TEMPLATE" | "IMAGE";
export type BannerColor = "ACCENT" | "DARK" | "SOFT";
export type BannerTarget = "VOUCHER" | "SERVICE" | "URL";
export type PaymentProvider = "MIDTRANS" | "XENDIT";
export type ConnectionStatus = "ACTIVE" | "EXPIRED" | "REVOKED";
export type ConnectionMode = "OAUTH" | "MANUAL_KEY";
export type PaymentEnvironment = "SANDBOX" | "PRODUCTION";

export type ThemePreset =
  | "BERSIH"
  | "HANGAT"
  | "MALAM"
  | "PASTEL"
  | "BERANI"
  | "ELEGAN";
export type BackgroundStyle = "SOLID" | "GRADIENT" | "IMAGE" | "MOTION";
export type AdChannel = "IG_BIO" | "META_ADS" | "TIKTOK_ADS" | "WA_STATUS" | "OTHER";
export type FunnelEventKind = "VIEW" | "SERVICE" | "CHECKOUT" | "BOOKED" | "PAID" | "LINK_CLICK";
export type ButtonStyle = "FILLED" | "OUTLINE" | "SOFT";
export type BackgroundMotion = "BENTUK" | "GELOMBANG" | "AURORA" | "PARTIKEL";
export type MotionSpeed = "SLOW" | "NORMAL";
export type FontPair = "NETRAL" | "KLASIK" | "MODERN" | "HANGAT" | "TEGAS" | "RAPI";
export type TextScale = "KECIL" | "SEDANG" | "BESAR";
export type CornerStyle = "TAJAM" | "LEMBUT" | "BULAT";
export type MediaKind = "IMAGE" | "VIDEO";

export type BusinessCategory =
  | "KECANTIKAN"
  | "KESEHATAN"
  | "FOTOGRAFI"
  | "ACARA"
  | "PENDIDIKAN"
  | "HEWAN"
  | "OTOMOTIF"
  | "SERVIS"
  | "KONSULTASI"
  | "LAINNYA";

export type TeamSize = "SENDIRI" | "KECIL_2_5" | "MENENGAH_6_15" | "BESAR_15_PLUS";

/** 38 provinsi Indonesia, sama persis dengan enum `id_province` di database. */
export type IdProvince =
  | "ACEH" | "SUMATERA_UTARA" | "SUMATERA_BARAT" | "RIAU" | "KEPULAUAN_RIAU"
  | "JAMBI" | "SUMATERA_SELATAN" | "KEPULAUAN_BANGKA_BELITUNG" | "BENGKULU"
  | "LAMPUNG" | "DKI_JAKARTA" | "JAWA_BARAT" | "BANTEN" | "JAWA_TENGAH"
  | "DI_YOGYAKARTA" | "JAWA_TIMUR" | "BALI" | "NUSA_TENGGARA_BARAT"
  | "NUSA_TENGGARA_TIMUR" | "KALIMANTAN_BARAT" | "KALIMANTAN_TENGAH"
  | "KALIMANTAN_SELATAN" | "KALIMANTAN_TIMUR" | "KALIMANTAN_UTARA"
  | "SULAWESI_UTARA" | "GORONTALO" | "SULAWESI_TENGAH" | "SULAWESI_BARAT"
  | "SULAWESI_SELATAN" | "SULAWESI_TENGGARA" | "MALUKU" | "MALUKU_UTARA"
  | "PAPUA" | "PAPUA_BARAT" | "PAPUA_BARAT_DAYA" | "PAPUA_TENGAH"
  | "PAPUA_PEGUNUNGAN" | "PAPUA_SELATAN";

export type BookingChannel =
  | "WHATSAPP"
  | "INSTAGRAM_DM"
  | "TELEPON"
  | "DATANG_LANGSUNG"
  | "APLIKASI_LAIN"
  | "BELUM_ADA";

export type MerchantGoal =
  | "NO_SHOW"
  | "DP_SULIT"
  | "JADWAL_BENTROK"
  | "CHAT_BERULANG"
  | "HALAMAN_RAPI"
  | "LAPORAN_PEMASUKAN";

export type AcquisitionSource =
  | "INSTAGRAM"
  | "TIKTOK"
  | "TEMAN"
  | "GOOGLE"
  | "KOMUNITAS"
  | "LAINNYA";

/**
 * Jawaban kuesioner onboarding. Barisnya OPSIONAL -- merchant lama dari
 * sebelum kuesioner ada tidak punya baris sama sekali, dan itu berbeda dari
 * merchant yang punya baris dengan blok opsional kosong.
 *
 * `business_category` NULLABLE sejak migration
 * 20260830171027_nullable_business_category.sql -- NULL berarti merchant
 * ditawari kuesioner dan memilih tidak menjawab (lihat `optional_skipped_at`
 * di bawah), BUKAN jawaban apa pun, dan harus tetap terbedakan dari kategori
 * `LAINNYA` yang sungguh dipilih. Constraint
 * merchant_profiles_category_required_with_answers menjaga arah sebaliknya:
 * begitu ADA jawaban kuesioner apa pun tersimpan, kolom ini wajib terisi.
 *
 * `optional_answered_at` dan `optional_skipped_at` tidak pernah terisi
 * bersamaan (constraint merchant_profiles_optional_exclusive).
 */
export type MerchantProfile = {
  merchant_id: string;
  business_category: BusinessCategory | null;
  business_type_slug: string | null;
  team_size: TeamSize | null;
  province: IdProvince | null;
  current_channels: BookingChannel[] | null;
  goals: MerchantGoal[] | null;
  acquisition_source: AcquisitionSource | null;
  optional_answered_at: string | null;
  optional_skipped_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Diturunkan resolveTheme() dari luminansi background, BUKAN kolom database.
 * Terang/gelap tidak boleh dipilih terpisah dari warna: mode gelap di atas
 * preset berlatar putih membuat halaman tidak terbaca.
 */
export type ColorMode = "TERANG" | "GELAP";

/** ISO-8601: 1 = Senin ... 7 = Minggu. */
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Merchant = {
  id: string;
  username: string | null;
  full_name: string | null;
  whatsapp_number: string | null;
  bio: string | null;
  avatar_url: string | null;
  subscription_tier: SubscriptionTier;
  active_payment_provider: PaymentProvider | null;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Kolom merchant yang boleh terbaca pengunjung anonim (lihat GRANT per kolom). */
export type PublicMerchant = Pick<
  Merchant,
  "id" | "username" | "full_name" | "bio" | "avatar_url" | "subscription_tier"
>;

/** Langkah checklist yang tidak bisa dibuktikan data; ditandai manual. */
export type ManualStepKey = "PAGE" | "SHARE";

export type GuidePageKey =
  | "today"
  | "bookings"
  | "analytics"
  | "services"
  | "availability"
  | "floor_plan"
  | "staff"
  | "payments"
  | "appearance"
  | "promo"
  | "domain"
  | "billing"
  | "settings";

/** Progres panduan. Klien hanya membaca; tulis lewat save_onboarding_progress. */
export type MerchantOnboardingProgress = {
  merchant_id: string;
  steps_completed: ManualStepKey[];
  tours_seen: GuidePageKey[];
  checklist_dismissed_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Tema halaman publik. Barisnya OPSIONAL -- merchant tanpa baris memakai tema
 * default. `font_pair` dan `corner_style` null berarti "ikut preset".
 */
export type MerchantTheme = {
  merchant_id: string;
  preset: ThemePreset;
  accent: string | null;
  background_style: BackgroundStyle;
  background_color: string | null;
  background_image_path: string | null;
  background_overlay: number;
  font_pair: FontPair | null;
  text_scale: TextScale;
  corner_style: CornerStyle | null;
  logo_path: string | null;
  cover_path: string | null;
  button_style: ButtonStyle;
  section_order: string[];
  hidden_sections: string[];
  show_social_icons: boolean;
  background_motion: BackgroundMotion;
  background_motion_speed: MotionSpeed;
  created_at: string;
  updated_at: string;
};

export type Service = {
  id: string;
  merchant_id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  is_active: boolean;
  sort_order: number;
  payment_mode: PaymentMode;
  deposit_type: DepositType | null;
  deposit_value: number | null;
  /** Keduanya null atau keduanya terisi (1..200); bila terisi, jumlah tamu wajib. */
  party_min: number | null;
  party_max: number | null;
  /** Terisi = layanan reservasi (15..480 menit), memakai kapasitas restoran. */
  seat_duration_minutes: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * Satu berkas galeri milik sebuah layanan.
 *
 * `merchant_id` diduplikasi dari `services` dan dikunci foreign key gabungan,
 * jadi baris di sini mustahil menempel pada layanan milik merchant lain.
 * `width` dan `height` disimpan supaya halaman publik bisa memasang atribut
 * ukuran dan tata letaknya tidak melompat saat gambar datang.
 */
export type ServiceMedia = {
  id: string;
  service_id: string;
  merchant_id: string;
  kind: MediaKind;
  path: string;
  poster_path: string | null;
  alt: string | null;
  width: number;
  height: number;
  sort_order: number;
  created_at: string;
};

export type Availability = {
  id: string;
  merchant_id: string;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
};

/** Satu baris FAQ halaman publik. Terbuka untuk semua paket, maksimal 10. */
export type MerchantFaq = {
  id: string;
  merchant_id: string;
  question: string;
  answer: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** Staf merchant Studio. Lihat migration 20261005180027_staff.sql. */
export type Staff = {
  id: string;
  merchant_id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  role: string | null;
  bio: string | null;
  tags: string[];
  photo_path: string | null;
  motion_path: string | null;
  show_motion: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Jam kerja staf, maksimal satu rentang per hari. Staf tanpa baris sama
 * sekali mengikuti jam kerja usaha (tabel availability).
 */
export type StaffAvailability = {
  id: string;
  staff_id: string;
  merchant_id: string;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  created_at: string;
};

export type DomainStatus = "PENDING" | "ACTIVE";

/**
 * Domain sendiri merchant Studio. Hanya service role yang bisa menulis
 * status/token -- lihat migration 20261005180048_merchant_domains.sql.
 */
export type MerchantDomain = {
  merchant_id: string;
  domain: string;
  status: DomainStatus;
  verification_token: string;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationKind =
  | "BOOKING_PAID_MERCHANT"
  | "BOOKING_PAID_CUSTOMER"
  | "REMINDER_CUSTOMER"
  | "BOOKING_CONFIRMED_MERCHANT"
  | "BOOKING_CONFIRMED_CUSTOMER"
  | "BOOKING_REQUESTED_MERCHANT"
  | "BOOKING_APPROVED_CUSTOMER"
  | "BOOKING_REJECTED_CUSTOMER"
  | "REMINDER_CUSTOMER_SAME_DAY"
  | "BOOKING_RESCHEDULED_MERCHANT"
  | "BOOKING_CANCELLED_MERCHANT";
export type NotificationChannel = "EMAIL" | "WHATSAPP" | "PUSH";
export type ContactChannel = "WHATSAPP" | "PHONE" | "EMAIL" | "INSTAGRAM" | "THREADS" | "X" | "TIKTOK";
export type NotificationStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";

/**
 * Satu pengiriman notifikasi. Unique (booking_id, kind, channel) adalah
 * kunci idempotensinya -- lihat migration 20261005175819_notification_log.sql.
 */
export type NotificationLog = {
  id: string;
  booking_id: string;
  merchant_id: string;
  kind: NotificationKind;
  channel: NotificationChannel;
  status: NotificationStatus;
  detail: string | null;
  created_at: string;
  updated_at: string;
};

export type BookingReminderPrefs = {
  booking_id: string;
  merchant_id: string;
  whatsapp: boolean;
  email: string | null;
  day_before: boolean | null;
  same_day: boolean | null;
  created_at: string;
  updated_at: string;
};

export type PushSubscriptionRow = {
  id: string;
  booking_id: string;
  merchant_id: string;
  endpoint_hash: string;
  subscription_enc: string;
  created_at: string;
};

export type Booking = {
  id: string;
  merchant_id: string;
  service_id: string | null;
  service_name: string;
  service_price: number;
  duration_minutes: number;
  start_datetime: string;
  end_datetime: string;
  customer_name: string;
  customer_whatsapp: string;
  access_token: string;
  status: BookingStatus;
  payment_provider: PaymentProvider | null;
  payment_url: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  expires_at: string;
  /** Staf yang menangani (paket Studio); null untuk kalender tanpa staf. */
  staff_id: string | null;
  /** Snapshot nama staf saat booking dibuat, sama alasannya dengan service_name. */
  staff_name: string | null;
  payment_mode: PaymentMode;
  amount_due_now: number;
  amount_due_on_site: number;
  paid_on_site_at: string | null;
  paid_on_site_method: OnSitePaymentMethod | null;
  attended_at: string | null;
  no_show_at: string | null;
  source: BookingSource;
  /** Jumlah jadwal ulang oleh merchant; maksimal 3 (BK036). */
  merchant_reschedule_count: number;
  /** Jumlah ubah jadwal oleh pelanggan; dibatasi merchant_settings.max_reschedules (BK043). */
  reschedule_count: number;
  /** null bila booking tanpa voucher atau vouchernya sudah dihapus. */
  voucher_id: string | null;
  /** Salinan kode voucher; tetap ada walau vouchernya dihapus. */
  voucher_code: string | null;
  /** service_price = amount_due_now + amount_due_on_site + discount_amount. */
  discount_amount: number;
  party_size: number | null;
  area_id: string | null;
  table_id: string | null;
  joined_table_id: string | null;
  /** Snapshot "D5" atau "D5 + D6", tetap terbaca setelah meja dihapus. */
  table_label: string | null;
  customer_note: string | null;
  /** Cara booking ini memakai tempat; menentukan eksklusi yang berlaku. */
  capacity_mode: TableMode;
  /** Atribusi funnel; hanya booking ONLINE. Tanpa session_id booking tidak masuk funnel. */
  session_id: string | null;
  /** null juga bila ad_link yang dikirim milik merchant lain. */
  ad_link_id: string | null;
  /** Maksimal 64 karakter. */
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  /** Host saja, maksimal 100. */
  referrer_host: string | null;
  /** event_id pixel: Lead = ini, Purchase = ini + ":paid". Bukan token akses. */
  pixel_event_id: string;
  created_at: string;
  updated_at: string;
};

export type Voucher = {
  id: string;
  merchant_id: string;
  code: string;
  kind: VoucherKind;
  value: number;
  max_discount: number | null;
  min_spend: number | null;
  service_ids: string[] | null;
  quota: number | null;
  per_phone_limit: number | null;
  new_customer_only: boolean;
  visibility: VoucherVisibility;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Kolom yang dibuka public_vouchers() untuk pemilih di halaman booking. */
export type PublicVoucher = Pick<
  Voucher,
  | "id"
  | "code"
  | "kind"
  | "value"
  | "max_discount"
  | "min_spend"
  | "service_ids"
  | "ends_at"
  | "per_phone_limit"
  | "new_customer_only"
>;

/** Banner promosi. TEMPLATE: title wajib, tanpa gambar. IMAGE: image_path + alt_text, tanpa teks. */
export type MerchantBanner = {
  id: string;
  merchant_id: string;
  source: BannerSource;
  tag_text: string | null;
  title: string | null;
  body: string | null;
  color: BannerColor;
  /** `<merchant_id>/banner/<nama berkas>` di Storage. */
  image_path: string | null;
  alt_text: string | null;
  /** Terisi tepat bila target_kind terisi. */
  cta_text: string | null;
  target_kind: BannerTarget | null;
  /** Null juga bila voucher/layanan targetnya sudah dihapus. */
  target_voucher_id: string | null;
  target_service_id: string | null;
  target_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
};

/** Kolom yang boleh dibaca anon; hanya banner yang sedang tayang. */
export type PublicBanner = Omit<MerchantBanner, "published" | "created_at" | "updated_at">;

/** Tautan iklan per kanal. Anon tidak punya akses langsung; resolve lewat resolve_ad_link. */
export type AdLink = {
  id: string;
  merchant_id: string;
  slug: string;
  name: string;
  channel: AdChannel;
  service_id: string | null;
  voucher_code: string | null;
  archived_at: string | null;
  created_at: string;
};

/** Kejadian funnel. Anon tidak punya akses; BOOKED/PAID hanya ditulis server. */
export type FunnelEvent = {
  id: string;
  merchant_id: string;
  session_id: string;
  kind: FunnelEventKind;
  ad_link_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  /** Host saja, pola ^[a-z0-9.-]{1,100}$. */
  referrer_host: string | null;
  service_id: string | null;
  booking_id: string | null;
  merchant_link_id: string | null;
  created_at: string;
};

/** ID pixel merchant. Anon hanya lewat get_public_tracking (ID yang aktif). */
export type MerchantTracking = {
  merchant_id: string;
  meta_pixel_id: string | null;
  tiktok_pixel_id: string | null;
  ga4_measurement_id: string | null;
  meta_enabled: boolean;
  tiktok_enabled: boolean;
  ga4_enabled: boolean;
  created_at: string;
  updated_at: string;
};

/** Tautan link-in-bio, maksimal 8 per merchant, url selalu https. */
export type MerchantLink = {
  id: string;
  merchant_id: string;
  label: string;
  url: string;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
};

export type MerchantSettings = {
  merchant_id: string;
  allow_pay_on_site: boolean;
  auto_confirm_on_site: boolean;
  /** null = tanpa batas. */
  max_active_per_phone: number | null;
  deposit_after_no_show: boolean;
  allow_customer_reschedule: boolean;
  /** 0..168 jam sebelum jadwal. */
  reschedule_min_hours: number;
  /** 1..5. */
  max_reschedules: number;
  allow_customer_cancel: boolean;
  /** 0..168 jam sebelum jadwal. */
  cancel_min_hours: number;
  /** Maksimal 500 karakter. */
  policy_text: string | null;
  /** E.164, mis. +6281234567890. */
  contact_phone: string | null;
  contact_email: string | null;
  /** Username tanpa @, pola ^[A-Za-z0-9._]{1,30}$. */
  contact_instagram: string | null;
  contact_threads: string | null;
  contact_x: string | null;
  contact_tiktok: string | null;
  contact_hidden: ContactChannel[];
  /** Format HH:MM:SS; keduanya null atau keduanya terisi dengan reply_from < reply_until. */
  reply_from: string | null;
  reply_until: string | null;
  reminder_whatsapp: boolean;
  reminder_email: boolean;
  reminder_push: boolean;
  reminder_day_before: boolean;
  reminder_same_day: boolean;
  table_mode: TableMode;
  seats_per_slot: number | null;
  /** 0..120 menit; 0 = kalimat penahanan meja tidak tampil. */
  table_hold_minutes: number;
  auto_join_tables: boolean;
  created_at: string;
  updated_at: string;
};

export type DiningArea = {
  id: string;
  merchant_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type DiningTable = {
  id: string;
  merchant_id: string;
  area_id: string;
  name: string;
  min_seats: number;
  max_seats: number;
  shape: DiningTableShape;
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
  note: string | null;
  bookable_online: boolean;
  joinable_with: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type PaymentConnection = {
  id: string;
  merchant_id: string;
  provider: PaymentProvider;
  provider_account_id: string | null;
  status: ConnectionStatus;
  connection_mode: ConnectionMode;
  environment: PaymentEnvironment;
  scope: string | null;
  token_expires_at: string | null;
  connected_at: string;
  /**
   * Pesan penolakan gateway TERAKHIR (ChargeRejectedError.providerMessage,
   * sudah dirangkai adapter -- tidak pernah body/header mentah), dipotong ke
   * 300 karakter. `null` kalau belum pernah ada penolakan tercatat, ATAU
   * sudah dibersihkan oleh charge sukses berikutnya. Diisi/dikosongkan HANYA
   * dari POST /api/bookings lewat src/lib/payments/health.ts (admin client
   * -- lihat migration 20260819000300_payment_connection_charge_health.sql
   * untuk kenapa kolom ini otomatis tidak bisa ditulis `authenticated`).
   */
  last_charge_error: string | null;
  last_charge_error_at: string | null;
  /**
   * Kapan charge TERAKHIR sukses. Dibandingkan dengan `last_charge_error_at`
   * di /dashboard/payments (provider-card.tsx) untuk menentukan apakah
   * peringatan "pembayaran sedang gagal" masih relevan -- gagal lalu sukses
   * lagi sesudahnya berarti sudah pulih, tidak perlu diperingatkan lagi.
   */
  last_charge_success_at: string | null;
  updated_at: string;
};

type Timestamps = "created_at" | "updated_at";

/**
 * Bentuk objek relasi yang diharapkan postgrest-js. Kolom foreign key di sini
 * hanya dipakai untuk inferensi tipe pada query embedded (`select("*, x(*)")`).
 */
type Relationship<Column extends string, ForeignTable extends string> = {
  foreignKeyName: string;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: ForeignTable;
  referencedColumns: ["id"];
};

export type Database = {
  // Memberi tahu postgrest-js versi PostgREST yang dipakai project, supaya
  // createClient tidak perlu diberi parameter versi secara manual.
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      merchants: {
        Row: Merchant;
        Insert: Partial<Omit<Merchant, "id" | Timestamps>> & { id: string };
        Update: Partial<Omit<Merchant, "id" | Timestamps>>;
        Relationships: [];
      };
      merchant_themes: {
        Row: MerchantTheme;
        Insert: Partial<Omit<MerchantTheme, "merchant_id" | Timestamps>> & {
          merchant_id: string;
        };
        Update: Partial<Omit<MerchantTheme, "merchant_id" | Timestamps>>;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
      merchant_onboarding_progress: {
        Row: MerchantOnboardingProgress;
        Insert: never;
        Update: never;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
      merchant_profiles: {
        Row: MerchantProfile;
        Insert: Partial<Omit<MerchantProfile, "merchant_id" | Timestamps>> & {
          merchant_id: string;
        };
        Update: Partial<Omit<MerchantProfile, "merchant_id" | Timestamps>>;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
      services: {
        Row: Service;
        Insert: Omit<
          Service,
          | "id"
          | Timestamps
          | "is_active"
          | "sort_order"
          | "payment_mode"
          | "deposit_type"
          | "deposit_value"
          | "party_min"
          | "party_max"
          | "seat_duration_minutes"
        > &
          Partial<
            Pick<
              Service,
              | "id"
              | "party_min"
              | "party_max"
              | "seat_duration_minutes"
              | "is_active"
              | "sort_order"
              | "payment_mode"
              | "deposit_type"
              | "deposit_value"
            >
          >;
        Update: Partial<Omit<Service, "id" | "merchant_id" | Timestamps>>;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
      service_media: {
        Row: ServiceMedia;
        Insert: Omit<ServiceMedia, "id" | "created_at" | "sort_order"> &
          Partial<Pick<ServiceMedia, "id" | "sort_order">>;
        Update: Partial<
          Omit<ServiceMedia, "id" | "service_id" | "merchant_id" | "created_at">
        >;
        Relationships: [
          Relationship<"service_id", "services">,
          Relationship<"merchant_id", "merchants">,
        ];
      };
      availability: {
        Row: Availability;
        Insert: Omit<Availability, "id" | Timestamps> & Partial<Pick<Availability, "id">>;
        Update: Partial<Omit<Availability, "id" | "merchant_id" | Timestamps>>;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
      merchant_faqs: {
        Row: MerchantFaq;
        Insert: Omit<MerchantFaq, "id" | Timestamps | "sort_order"> &
          Partial<Pick<MerchantFaq, "id" | "sort_order">>;
        Update: Partial<Omit<MerchantFaq, "id" | "merchant_id" | Timestamps>>;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
      staff: {
        Row: Staff;
        Insert: Pick<Staff, "merchant_id" | "name"> &
          Partial<
            Pick<
              Staff,
              | "id"
              | "is_active"
              | "sort_order"
              | "role"
              | "bio"
              | "tags"
              | "photo_path"
              | "show_motion"
            >
          >;
        Update: Partial<
          Pick<
            Staff,
            | "name"
            | "is_active"
            | "sort_order"
            | "role"
            | "bio"
            | "tags"
            | "photo_path"
            | "motion_path" // hanya service_role yang lolos grant kolom
            | "show_motion"
          >
        >;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
      staff_availability: {
        Row: StaffAvailability;
        Insert: Omit<StaffAvailability, "id" | "created_at">;
        Update: never;
        Relationships: [Relationship<"staff_id", "staff">];
      };
      merchant_domains: {
        Row: MerchantDomain;
        Insert: Pick<MerchantDomain, "merchant_id" | "domain">;
        Update: Partial<Pick<MerchantDomain, "status" | "verified_at">>;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
      notification_log: {
        Row: NotificationLog;
        Insert: Pick<NotificationLog, "booking_id" | "merchant_id" | "kind" | "channel"> &
          Partial<Pick<NotificationLog, "status" | "detail">>;
        Update: Partial<Pick<NotificationLog, "status" | "detail">>;
        Relationships: [
          Relationship<"booking_id", "bookings">,
          Relationship<"merchant_id", "merchants">,
        ];
      };
      booking_reminder_prefs: {
        Row: BookingReminderPrefs;
        Insert: Pick<BookingReminderPrefs, "booking_id" | "merchant_id"> &
          Partial<Pick<BookingReminderPrefs, "whatsapp" | "email" | "day_before" | "same_day">>;
        Update: Partial<Pick<BookingReminderPrefs, "whatsapp" | "email" | "day_before" | "same_day">>;
        Relationships: [
          Relationship<"booking_id", "bookings">,
          Relationship<"merchant_id", "merchants">,
        ];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: Pick<PushSubscriptionRow, "booking_id" | "merchant_id" | "endpoint_hash" | "subscription_enc">;
        Update: Partial<Pick<PushSubscriptionRow, "subscription_enc">>;
        Relationships: [
          Relationship<"booking_id", "bookings">,
          Relationship<"merchant_id", "merchants">,
        ];
      };
      bookings: {
        Row: Booking;
        Insert: Omit<
          Booking,
          | "id"
          | Timestamps
          | "status"
          | "expires_at"
          | "paid_at"
          | "cancelled_at"
          | "cancel_reason"
          | "access_token"
          | "payment_mode"
          | "amount_due_now"
          | "amount_due_on_site"
          | "paid_on_site_at"
          | "paid_on_site_method"
          | "attended_at"
          | "no_show_at"
          | "source"
          | "merchant_reschedule_count"
          | "voucher_id"
          | "voucher_code"
          | "discount_amount"
          | "party_size"
          | "area_id"
          | "table_id"
          | "joined_table_id"
          | "table_label"
          | "customer_note"
          | "capacity_mode"
          | "session_id"
          | "ad_link_id"
          | "utm_source"
          | "utm_medium"
          | "utm_campaign"
          | "referrer_host"
          | "pixel_event_id"
        > &
          Partial<
            Pick<
              Booking,
              | "id"
              | "session_id"
              | "ad_link_id"
              | "utm_source"
              | "utm_medium"
              | "utm_campaign"
              | "referrer_host"
              | "pixel_event_id"
              | "party_size"
              | "area_id"
              | "table_id"
              | "joined_table_id"
              | "table_label"
              | "customer_note"
              | "capacity_mode"
              | "source"
              | "merchant_reschedule_count"
              | "voucher_id"
              | "voucher_code"
              | "discount_amount"
              | "payment_mode"
              | "amount_due_now"
              | "amount_due_on_site"
              | "paid_on_site_at"
              | "paid_on_site_method"
              | "attended_at"
              | "no_show_at"
              | "status"
              | "expires_at"
              | "paid_at"
              | "cancelled_at"
              | "cancel_reason"
            >
          >;
        Update: Partial<Omit<Booking, "id" | "merchant_id" | "access_token" | Timestamps>>;
        Relationships: [
          Relationship<"merchant_id", "merchants">,
          Relationship<"service_id", "services">,
        ];
      };
      vouchers: {
        Row: Voucher;
        Insert: Omit<
          Voucher,
          | "id"
          | Timestamps
          | "max_discount"
          | "min_spend"
          | "service_ids"
          | "quota"
          | "per_phone_limit"
          | "new_customer_only"
          | "visibility"
          | "starts_at"
          | "ends_at"
        > &
          Partial<
            Pick<
              Voucher,
              | "max_discount"
              | "min_spend"
              | "service_ids"
              | "quota"
              | "per_phone_limit"
              | "new_customer_only"
              | "visibility"
              | "starts_at"
              | "ends_at"
            >
          >;
        Update: Partial<Omit<Voucher, "id" | "merchant_id" | Timestamps>>;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
      ad_links: {
        Row: AdLink;
        Insert: Pick<AdLink, "merchant_id" | "slug" | "name" | "channel"> &
          Partial<Pick<AdLink, "service_id" | "voucher_code">>;
        Update: Partial<Pick<AdLink, "name" | "channel" | "service_id" | "voucher_code" | "archived_at">>;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
      // Ditulis service_role (/api/events) dan fungsi definer; authenticated hanya membaca miliknya.
      funnel_events: {
        Row: FunnelEvent;
        Insert: Pick<FunnelEvent, "merchant_id" | "session_id" | "kind"> &
          Partial<Omit<FunnelEvent, "id" | "merchant_id" | "session_id" | "kind" | "created_at">>;
        Update: Record<string, never>;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
      merchant_tracking: {
        Row: MerchantTracking;
        Insert: Partial<Omit<MerchantTracking, "merchant_id" | Timestamps>> & { merchant_id: string };
        Update: Partial<Omit<MerchantTracking, "merchant_id" | Timestamps>>;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
      merchant_links: {
        Row: MerchantLink;
        Insert: Pick<MerchantLink, "merchant_id" | "label" | "url"> &
          Partial<Pick<MerchantLink, "id" | "sort_order" | "is_visible">>;
        Update: Partial<Pick<MerchantLink, "label" | "url" | "sort_order" | "is_visible">>;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
      merchant_banners: {
        Row: MerchantBanner;
        Insert: Pick<MerchantBanner, "merchant_id" | "source"> &
          Partial<Omit<MerchantBanner, "id" | "merchant_id" | "source" | Timestamps>>;
        Update: Partial<Omit<MerchantBanner, "id" | "merchant_id" | Timestamps>>;
        Relationships: [
          Relationship<"merchant_id", "merchants">,
          Relationship<"target_voucher_id", "vouchers">,
          Relationship<"target_service_id", "services">,
        ];
      };
      merchant_settings: {
        Row: MerchantSettings;
        Insert: Pick<MerchantSettings, "merchant_id">;
        Update: Partial<
          Pick<
            MerchantSettings,
            | "allow_pay_on_site"
            | "auto_confirm_on_site"
            | "max_active_per_phone"
            | "deposit_after_no_show"
            | "allow_customer_reschedule"
            | "reschedule_min_hours"
            | "max_reschedules"
            | "allow_customer_cancel"
            | "cancel_min_hours"
            | "policy_text"
            | "contact_phone"
            | "contact_email"
            | "contact_instagram"
            | "contact_threads"
            | "contact_x"
            | "contact_tiktok"
            | "contact_hidden"
            | "reply_from"
            | "reply_until"
            | "reminder_whatsapp"
            | "reminder_email"
            | "reminder_push"
            | "reminder_day_before"
            | "reminder_same_day"
            | "table_mode"
            | "seats_per_slot"
            | "table_hold_minutes"
            | "auto_join_tables"
          >
        >;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
      // Denah hanya ditulis lewat RPC save_dining_layout.
      dining_areas: {
        Row: DiningArea;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
      dining_tables: {
        Row: DiningTable;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [
          Relationship<"merchant_id", "merchants">,
          Relationship<"area_id", "dining_areas">,
        ];
      };
      payment_connections: {
        Row: PaymentConnection;
        Insert: Omit<
          PaymentConnection,
          | "id"
          | "connected_at"
          | "updated_at"
          | "connection_mode"
          | "environment"
          | "last_charge_error"
          | "last_charge_error_at"
          | "last_charge_success_at"
        > &
          Partial<
            Pick<
              PaymentConnection,
              | "id"
              | "connected_at"
              | "connection_mode"
              | "environment"
              | "last_charge_error"
              | "last_charge_error_at"
              | "last_charge_success_at"
            >
          >;
        // `last_charge_error`/`last_charge_error_at`/`last_charge_success_at`
        // SENGAJA TETAP ada di Update -- ini tipe BERSAMA yang dipakai admin
        // client (createAdminClient(), service role) MAUPUN authenticated
        // client, dan admin WAJIB bisa menulis ketiga kolom ini dari POST
        // /api/bookings (src/lib/payments/health.ts). Yang benar-benar
        // mencegah `authenticated` (klien browser) menulisnya BUKAN tipe ini
        // -- payment_connections tidak pernah diberi grant UPDATE apa pun ke
        // authenticated sama sekali (lihat migration
        // 20260819000300_payment_connection_charge_health.sql), jadi
        // percobaan update dari browser gagal di Postgres terlepas dari apa
        // yang diizinkan tipe TypeScript ini.
        Update: Partial<Omit<PaymentConnection, "id" | "merchant_id" | "updated_at">>;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
      reserved_usernames: {
        Row: { name: string };
        Insert: { name: string };
        Update: { name?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      /** Me-resolve ?t= untuk anon; tautan diarsipkan tidak dikembalikan. */
      resolve_ad_link: {
        Args: { p_username: string; p_slug: string };
        Returns: { id: string; service_id: string | null; voucher_code: string | null; channel: AdChannel }[];
      };
      /** ID pixel yang aktif saja; ID yang dimatikan null. Kosong bila merchant belum publik. */
      get_public_tracking: {
        Args: { p_merchant_id: string };
        Returns: {
          meta_pixel_id: string | null;
          tiktok_pixel_id: string | null;
          ga4_measurement_id: string | null;
        }[];
      };
      /** Kontak publik; kanal di contact_hidden dikembalikan null. whatsapp = contact_phone. */
      get_public_contacts: {
        Args: { p_merchant_id: string };
        Returns: { instagram: string | null; tiktok: string | null; whatsapp: string | null }[];
      };
      /** Simpan seluruh tautan link-in-bio + show_social_icons + section_order. Hanya authenticated. */
      save_merchant_links: {
        Args: {
          p_links: { id: string; label: string; url: string; sort_order: number; is_visible?: boolean }[];
          p_show_social_icons: boolean;
          p_section_order: string[];
        };
        Returns: undefined;
      };
      /** Cek klaim username dari landing. Hanya service_role. */
      check_username_claim: {
        Args: { p_username: string; p_ip_hash: string };
        Returns: string;
      };
      /** Fakta kesiapan merchant + progres panduan. Hanya authenticated. */
      onboarding_state: {
        Args: Record<string, never>;
        Returns: {
          has_service: boolean;
          has_hours: boolean;
          has_active_payment: boolean;
          needs_online_payment: boolean;
          page_customized: boolean;
          has_online_booking: boolean;
          steps_completed: ManualStepKey[];
          tours_seen: GuidePageKey[];
          checklist_dismissed_at: string | null;
        }[];
      };
      /** Simpan progres panduan; argumen null tidak mengubah kolomnya. */
      save_onboarding_progress: {
        Args: {
          p_step?: ManualStepKey | null;
          p_tour?: GuidePageKey | null;
          p_dismissed?: boolean | null;
        };
        Returns: undefined;
      };
      /** Voucher publik yang hidup; anon boleh memanggil. */
      public_vouchers: {
        Args: { p_merchant_id: string };
        Returns: PublicVoucher[];
      };
      /** Cek kode untuk route /api/vouchers/check (service_role). Syarat hanya terisi bila reason null. */
      check_voucher: {
        Args: { p_merchant_id: string; p_code: string; p_service_id: string };
        Returns: {
          code: string | null;
          kind: VoucherKind | null;
          value: number | null;
          max_discount: number | null;
          min_spend: number | null;
          service_ids: string[] | null;
          discount: number | null;
          reason: string | null;
        }[];
      };
      /** Pemakaian voucher merchant yang login dan ringkasan bulan WIB berjalan. */
      voucher_stats: {
        Args: Record<string, never>;
        Returns: { voucher_id: string; used: number; month_discount: number; month_bookings: number }[];
      };
      /** 10 cek kode per (hash IP, merchant) per 15 menit (service_role). */
      check_voucher_rate_limit: {
        Args: { p_ip_hash: string; p_merchant_id: string };
        Returns: boolean;
      };
      prune_push_subscriptions: { Args: Record<string, never>; Returns: number };
      bookings_in_tab: {
        Args: { p_tab: "ACTION" | "UPCOMING" | "HISTORY" | "CANCELLED" };
        // Seperti BookingListItem (booking-state.ts) tapi merchant_id tetap ada agar
        // .eq("merchant_id", ...) lolos tipe. access_token dan payment_url sengaja tidak ada.
        Returns: Omit<Booking, "access_token" | "payment_url" | "updated_at">[];
      };
      dashboard_tab_counts: {
        Args: Record<string, never>;
        Returns: { action_count: number; upcoming_count: number }[];
      };
      dashboard_week_summary: {
        Args: Record<string, never>;
        Returns: {
          bookings: number;
          online_revenue: number;
          on_site_revenue: number;
          no_show: number;
          attendance_marked: number;
        }[];
      };
      /**
       * Mengganti seluruh FAQ merchant yang sedang login dalam satu
       * statement, sehingga penghapusan lama dan penyisipan baru berhasil
       * bersama atau gagal bersama. Sebagai dua panggilan terpisah, insert
       * yang ditolak akan meninggalkan penghapusan yang sudah commit dan
       * merchant kehilangan seluruh FAQ-nya.
       */
      resolve_custom_domain: {
        Args: { p_host: string };
        Returns: string | null;
      };
      replace_staff_availability: {
        Args: {
          p_staff_id: string;
          p_rows: { day_of_week: number; start_time: string; end_time: string }[];
        };
        Returns: undefined;
      };
      replace_merchant_faqs: {
        Args: { p_faqs: { question: string; answer: string }[] };
        Returns: undefined;
      };
      get_booked_ranges: {
        Args: { p_username: string; p_from: string; p_to: string };
        Returns: { start_datetime: string; end_datetime: string; staff_id: string | null }[];
      };
      get_seat_availability: {
        Args: {
          p_username: string;
          p_service_id: string;
          p_party_size: number;
          /** Tanpa default di SQL: selalu kirim, null bila tidak memilih area. */
          p_area_id: string | null;
          p_starts: string[];
        };
        Returns: { start_datetime: string; available: boolean; tables_left: number | null }[];
      };
      get_table_status: {
        Args: { p_username: string; p_service_id: string; p_start: string; p_party_size: number };
        Returns: { table_id: string; status: "FREE" | "TAKEN" | "TOO_SMALL" | "TOO_LARGE" }[];
      };
      save_dining_layout: {
        Args: {
          p_areas: { id: string; name: string; sort_order: number }[];
          p_tables: {
            id: string;
            area_id: string;
            name: string;
            min_seats: number;
            max_seats: number;
            shape: DiningTableShape;
            grid_x: number;
            grid_y: number;
            grid_w: number;
            grid_h: number;
            note: string | null;
            bookable_online: boolean;
            joinable_with: string[];
            sort_order: number;
          }[];
        };
        Returns: undefined;
      };
      /**
       * `quota` bernilai null untuk paket tanpa batas (PRO/STUDIO).
       *
       * Ditulis manual dan sengaja BERBEDA dari hasil `supabase gen types`,
       * yang menuliskannya sebagai `number` non-null. Generator tidak bisa
       * menyimpulkan nullability dari nilai balik fungsi SQL, jadi tipe
       * hasil generate keliru di titik ini.
       */
      my_quota_usage: {
        Args: never;
        Returns: { used: number; quota: number | null }[];
      };
      /**
       * Ringkasan agregat dashboard merchant yang sedang login: jumlah
       * booking bulan ini (definisi identik count_bookings_this_month --
       * lihat 20260819000400_dashboard_perf.sql), pendapatan terkonfirmasi
       * bulan ini (SUM service_price booking PAID, dihitung di Postgres,
       * bukan di client), dan jumlah PENDING yang belum kedaluwarsa.
       * Menggantikan 4 query terpisah di bookings/page.tsx.
       */
      dashboard_booking_summary: {
        Args: never;
        Returns: {
          bookings_this_month: number;
          confirmed_revenue: number;
          pending_count: number;
        }[];
      };
      /**
       * Membaca kredensial terenkripsi milik merchant untuk satu provider,
       * termasuk token verifikasi webhook (kolom terpisah dari access
       * token -- lihat supabase/migrations/20260813120100_webhook_token_credential.sql).
       * SECURITY DEFINER: memverifikasi kepemilikan connection_id lewat
       * merchant_id + provider sendiri, tidak mempercayai input lain.
       * Lihat supabase/migrations/20260730000600_payment_credential_rpc.sql.
       */
      get_payment_credential: {
        Args: { p_merchant_id: string; p_provider: PaymentProvider };
        Returns: {
          access_token_encrypted: string;
          refresh_token_encrypted: string | null;
          webhook_token_encrypted: string | null;
        }[];
      };
      /**
       * Simpan/timpa kredensial merchant. Hanya dipanggil service_role.
       * `p_webhook_token_encrypted`: NULL saat UPDATE berarti "jangan ubah
       * nilai yang sudah ada" (bukan "hapus") -- lihat migration di atas.
       */
      upsert_payment_credential: {
        Args: {
          p_merchant_id: string;
          p_provider: PaymentProvider;
          p_access_token_encrypted: string;
          p_refresh_token_encrypted?: string | null;
          p_webhook_token_encrypted?: string | null;
        };
        Returns: undefined;
      };
      /**
       * Mencatat satu percobaan booking publik dan melaporkan apakah masih
       * di bawah batas (3 per ip+merchant per 15 menit). Hanya dipanggil
       * service_role dari POST /api/bookings. Lihat
       * supabase/migrations/20260813120000_harden_booking_abuse.sql.
       */
      check_booking_rate_limit: {
        Args: { p_ip_hash: string; p_merchant_id: string };
        Returns: boolean;
      };
      /**
       * Membuat booking dalam satu transaksi (advisory lock per merchant +
       * verifikasi jam kerja + insert yang dijaga bookings_no_overlap /
       * bookings_enforce_quota). SECURITY DEFINER, hanya dipanggil
       * service_role dari POST /api/bookings. Lihat
       * supabase/migrations/20260730000700_create_booking.sql.
       */
      create_booking: {
        Args: {
          p_merchant_id: string;
          p_service_id: string;
          p_start_datetime: string;
          p_customer_name: string;
          p_customer_whatsapp: string;
          /** Null = "siapa saja" untuk merchant Studio; diabaikan untuk paket lain. */
          p_staff_id?: string | null;
          /** false bila merchant tidak punya koneksi payment ACTIVE (BK021 bila booking perlu bayar online). */
          p_can_charge?: boolean;
          /** MANUAL: bayar di tempat, langsung CONFIRMED, tanpa BK020/BK021. */
          p_source?: BookingSource;
          /** Null atau kosong = tanpa voucher; diabaikan untuk MANUAL. Ditolak BK050..BK056. */
          p_voucher_code?: string | null;
          /** Wajib bila layanan punya party_max (BK063). */
          p_party_size?: number | null;
          /** Hanya layanan reservasi di mode TABLE. BK060 penuh, BK061 meja pilihan tidak tersedia. */
          p_area_id?: string | null;
          p_table_id?: string | null;
          p_customer_note?: string | null;
          /** Atribusi, hanya ONLINE. Dengan session_id, BOOKED ikut ditulis. */
          p_session_id?: string | null;
          /** Milik merchant lain menjadi null, bukan error. */
          p_ad_link_id?: string | null;
          /** Dipotong 64 karakter di SQL. */
          p_utm_source?: string | null;
          p_utm_medium?: string | null;
          p_utm_campaign?: string | null;
          /** Disaring jadi host saja, maksimal 100. */
          p_referrer_host?: string | null;
        };
        Returns: Booking[];
      };
      /** Tulis PAID sekali per booking PAID yang punya session_id. Hanya service_role. */
      record_paid_event: {
        Args: { p_booking_id: string };
        Returns: undefined;
      };
      /** Ringkasan halaman terima kasih: booking PAID dibayar dalam 24 jam. amount = nominal QRIS. */
      get_paid_event: {
        Args: { p_event_id: string };
        Returns: { merchant_id: string; service_name: string; amount: number; currency: string }[];
      };
      /** Funnel per kanal (ad_links.channel, utm_source, atau "LANGSUNG") untuk merchant yang login. */
      funnel_summary: {
        Args: { p_from: string; p_to: string };
        Returns: {
          channel: string;
          views: number;
          service_views: number;
          checkouts: number;
          booked: number;
          paid: number;
          revenue: number;
        }[];
      };
      /** Angka per tautan iklan untuk merchant yang login. */
      ad_link_stats: {
        Args: { p_from: string; p_to: string };
        Returns: { ad_link_id: string; views: number; booked: number; paid: number; revenue: number }[];
      };
      /** Hapus kejadian lebih tua dari 13 bulan; mengembalikan jumlah baris. Hanya service_role. */
      prune_funnel_events: {
        Args: Record<string, never>;
        Returns: number;
      };
      /**
       * Merchant mencatat booking sendiri (source MANUAL). 42501 tanpa login,
       * BK035 lebih dari 50 per 24 jam; error slot sama dengan create_booking.
       */
      create_manual_booking: {
        Args: {
          p_service_id: string;
          p_start_datetime: string;
          p_customer_name: string;
          p_customer_whatsapp: string;
          p_staff_id?: string | null;
          p_party_size?: number | null;
          /** Booking manual boleh memakai meja yang tidak bookable_online. */
          p_table_id?: string | null;
          p_customer_note?: string | null;
        };
        Returns: { id: string }[];
      };
      /**
       * Pindah jam booking PAID/CONFIRMED. BK034 tidak memenuhi syarat, BK036 sudah 3 kali,
       * BK003 staf nonaktif, BK001 di luar jam, P0006 lampau, 23P01 bentrok.
       */
      reschedule_booking_by_merchant: {
        Args: { p_booking_id: string; p_new_start: string };
        Returns: undefined;
      };
      /**
       * Ubah jadwal oleh pelanggan lewat access_token (service_role saja). BK040 tidak bisa
       * dikelola, BK041 tidak diizinkan, BK042 batas waktu lewat, BK043 kesempatan habis,
       * BK046 jadwal baru terlalu dekat, BK003, BK001, P0006, 23P01 seperti jadwal ulang merchant.
       */
      reschedule_booking: {
        Args: { p_token: string; p_new_start: string };
        Returns: { booking_id: string; old_start: string }[];
      };
      /**
       * Batal oleh pelanggan lewat access_token (service_role saja). BK040 tidak bisa
       * dibatalkan, BK044 tidak diizinkan, BK045 batas waktu lewat.
       */
      cancel_booking_by_customer: {
        Args: { p_token: string };
        Returns: { booking_id: string }[];
      };
      /** Merchant menyetujui/menolak booking REQUESTED. BK030 tidak ditemukan, BK031 kedaluwarsa. */
      decide_booking_request: {
        Args: { p_booking_id: string; p_approve: boolean };
        Returns: { id: string; status: BookingStatus }[];
      };
      /** Tandai sisa pembayaran diterima di tempat. BK032 bila tidak memenuhi syarat. */
      mark_booking_paid_on_site: {
        Args: { p_booking_id: string; p_method: OnSitePaymentMethod };
        Returns: undefined;
      };
      /** Catat hadir atau tidak datang. BK033 bila belum waktunya atau status tidak cocok. */
      mark_booking_attendance: {
        Args: { p_booking_id: string; p_attended: boolean };
        Returns: undefined;
      };
      /**
       * Menyimpan seluruh hasil wizard onboarding dalam satu transaksi:
       * identitas merchant, profil kuesioner, layanan pertama, dan jam
       * kerja. SECURITY INVOKER -- RLS dan grant per kolom tetap berlaku.
       *
       * Layanan hanya disisipkan bila merchant belum punya layanan, dan jam
       * kerja hanya bila merchant belum punya baris availability. Lihat
       * supabase/migrations/20260830171006_onboarding_profile.sql.
       */
      complete_onboarding: {
        Args: {
          p_full_name: string;
          p_username: string;
          p_whatsapp_number: string;
          p_business_category: BusinessCategory;
          p_business_type_slug: string | null;
          p_service_name: string;
          p_service_duration_minutes: number;
          p_service_price: number;
          p_availability: {
            day_of_week: number;
            start_time: string;
            end_time: string;
          }[];
        };
        Returns: undefined;
      };
    };
    Enums: {
      voucher_kind: VoucherKind;
      voucher_visibility: VoucherVisibility;
      banner_source: BannerSource;
      banner_color: BannerColor;
      banner_target: BannerTarget;
      subscription_tier: SubscriptionTier;
      booking_status: BookingStatus;
      table_mode: TableMode;
      dining_table_shape: DiningTableShape;
      payment_mode: PaymentMode;
      booking_source: BookingSource;
      deposit_type: DepositType;
      on_site_payment_method: OnSitePaymentMethod;
      payment_provider: PaymentProvider;
      connection_status: ConnectionStatus;
      connection_mode: ConnectionMode;
      payment_environment: PaymentEnvironment;
      business_category: BusinessCategory;
      team_size: TeamSize;
      id_province: IdProvince;
      booking_channel: BookingChannel;
      merchant_goal: MerchantGoal;
      acquisition_source: AcquisitionSource;
      notification_kind: NotificationKind;
      domain_status: DomainStatus;
      notification_channel: NotificationChannel;
      notification_status: NotificationStatus;
      contact_channel: ContactChannel;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
