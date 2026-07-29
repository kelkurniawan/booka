"use server";

import { redirect } from "next/navigation";

import { serverEnv } from "@/lib/env/server";
import { ROUTES, sanitizeRedirect } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { emailSchema } from "@/lib/validations/auth";

export type AuthActionState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

/**
 * Mengirim Magic Link ke email merchant.
 *
 * Kegagalan sengaja tidak membedakan "email tidak terdaftar" dari kasus lain,
 * agar halaman ini tidak bisa dipakai untuk menebak siapa saja yang punya akun.
 */
export async function signInWithMagicLink(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Email tidak valid",
    };
  }

  const next = sanitizeRedirect(formData.get("next")?.toString() ?? null);
  const env = serverEnv();
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      // shouldCreateUser: true — signup dan login memakai satu alur yang sama.
      emailRedirectTo: `${env.appUrl}${ROUTES.authCallback}?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    return {
      status: "error",
      message:
        error.status === 429
          ? "Terlalu banyak percobaan. Coba lagi beberapa menit lagi."
          : "Gagal mengirim tautan masuk. Coba lagi sebentar lagi.",
    };
  }

  return { status: "sent" };
}

/** Memulai alur OAuth Google dan mengarahkan browser ke halaman consent. */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = sanitizeRedirect(formData.get("next")?.toString() ?? null);
  const env = serverEnv();
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${env.appUrl}${ROUTES.authCallback}?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    redirect(`${ROUTES.login}?error=oauth`);
  }

  redirect(data.url);
}
