"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z, type ZodError } from "zod";

import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { courtServiceSchema, serviceSchema } from "@/lib/validations/service";
import { isScopedMediaPath, PESAN_PATH_TIDAK_VALID } from "@/lib/media/path";
import { serviceMediaSchema } from "@/lib/validations/service-media";

import { mapCourtError } from "./court-errors";
import { createServiceRecord, updateServiceRecord } from "./save-service";
import type { AddCourtResult, ServiceFormState } from "./service-state";

function toFieldErrors(error: ZodError): ServiceFormState {
  const fieldErrors: ServiceFormState["fieldErrors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      key === "name" ||
      key === "description" ||
      key === "price" ||
      key === "duration_minutes" ||
      key === "deposit_type" ||
      key === "deposit_value" ||
      key === "partyMin" ||
      key === "partyMax" ||
      key === "seatDurationMinutes"
    ) {
      fieldErrors[key] ??= issue.message;
    }
  }
  return { status: "error", message: "Periksa kembali isian Anda", fieldErrors };
}

/** Kotak "Sewa lapangan" menyala: durasi = lama main minimum, bidang restoran dikosongkan (CHECK services_court_xor_seat). */
const isRental = (formData: FormData) => formData.get("courtEnabled") === "1";

function parseCourtForm(formData: FormData) {
  let courtIds: unknown;
  let rules: unknown;
  try {
    courtIds = JSON.parse(String(formData.get("courtIds") ?? "[]"));
    rules = JSON.parse(String(formData.get("courtRules") ?? "[]"));
  } catch {
    courtIds = null;
  }
  return courtServiceSchema.safeParse({
    unit: formData.get("courtUnit"),
    minMinutes: formData.get("courtMin"),
    maxMinutes: formData.get("courtMax"),
    courtIds,
    rules,
  });
}

const COURT_FORM_ERROR: ServiceFormState = {
  status: "error",
  message: "Periksa kembali isian Anda",
  fieldErrors: {},
};

function parseServiceForm(formData: FormData) {
  const rental = isRental(formData);
  return serviceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    price: formData.get("price"),
    duration_minutes: rental ? formData.get("courtMin") : formData.get("duration_minutes"),
    payment_mode: formData.get("payment_mode") ?? undefined,
    deposit_type: formData.get("deposit_type") ?? "",
    deposit_value: formData.get("deposit_value") ?? "",
    partyMin: rental ? "" : (formData.get("partyMin") ?? ""),
    partyMax: rental ? "" : (formData.get("partyMax") ?? ""),
    // Kotak "Reservasi meja" mati: lama duduk tidak terkirim, jadi null.
    seatDurationMinutes: rental ? "" : (formData.get("seatDurationMinutes") ?? ""),
  });
}

