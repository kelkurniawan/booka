"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { usernameSchema } from "@/lib/validations/merchant";
import {
  businessStepSchema,
  completeOnboardingSchema,
  optionalProfileSchema,
} from "@/lib/validations/onboarding";

import { hoursToRows } from "./wizard-state";

export type OnboardingState = {
  // "missing_profile" -- lihat komentar di saveOptionalProfile/
  // skipOptionalProfile: merchant lama tanpa baris merchant_profiles sama
  // sekali (dari sebelum Task 1). Dipisah dari "error" biasa karena "Coba
  // lagi" tidak akan pernah berhasil di sini -- Task 8 perlu tahu supaya
  // bisa mengarahkan merchant mengisi bidang usaha dulu, bukan menyuruhnya
  // mengulang aksi yang sama.
  status: "idle" | "error" | "success" | "missing_profile";
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
    // Zod bisa gagal di path yang tidak punya field renderable di form ini
    // (mis. business_category) -- kalau begitu fieldErrors tetap objek
    // kosong. Objek kosong itu truthy, jadi kalau tetap dikirim, pesan umum
    // di bawah (`state.status === "error" && !state.fieldErrors`) diam-diam
    // tertutup dan tombol "Selesai" terlihat seperti tidak melakukan apa-apa.
    return {
      status: "error",
      message: "Periksa kembali isian Anda",
      fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
    };
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
  //
  // JANGAN tambahkan revalidatePath(ROUTES.dashboard) di sini. Next.js
  // merender ulang rute yang SEDANG dibuka begitu Server Action memanggil
  // revalidatePath, dalam response yang sama -- rute yang sedang dibuka di
  // titik ini adalah /onboarding, dan penjaga di page.tsx
  // (`if (merchant?.username) redirect(ROUTES.dashboard)`) langsung
  // menembakkan merchant ke dashboard begitu render ulang itu terjadi,
  // karena RPC di atas baru saja menulis username-nya. Akibatnya layar
  // sukses dan kedua layar bonus tidak pernah sempat tampil. Merchant belum
  // pernah membuka /dashboard di titik ini, jadi tidak ada cache yang perlu
  // dibersihkan -- beda dengan saveOptionalProfile dan
  // saveProfileFromDashboard di bawah, yang memang berjalan dari/menuju
  // /dashboard dan tetap butuh revalidatePath.
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
  //
  // `.select("merchant_id").maybeSingle()` dipakai, BUKAN update polos --
  // PostgREST melaporkan `error: null` sekalipun UPDATE mengenai NOL baris.
  // Fungsi ini SENGAJA tetap UPDATE (bukan upsert seperti skipOptionalProfile
  // /saveProfileFromDashboard di bawah): mengisi blok opsional adalah jawaban
  // SUNGGUHAN, jadi butuh business_category yang sudah pasti terisi lebih
  // dulu (lihat constraint merchant_profiles_category_required_with_answers
  // di migration 20260829000200_nullable_business_category.sql) -- kalau
  // baris belum ada sama sekali, ProfileNudgeDialog wajib mengumpulkan
  // kategori dulu lewat KategoriStep/saveProfileFromDashboard sebelum layar
  // ini pernah ditampilkan. Tanpa deteksi baris-nol ini, merchant yang
  // barisnya memang belum ada akan melihat "tersimpan" padahal tidak ada
  // satu kolom pun yang tertulis.
  const { data, error } = await supabase
    .from("merchant_profiles")
    .update({
      ...parsed.data,
      optional_answered_at: new Date().toISOString(),
      optional_skipped_at: null,
    })
    .eq("merchant_id", user.id)
    .select("merchant_id")
    .maybeSingle();

  if (error) {
    return { status: "error", message: "Gagal menyimpan. Coba lagi." };
  }

  if (!data) {
    // Tidak ada baris merchant_profiles untuk merchant ini -- merchant lama
    // dari sebelum Task 1. Task 8 (dialog kuesioner dari dashboard) WAJIB
    // mengumpulkan business_category dan MEMBUAT baris ini (insert, bukan
    // update) sebelum jawaban opsional bisa disimpan -- RPC
    // complete_onboarding tidak pernah dipanggil ulang untuk merchant lama.
    return {
      status: "missing_profile",
      message: "Profil usaha belum lengkap. Lengkapi bidang usaha dulu.",
    };
  }

  revalidatePath(ROUTES.dashboard);
  return { status: "success" };
}

