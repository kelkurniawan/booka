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
  analytics: "/dashboard/analitik",
  appearance: "/dashboard/halaman",
  services: "/dashboard/services",
  availability: "/dashboard/availability",
  staff: "/dashboard/staf",
  payments: "/dashboard/payments",
  billing: "/dashboard/billing",
  domain: "/dashboard/domain",
  settings: "/dashboard/settings",

  merchantPage: (username: string) => `/${username}`,
  bookingStatus: (token: string) => `/pesanan/${token}`,
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
