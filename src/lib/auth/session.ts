import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import type { Merchant } from "@/types/database";

/**
 * Modul sesi terpusat untuk Server Component dashboard.
 *
 * Kedua fungsi di sini dibungkus `cache()` dari React: dalam SATU render
 * pass (satu request RSC), pemanggilan berulang dengan argumen yang sama
 * mengembalikan promise yang SAMA persis alih-alih menjalankan ulang query
 * ke Supabase. Ini yang membuat layout dashboard dan page di bawahnya bisa
 * masing-masing memanggil `getSessionUser()`/`requireMerchant()` tanpa
 * menambah round-trip: yang benar-benar jalan ke jaringan cuma panggilan
 * pertama.
 *
 * PENTING: `cache()` HANYA berlaku dalam satu render pass RSC. Proxy
 * (`src/lib/supabase/proxy.ts`) berjalan di request pass yang terpisah
 * (middleware, sebelum RSC dirender), jadi `getUser()` di sana TETAP wajib
 * dipanggil sendiri -- lihat komentar di proxy.ts.
 */

export type SessionUser = { id: string; email: string };

/** Kolom merchant yang dibutuhkan layout + page dashboard. */
export type SessionMerchant = Pick<
  Merchant,
  "full_name" | "avatar_url" | "subscription_tier"
> & { username: string };

/**
 * Mengambil identitas user dari sesi, TANPA memantulkan ke halaman lain.
 * Kembalikan `null` kalau tidak ada sesi valid -- pemanggil yang memutuskan
 * mau redirect ke mana (lihat `requireMerchant` di bawah untuk pola siap
 * pakai).
 *
 * Dipakai `getClaims()`, BUKAN `getSession()`. Ini bukan pelanggaran aturan
 * "jangan getSession()": `getClaims()` MEMVERIFIKASI tanda tangan JWT --
 * lokal lewat JWKS project kalau signing key asimetris aktif (tanpa
 * round-trip jaringan tiap panggilan), atau jatuh ke request ke server Auth
 * kalau project masih pakai symmetric secret. `getSession()` sebaliknya
 * cuma membaca cookie mentah TANPA verifikasi sama sekali -- payload-nya
 * bisa dipalsukan siapa pun yang bisa menulis cookie. `getUser()` juga
 * memverifikasi (selalu ke server Auth, sehingga selalu kena round-trip),
 * jadi `getClaims()` di sini adalah pengganti yang valid untuk `getUser()`,
 * bukan untuk `getSession()`.
 *
 * Kalau `getClaims()` gagal (error ATAU claims kosong -- misal JWKS project
 * belum ke-cache dan endpoint-nya sedang tidak terjangkau), jatuh ke
 * `getUser()` sebagai fallback supaya user yang sesungguhnya masih punya
 * sesi valid tidak ikut ter-logout gara-gara masalah di jalur cepatnya.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (!error && data) {
    const { sub, email } = data.claims;
    if (sub) {
      return { id: sub, email: email ?? "" };
    }
  }

  // Fallback: getUser() tetap memverifikasi ke server Auth, cuma lebih
  // lambat karena selalu ada round-trip jaringan.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return { id: user.id, email: user.email ?? "" };
});

/**
 * Menegakkan "halaman ini butuh merchant yang sudah onboarding" -- dipakai
 * dashboard/layout.tsx dan (lewat cache() di atas) halaman-halaman di
 * bawahnya yang butuh data merchant yang sama.
 *
 * Redirect ke /masuk kalau tidak ada sesi, atau ke /onboarding kalau
 * merchant belum mengisi username. Proxy (src/lib/supabase/proxy.ts) juga
 * menegakkan aturan "belum onboarding -> /onboarding" untuk /dashboard/*,
 * tapi keduanya TIDAK redundan secara keamanan: proxy adalah lapisan
 * pertama (mencegah RSC dashboard dirender sama sekali untuk kasus umum),
 * fungsi ini lapisan kedua yang memastikan sidebar tidak pernah dirender
 * tanpa merchant yang valid meski proxy entah bagaimana terlewati.
 */
export const requireMerchant = cache(
  async (): Promise<{ user: SessionUser; merchant: SessionMerchant }> => {
    const user = await getSessionUser();
    if (!user) {
      redirect(ROUTES.login);
    }

    const supabase = await createClient();
    const { data: merchant } = await supabase
      .from("merchants")
      .select("username, full_name, avatar_url, subscription_tier")
      .eq("id", user.id)
      .maybeSingle();

    if (!merchant?.username) {
      redirect(ROUTES.onboarding);
    }

    return { user, merchant: { ...merchant, username: merchant.username } };
  },
);
