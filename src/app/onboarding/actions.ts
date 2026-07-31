"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { onboardingSchema, usernameSchema } from "@/lib/validations/merchant";

export type OnboardingState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<"full_name" | "username" | "whatsapp_number", string>>;
};

export type UsernameCheck =
  | { available: true }
  | { available: false; reason: string };

/** Dipanggil sambil merchant mengetik, untuk memberi umpan balik langsung. */
export async function checkUsernameAvailability(raw: string): Promise<UsernameCheck> {
  const parsed = usernameSchema.safeParse(raw);
  if (!parsed.success) {
    return { available: false, reason: parsed.error.issues[0]?.message ?? "Tidak valid" };
  }

  const username = parsed.data;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { available: false, reason: "Sesi berakhir. Muat ulang halaman." };
  }

  const [{ data: reserved }, { data: taken }] = await Promise.all([
    supabase.from("reserved_usernames").select("name").eq("name", username).maybeSingle(),
    supabase.from("merchants").select("id").eq("username", username).maybeSingle(),
  ]);

  if (reserved) {
    return { available: false, reason: "Username ini dipakai sistem" };
  }

  // Merchant yang mengklaim ulang username miliknya sendiri tetap dianggap boleh.
  if (taken && taken.id !== user.id) {
    return { available: false, reason: "Username sudah dipakai merchant lain" };
  }

  return { available: true };
}

export async function completeOnboarding(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = onboardingSchema.safeParse({
    full_name: formData.get("full_name"),
    username: formData.get("username"),
    whatsapp_number: formData.get("whatsapp_number"),
  });

  if (!parsed.success) {
    const fieldErrors: OnboardingState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "full_name" || key === "username" || key === "whatsapp_number") {
        fieldErrors[key] ??= issue.message;
      }
    }
    return { status: "error", message: "Periksa kembali isian Anda", fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(ROUTES.login);
  }

  // Sengaja upsert, bukan update.
  //
  // Baris merchant normalnya dibuat trigger `handle_new_user` saat signup.
  // Kalau baris itu tidak ada — user lama dari sebelum trigger dipasang, atau
  // trigger sempat gagal — UPDATE akan mengenai 0 baris dan melapor berhasil,
  // sehingga proxy memantulkan user kembali ke /onboarding tanpa henti.
  // Upsert membuat kasus itu sembuh sendiri.
  const { error } = await supabase.from("merchants").upsert(
    {
      id: user.id,
      full_name: parsed.data.full_name,
      username: parsed.data.username,
      whatsapp_number: parsed.data.whatsapp_number,
      onboarded_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    // 23505 unique_violation — dua merchant mengirim username sama secara
    // bersamaan; validasi optimistis di form bisa kalah cepat dari constraint.
    if (error.code === "23505") {
      return {
        status: "error",
        message: "Username baru saja diambil orang lain. Coba yang lain.",
        fieldErrors: { username: "Username sudah dipakai" },
      };
    }
    // 23514 check_violation dipakai trigger reject_reserved_username.
    if (error.code === "23514") {
      return {
        status: "error",
        message: "Username tidak dapat digunakan.",
        fieldErrors: { username: "Username ini dipakai sistem" },
      };
    }
    return { status: "error", message: "Gagal menyimpan data. Coba lagi." };
  }

  revalidatePath(ROUTES.dashboard);
  redirect(ROUTES.dashboard);
}