/**
 * Merchant melewati blok opsional. Ditandai, bukan dihapus dari alur.
 *
 * `upsert`, BUKAN update biasa -- sejak business_category menjadi NULLABLE
 * (migration 20260829000200_nullable_business_category.sql), dismissal
 * sudah tidak butuh baris merchant_profiles ada lebih dulu maupun kategori
 * apa pun untuk dicatat: baris "menolak menjawab" secara sah punya
 * business_category NULL. Ini menyatukan DUA populasi (merchant yang
 * barisnya sudah ada dari RPC complete_onboarding, dan merchant lama yang
 * barisnya belum pernah ada sama sekali) lewat SATU jalur, menggantikan pola
 * lama yang memaksa ProfileNudgeDialog membuat baris dengan kategori sentinel
 * 'LAINNYA' terlebih dulu via saveProfileFromDashboard sebelum baris ini
 * bisa di-UPDATE.
 *
 * Hanya kolom `optional_skipped_at`/`optional_answered_at` yang dikirim di
 * payload -- pada konflik (baris sudah ada), PostgREST hanya menulis ulang
 * kolom yang ada di payload, jadi business_category dan jawaban lain yang
 * sudah tersimpan (mis. merchant yang sebelumnya menjawab, lalu melewati
 * blok berikutnya) TIDAK ikut tertimpa NULL. `upsert` aman di sini --
 * `authenticated` punya `insert` penuh plus `update` per kolom yang mencakup
 * seluruh kolom non-kunci (`merchant_id` adalah primary key, bukan kolom
 * yang di-grant update-nya) -- lihat komentar serupa di
 * saveProfileFromDashboard di bawah.
 */
export async function skipOptionalProfile(): Promise<OnboardingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  const { error } = await supabase.from("merchant_profiles").upsert(
    {
      merchant_id: user.id,
      optional_skipped_at: new Date().toISOString(),
      optional_answered_at: null,
    },
    { onConflict: "merchant_id" },
  );

  if (error) {
    return { status: "error", message: "Gagal menyimpan. Coba lagi." };
  }

  redirect(ROUTES.dashboard);
}

/**
 * Dipanggil dari `ProfileNudge` (dashboard) untuk merchant yang belum punya
 * `business_category` tersimpan -- baik yang baris `merchant_profiles`-nya
 * belum ada sama sekali (merchant lama dari sebelum kuesioner ada), maupun
 * yang barisnya sudah ada tapi kategorinya NULL (pernah menekan "Nanti saja"
 * lewat `skipOptionalProfile`, lalu kembali lewat "Isi sekarang"). Kedua
 * populasi itu sama-sama butuh `KategoriStep` di ProfileNudgeDialog.
 *
 * `upsert` aman DI SINI, berbeda dari `merchants` (lihat komentar 1. di
 * migration `complete_onboarding`): `authenticated` punya `insert` penuh
 * plus `update` per kolom yang mencakup SELURUH kolom non-kunci
 * (`merchant_id` adalah primary key, bukan kolom yang di-grant update-nya),
 * jadi tidak ada masalah grant kolom `id` yang memaksa RPC memakai pola
 * update-lalu-insert di sana.
 *
 * Hanya menulis `business_category`/`business_type_slug` -- pada konflik,
 * PostgREST hanya menulis ulang kolom yang ada di payload, jadi
 * optional_answered_at/optional_skipped_at milik baris yang sudah ada
 * (mis. dari dismissal sebelumnya) tidak ikut tertimpa. Ini langkah "pastikan
 * kategorinya terisi dulu" sebelum dialog lanjut ke pertanyaan opsional yang
 * sama (StepProfil/StepKebutuhan), yang selalu memakai UPDATE biasa karena
 * barisnya sudah pasti ada di titik itu.
 */
export async function saveProfileFromDashboard(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = businessStepSchema.safeParse({
    business_category: formData.get("business_category"),
    business_type_slug: formData.get("business_type_slug") || null,
  });

  if (!parsed.success) {
    return { status: "error", message: "Pilih bidang usaha Anda" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  const { error } = await supabase.from("merchant_profiles").upsert(
    {
      merchant_id: user.id,
      business_category: parsed.data.business_category,
      business_type_slug: parsed.data.business_type_slug,
    },
    { onConflict: "merchant_id" },
  );

  if (error) {
    return { status: "error", message: "Gagal menyimpan. Coba lagi." };
  }

  revalidatePath(ROUTES.dashboard);
  return { status: "success" };
}
