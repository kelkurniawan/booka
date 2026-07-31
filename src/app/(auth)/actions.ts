"use server";

import { redirect } from "next/navigation";
import type { z } from "zod";

import { serverEnv } from "@/lib/env/server";
import { ROUTES, sanitizeRedirect } from "@/lib/routes";
import type { AuthState } from "./auth-state";
import { createClient } from "@/lib/supabase/server";
import {
  emailSchema,
  newPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validations/auth";

function toFieldErrors(error: z.ZodError): AuthState {
  const fieldErrors: AuthState["fieldErrors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key === "email" || key === "password" || key === "confirmPassword") {
      fieldErrors[key] ??= issue.message;
    }
  }
  return { status: "error", fieldErrors };
}

function callbackUrl(next: string) {
  return `${serverEnv().appUrl}${ROUTES.authCallback}?next=${encodeURIComponent(next)}`;
}

/* -------------------------------------------------------------------------- */
/* Daftar                                                                      */
/* -------------------------------------------------------------------------- */

export async function signUpWithPassword(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) return toFieldErrors(parsed.error);

  const next = sanitizeRedirect(formData.get("next")?.toString() ?? null, ROUTES.onboarding);
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: callbackUrl(next) },
  });

  if (error) {
    if (error.status === 429) {
      return {
        status: "error",
        message: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.",
      };
    }

    // Email sudah terdaftar (422 user_already_exists).
    //
    // Ini HANYA muncul saat konfirmasi email dimatikan. Dengan konfirmasi
    // menyala, Supabase menyembunyikannya: sign-up untuk email yang sudah ada
    // dijawab sukses palsu dengan `identities` kosong (ditangani di bawah),
    // supaya halaman ini tidak bisa dipakai menebak siapa saja yang punya
    // akun. Saat Supabase sendiri sudah membocorkannya lewat 422, menahan
    // informasi itu di UI tidak menambah keamanan apa pun — yang tersisa cuma
    // pengguna kebingungan disuruh "coba lagi sebentar lagi" untuk keadaan
    // yang tidak akan pernah berubah dengan menunggu.
    if (error.status === 422 || error.code === "user_already_exists") {
      return {
        status: "error",
        message: "Email ini sudah terdaftar. Silakan masuk.",
        fieldErrors: { email: "Email sudah terdaftar" },
      };
    }

    return { status: "error", message: "Gagal membuat akun. Coba lagi sebentar lagi." };
  }

  // Ketika konfirmasi email aktif, Supabase mengembalikan user tanpa sesi.
  // Untuk email yang sudah terdaftar, `identities` dikosongkan alih-alih
  // melempar error — supaya halaman ini tidak bisa dipakai menebak siapa saja
  // yang punya akun. Kedua kasus sengaja menampilkan layar yang sama.
  if (!data.session) {
    return { status: "confirm" };
  }

  redirect(next);
}

/* -------------------------------------------------------------------------- */
/* Masuk                                                                       */
/* -------------------------------------------------------------------------- */

export async function signInWithPassword(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) return toFieldErrors(parsed.error);

  const next = sanitizeRedirect(formData.get("next")?.toString() ?? null);
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (error.status === 429) {
      return {
        status: "error",
        message: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.",
      };
    }
    // Pesannya sengaja tidak membedakan email tidak terdaftar dari password
    // salah.
    return { status: "error", message: "Email atau password salah." };
  }

  redirect(next);
}

export async function signInWithMagicLink(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return toFieldErrors(parsed.error);

  const next = sanitizeRedirect(formData.get("next")?.toString() ?? null);
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: callbackUrl(next) },
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
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(next) },
  });

  if (error || !data.url) {
    redirect(`${ROUTES.login}?error=oauth`);
  }

  redirect(data.url);
}

/* -------------------------------------------------------------------------- */
/* Pemulihan password                                                          */
/* -------------------------------------------------------------------------- */

export async function requestPasswordReset(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return toFieldErrors(parsed.error);

  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: callbackUrl(ROUTES.resetPassword),
  });

  // Kegagalan selain rate limit tetap dilaporkan sebagai berhasil: membedakan
  // "email tidak terdaftar" dari "email terkirim" akan membocorkan daftar
  // pengguna.
  if (error?.status === 429) {
    return {
      status: "error",
      message: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.",
    };
  }

  return { status: "sent" };
}

export async function updatePassword(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) return toFieldErrors(parsed.error);

  const supabase = await createClient();

  // Sesi di sini berasal dari tautan pemulihan di email. Tanpa sesi, tautannya
  // sudah kedaluwarsa atau pernah dipakai.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: "error",
      message: "Tautan pemulihan sudah kedaluwarsa. Minta tautan baru.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return {
      status: "error",
      message: "Gagal menyimpan password baru. Coba lagi sebentar lagi.",
    };
  }

  redirect(ROUTES.dashboard);
}
