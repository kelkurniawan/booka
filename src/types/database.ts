/**
 * Tipe database.
 *
 * Ditulis manual agar cocok dengan supabase/migrations/*.sql. Begitu Supabase
 * CLI tersedia, file ini bisa digantikan hasil generate:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 */

export type SubscriptionTier = "STARTER" | "PRO" | "STUDIO";
export type BookingStatus = "PENDING" | "PAID" | "CANCELLED";
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
export type BackgroundStyle = "SOLID" | "GRADIENT" | "IMAGE";
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
 * 20260829000200_nullable_business_category.sql -- NULL berarti merchant
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

/** Staf merchant Studio. Lihat migration 20261005000300_staff.sql. */
export type Staff = {
  id: string;
  merchant_id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
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
 * status/token -- lihat migration 20261005000400_merchant_domains.sql.
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
  | "REMINDER_CUSTOMER";
export type NotificationChannel = "EMAIL" | "WHATSAPP";
export type NotificationStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";

/**
 * Satu pengiriman notifikasi. Unique (booking_id, kind, channel) adalah
 * kunci idempotensinya -- lihat migration 20261005000200_notification_log.sql.
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
        Insert: Omit<Service, "id" | Timestamps | "is_active" | "sort_order"> &
          Partial<Pick<Service, "id" | "is_active" | "sort_order">>;
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
          Partial<Pick<Staff, "id" | "is_active" | "sort_order">>;
        Update: Partial<Pick<Staff, "name" | "is_active" | "sort_order">>;
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
        > &
          Partial<
            Pick<
              Booking,
              | "id"
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
        };
        Returns: Booking[];
      };
      /**
       * Menyimpan seluruh hasil wizard onboarding dalam satu transaksi:
       * identitas merchant, profil kuesioner, layanan pertama, dan jam
       * kerja. SECURITY INVOKER -- RLS dan grant per kolom tetap berlaku.
       *
       * Layanan hanya disisipkan bila merchant belum punya layanan, dan jam
       * kerja hanya bila merchant belum punya baris availability. Lihat
       * supabase/migrations/20260829000100_onboarding_profile.sql.
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
      subscription_tier: SubscriptionTier;
      booking_status: BookingStatus;
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
    };
    CompositeTypes: { [_ in never]: never };
  };
};
