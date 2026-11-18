/**
 * Daftar terpusat rute aplikasi.
 *
 * Setiap segmen tingkat atas yang muncul di sini juga harus ada di tabel
 * `public.reserved_usernames`, karena `/[username]` berbagi ruang nama dengan
 * rute-rute ini.
 */
export const ROUTES = {
  home: "/",

  // Legal -- kedua segmen sudah dicadangkan di reserved_usernames sejak
  // migration 20260730000100_reserve_indonesian_routes.sql.
  terms: "/syarat",
  privacy: "/privasi",

  // Auth
  login: "/masuk",
  signup: "/daftar",
  forgotPassword: "/lupa-password",
  resetPassword: "/reset-password",
  authCallback: "/auth/callback",
  authError: "/auth/auth-code-error",
  signOut: "/auth/signout",

  // Aplikasi
  onboarding: "/onboarding",
  dashboard: "/dashboard",
  bookings: "/dashboard/bookings",
  newBooking: "/dashboard/bookings/baru",
  analytics: "/dashboard/analitik",
  appearance: "/dashboard/halaman",
  links: "/dashboard/tautan",
  ads: "/dashboard/iklan",
  promoBanners: "/dashboard/promosi",
  promoVouchers: "/dashboard/promosi/voucher",
  services: "/dashboard/services",
  availability: "/dashboard/availability",
  floorPlan: "/dashboard/denah",
  staff: "/dashboard/staf",
  staffClipApi: "/api/staff/clip",
  usernameCheck: "/api/username-check",
  payments: "/dashboard/payments",
  billing: "/dashboard/billing",
  domain: "/dashboard/domain",
  settings: "/dashboard/settings",

  // Pemasaran -- segmen `untuk` dicadangkan di migration 20261122000100.
  industry: (slug: string) => `/untuk/${slug}`,

  merchantPage: (username: string) => `/${username}`,
  bookingStatus: (token: string) => `/pesanan/${token}`,
  thankYou: (username: string, eventId: string) => `/${username}/terima-kasih?e=${eventId}`,
  bookingPay: (token: string) => `/api/pesanan/${token}/bayar`,
  bookingReschedule: (token: string) => `/pesanan/${token}/ubah-jadwal`,
  bookingReminders: (token: string) => `/pesanan/${token}/pengingat`,
  bookingRescheduleApi: (token: string) => `/api/pesanan/${token}/ubah-jadwal`,
  serviceWorker: "/sw.js",
  bookingRemindersApi: (token: string) => `/api/pesanan/${token}/pengingat`,
  bookingPushApi: (token: string) => `/api/pesanan/${token}/push`,
  bookingManifest: (token: string) => `/api/pesanan/${token}/manifest`,
  bookingCancelApi: (token: string) => `/api/pesanan/${token}/batal`,
} as const;

/** Rute yang mensyaratkan sesi login. */
const PROTECTED_PREFIXES = [ROUTES.dashboard, ROUTES.onboarding];

/**
 * Rute auth yang tidak masuk akal dibuka saat sudah login.
 *
 * `/reset-password` sengaja TIDAK termasuk: halaman itu justru dibuka dalam
 * keadaan bersesi, karena tautan pemulihan dari email membuat sesi lebih dulu.
 */
const GUEST_ONLY_PATHS: string[] = [
  ROUTES.login,
  ROUTES.signup,
  ROUTES.forgotPassword,
];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isGuestOnlyPath(pathname: string): boolean {
  return GUEST_ONLY_PATHS.includes(pathname);
}

/**
 * Membersihkan parameter `?next=` agar hanya menerima path internal.
 * Menolak URL absolut dan `//host` yang bisa dipakai untuk open redirect.
 */
export function sanitizeRedirect(value: string | null, fallback: string = ROUTES.dashboard) {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
