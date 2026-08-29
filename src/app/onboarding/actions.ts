"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { usernameSchema } from "@/lib/validations/merchant";
import { completeOnboardingSchema, optionalProfileSchema } from "@/lib/validations/onboarding";

import { hoursToRows } from "./wizard-state";

export type OnboardingState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<
    Record<"full_name" | "username" | "whatsapp_number" | "service" | "hours", string>
  >;
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

/**
 * Menyimpan seluruh jawaban wizard (identitas, bidang usaha, layanan pertama,
 * jam kerja) sebagai satu transaksi lewat RPC `complete_onboarding`.
 *
 * FormData berisi identitas sebagai field biasa (`full_name`, `username`,
 * `whatsapp_number`) dan jawaban langkah 1-3 sebagai satu field JSON
 * `answers` -- bentuknya `{ business_category, business_type_slug, service:
 * { name, duration_minutes, price }, hours: { days, start_time, end_time } }`.
 * `service.price` WAJIB tetap string mentah dari input di sini: schema-nya
 * menolak string kosong sebelum coercion supaya harga yang belum diisi tidak
 * diam-diam tersimpan sebagai layanan gratis (lihat komentar di
 * wizardServiceSchema).
 */
export async function completeOnboarding(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  let answers: Record<string, unknown> = {};
  const rawAnswers = formData.get("answers");
  if (typeof rawAnswers === "string" && rawAnswers.length > 0) {
    try {
      const decoded: unknown = JSON.parse(rawAnswers);
      if (typeof decoded === "object" && decoded !== null && !Array.isArray(decoded)) {
        answers = decoded as Record<string, unknown>;
      }
    } catch {
      // Bentuk salah ditangani sama seperti tidak mengirim apa-apa --
      // completeOnboardingSchema akan menolaknya di bawah.
    }
  }

  const parsed = completeOnboardingSchema.safeParse({
    full_name: formData.get("full_name"),
    username: formData.get("username"),
    whatsapp_number: formData.get("whatsapp_number"),
    ...answers,
  });

  if (!parsed.success) {
    const fieldErrors: OnboardingState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (
        key === "full_name" ||
        key === "username" ||
        key === "whatsapp_number" ||
        key === "service" ||
        key === "hours"
      ) {
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

  const { error } = await supabase.rpc("complete_onboarding", {
    p_full_name: parsed.data.full_name,
    p_username: parsed.data.username,
    p_whatsapp_number: parsed.data.whatsapp_number,
    p_business_category: parsed.data.business_category,
    p_business_type_slug: parsed.data.business_type_slug,
    p_service_name: parsed.data.service.name,
    p_service_duration_minutes: parsed.data.service.duration_minutes,
    p_service_price: parsed.data.service.price,
    p_availability: hoursToRows({
      days: parsed.data.hours.days,
      startTime: parsed.data.hours.start_time,
      endTime: parsed.data.hours.end_time,
    }),
  });

  if (error) {
    // 23505 unique_violation -- dua merchant mengirim username sama bersamaan;
    // validasi optimistis di form bisa kalah cepat dari constraint.
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
    // 23P01 exclusion_violation -- jam kerja tumpang tindih.
    if (error.code === "23P01") {
      return {
        status: "error",
        message: "Jam kerja yang dipilih tumpang tindih. Periksa kembali.",
        fieldErrors: { hours: "Jam kerja tumpang tindih" },
      };
    }
    return { status: "error", message: "Gagal menyimpan data. Coba lagi." };
  }

  // Sengaja TIDAK redirect ke dashboard di sini -- wizard menampilkan layar
  // sukses dulu, baru merchant lanjut sendiri (atau ke blok opsional).
  revalidatePath(ROUTES.dashboard);
  return { status: "success" };
}

/**
 * Menyimpan blok opsional kuesioner (ukuran tim, provinsi, kanal saat ini,
 * kebutuhan, sumber tahu Booka). Berjalan setelah akun sudah jadi lewat
 * completeOnboarding, jadi cukup UPDATE biasa yang dijaga RLS -- tidak perlu
 * atomicity dengan apa pun.
 */
export async function saveOptionalProfile(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = optionalProfileSchema.safeParse({
    team_size: formData.get("team_size") || null,
    province: formData.get("province") || null,
    current_channels: formData.getAll("current_channels"),
    goals: formData.getAll("goals"),
    acquisition_source: formData.get("acquisition_source") || null,
  });

  if (!parsed.success) {
    return { status: "error", message: "Periksa kembali pilihan Anda" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  // optional_skipped_at dikosongkan: constraint
  // merchant_profiles_optional_exclusive menolak keduanya terisi bersamaan,
  // dan merchant yang tadinya melewati lalu kembali menjawab sudah bukan
  // "melewati" lagi.
  const { error } = await supabase
    .from("merchant_profiles")
    .update({
      ...parsed.data,
      optional_answered_at: new Date().toISOString(),
      optional_skipped_at: null,
    })
    .eq("merchant_id", user.id);

  if (error) {
    return { status: "error", message: "Gagal menyimpan. Coba lagi." };
  }

  revalidatePath(ROUTES.dashboard);
  return { status: "success" };
}

/** Merchant melewati blok opsional. Ditandai, bukan dihapus dari alur. */
export async function skipOptionalProfile(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  await supabase
    .from("merchant_profiles")
    .update({
      optional_skipped_at: new Date().toISOString(),
      optional_answered_at: null,
    })
    .eq("merchant_id", user.id);

  redirect(ROUTES.dashboard);
}
