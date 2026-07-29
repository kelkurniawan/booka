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

export type Availability = {
  id: string;
  merchant_id: string;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
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
  status: BookingStatus;
  payment_provider: PaymentProvider | null;
  payment_url: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  expires_at: string;
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
      services: {
        Row: Service;
        Insert: Omit<Service, "id" | Timestamps | "is_active" | "sort_order"> &
          Partial<Pick<Service, "id" | "is_active" | "sort_order">>;
        Update: Partial<Omit<Service, "id" | "merchant_id" | Timestamps>>;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
      availability: {
        Row: Availability;
        Insert: Omit<Availability, "id" | Timestamps> & Partial<Pick<Availability, "id">>;
        Update: Partial<Omit<Availability, "id" | "merchant_id" | Timestamps>>;
        Relationships: [Relationship<"merchant_id", "merchants">];
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
        Update: Partial<Omit<Booking, "id" | "merchant_id" | Timestamps>>;
        Relationships: [
          Relationship<"merchant_id", "merchants">,
          Relationship<"service_id", "services">,
        ];
      };
      payment_connections: {
        Row: PaymentConnection;
        Insert: Omit<PaymentConnection, "id" | "connected_at" | "updated_at"> &
          Partial<Pick<PaymentConnection, "id" | "connected_at">>;
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
      get_booked_ranges: {
        Args: { p_username: string; p_from: string; p_to: string };
        Returns: { start_datetime: string; end_datetime: string }[];
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
    };
    Enums: {
      subscription_tier: SubscriptionTier;
      booking_status: BookingStatus;
      payment_provider: PaymentProvider;
      connection_status: ConnectionStatus;
      connection_mode: ConnectionMode;
      payment_environment: PaymentEnvironment;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
