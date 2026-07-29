/**
 * Daftar terpusat rute aplikasi.
 *
 * Setiap segmen tingkat atas yang muncul di sini juga harus ada di tabel
 * `public.reserved_usernames`, karena `/[username]` berbagi ruang nama dengan
 * rute-rute ini.
 */
export const ROUTES = {
  home: "/",
  login: "/login",
  authCallback: "/auth/callback",
  authError: "/auth/auth-code-error",
  signOut: "/auth/signout",
  onboarding: "/onboarding",
  dashboard: "/dashboard",
  bookings: "/dashboard/bookings",
  services: "/dashboard/services",
  availability: "/dashboard/availability",
  payments: "/dashboard/payments",
  billing: "/dashboard/billing",
  settings: "/dashboard/settings",
  merchantPage: (username: string) => `/${username}`,
} as const;

/** Rute yang mensyaratkan sesi login. */
const PROTECTED_PREFIXES = [ROUTES.dashboard, ROUTES.onboarding];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
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