export async function createService(
  _prevState: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const parsed = parseServiceForm(formData);
  if (!parsed.success) return toFieldErrors(parsed.error);
  const courtParsed = isRental(formData) ? parseCourtForm(formData) : null;
  if (courtParsed && !courtParsed.success) {
    return { ...COURT_FORM_ERROR, courtError: courtParsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  const result = await createServiceRecord(supabase, user.id, parsed.data, courtParsed?.data ?? null);
  if (result.status === "success") {
    revalidatePath(ROUTES.services);
    revalidatePath(ROUTES.dashboard);
  }
  return result;
}

export async function updateService(
  _prevState: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const id = formData.get("id")?.toString();
  if (!id) return { status: "error", message: "Layanan tidak ditemukan." };

  const parsed = parseServiceForm(formData);
  if (!parsed.success) return toFieldErrors(parsed.error);
  const courtParsed = isRental(formData) ? parseCourtForm(formData) : null;
  if (courtParsed && !courtParsed.success) {
    return { ...COURT_FORM_ERROR, courtError: courtParsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  const result = await updateServiceRecord(
    supabase,
    user.id,
    id,
    parsed.data,
    courtParsed?.data ?? null,
  );
  if (result.status === "success") revalidatePath(ROUTES.services);
  return result;
}

export async function deleteService(
  id: string,
): Promise<{ ok: boolean; message?: string; paths?: string[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  // Baris service_media ikut terhapus lewat ON DELETE CASCADE, tapi berkasnya
  // di Storage tidak -- cascade database tidak tahu apa-apa soal bucket. Path
  // dikumpulkan SEBELUM penghapusan supaya klien bisa membersihkannya; tanpa
  // ini setiap layanan yang dihapus meninggalkan berkas yang dibayar selamanya.
  const { data: media } = await supabase
    .from("service_media")
    .select("path, poster_path")
    .eq("service_id", id)
    .eq("merchant_id", user.id);

  const paths = (media ?? []).flatMap((baris) =>
    [baris.path, baris.poster_path].filter((p): p is string => Boolean(p)),
  );

  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", id)
    .eq("merchant_id", user.id);

  if (error) {
    return { ok: false, message: "Gagal menghapus layanan. Coba lagi." };
  }

  revalidatePath(ROUTES.services);
  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.appearance);
  return { ok: true, paths };
}

export async function toggleServiceActive(
  id: string,
  isActive: boolean,
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  const { error } = await supabase
    .from("services")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("merchant_id", user.id);

  if (error) {
    return { ok: false, message: "Gagal mengubah status layanan. Coba lagi." };
  }

  revalidatePath(ROUTES.services);
  revalidatePath(ROUTES.dashboard);
  return { ok: true };
}

/**
 * Hasil aksi media. `path` dan `poster_path` SELALU ikut dikembalikan, juga
 * saat gagal: berkasnya sudah terlanjur mendarat di Storage saat aksi ini
 * dipanggil, dan kliennya yang harus menghapusnya. Tanpa itu, penolakan video
 * milik merchant Starter meninggalkan berkas 20MB yatim di bucket setiap kali
 * dicoba.
 */
export type ServiceMediaActionResult = {
  status: "success" | "error";
  message?: string;
  paths: string[];
};

export async function attachServiceMedia(
  formData: FormData,
): Promise<ServiceMediaActionResult> {
  const path = String(formData.get("path") ?? "");
  const posterPath = String(formData.get("poster_path") ?? "");
  const berkas = [path, posterPath].filter((p) => p !== "");

  const parsed = serviceMediaSchema.safeParse({
    service_id: formData.get("service_id"),
    kind: formData.get("kind"),
    path,
    poster_path: posterPath,
    alt: formData.get("alt") ?? "",
    width: formData.get("width"),
    height: formData.get("height"),
    sort_order: formData.get("sort_order") ?? 0,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0].message,
      paths: berkas,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  // Path datang dari browser. Constraint service_media_path_scoped sudah
  // menahannya di database; dicek juga di sini supaya merchant mendapat
  // kalimat yang bisa dibaca, bukan galat Postgres mentah.
  const pathTidakValid =
    !isScopedMediaPath(parsed.data.path, user.id) ||
    (parsed.data.poster_path !== null &&
      !isScopedMediaPath(parsed.data.poster_path, user.id));

  if (pathTidakValid) {
    return { status: "error", message: PESAN_PATH_TIDAK_VALID, paths: berkas };
  }

  const { error } = await supabase
    .from("service_media")
    .insert({ merchant_id: user.id, ...parsed.data });

  if (error) {
    // Trigger service_media_enforce_limit melempar P0001 dengan pesan yang
    // sudah berbahasa Indonesia dan sudah menyebut sebabnya -- diteruskan apa
    // adanya ketimbang ditulis ulang dan berisiko berbeda.
    return {
      status: "error",
      message:
        error.code === "P0001"
          ? error.message
          : "Media gagal disimpan. Coba lagi sebentar lagi.",
      paths: berkas,
    };
  }

  revalidatePath(ROUTES.services);
  revalidatePath(ROUTES.appearance);
  return { status: "success", paths: [] };
}

export async function detachServiceMedia(
  formData: FormData,
): Promise<ServiceMediaActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "Media tidak ditemukan.", paths: [] };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  // merchant_id ikut difilter, bukan hanya id: policy RLS sudah menutupnya,
  // tapi filter eksplisit membuat maksudnya terbaca di tempat.
  const { data, error } = await supabase
    .from("service_media")
    .delete()
    .eq("id", id)
    .eq("merchant_id", user.id)
    .select("path, poster_path");

  if (error) {
    return { status: "error", message: "Media gagal dihapus.", paths: [] };
  }

  const terhapus = (data ?? []).flatMap((baris) =>
    [baris.path, baris.poster_path].filter((p): p is string => Boolean(p)),
  );

  revalidatePath(ROUTES.services);
  revalidatePath(ROUTES.appearance);
  return { status: "success", paths: terhapus };
}

const courtNameSchema = z.string().trim().min(1, "Nama lapangan wajib diisi").max(40, "Nama lapangan maksimal 40 karakter");

/** "Tambah lapangan" inline di form layanan; manajer lengkap ada di Task 9. */
export async function addCourt(name: string): Promise<AddCourtResult> {
  const parsed = courtNameSchema.safeParse(name);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  const { data, error } = await supabase
    .from("courts")
    .insert({ merchant_id: user.id, name: parsed.data })
    .select("id, name")
    .single();

  if (error || !data) return { status: "error", message: mapCourtError(error?.code) };

  revalidatePath(ROUTES.services);
  return { status: "success", court: { id: data.id, name: data.name, note: "Indoor" } };
}
