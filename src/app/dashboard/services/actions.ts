"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";

import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { serviceSchema } from "@/lib/validations/service";
import { serviceMediaSchema } from "@/lib/validations/service-media";

import type { ServiceFormState } from "./service-state";

/** Pesan ramah untuk error P0001 yang dilempar trigger enforce_service_limit. */
const LIMIT_MESSAGE =
  "Paket Starter hanya mengizinkan 1 layanan. Upgrade paket untuk menambah layanan lagi.";

function toFieldErrors(error: z.ZodError): ServiceFormState {
  const fieldErrors: ServiceFormState["fieldErrors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      key === "name" ||
      key === "description" ||
      key === "price" ||
      key === "duration_minutes"
    ) {
      fieldErrors[key] ??= issue.message;
    }
  }
  return { status: "error", message: "Periksa kembali isian Anda", fieldErrors };
}

function parseServiceForm(formData: FormData) {
  return serviceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    price: formData.get("price"),
    duration_minutes: formData.get("duration_minutes"),
  });
}

export async function createService(
  _prevState: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const parsed = parseServiceForm(formData);
  if (!parsed.success) return toFieldErrors(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  const { error } = await supabase.from("services").insert({
    merchant_id: user.id,
    name: parsed.data.name,
    description: parsed.data.description,
    price: parsed.data.price,
    duration_minutes: parsed.data.duration_minutes,
  });

  if (error) {
    // P0001 — trigger enforce_service_limit menolak layanan kedua paket Starter.
    if (error.code === "P0001") {
      return { status: "error", message: LIMIT_MESSAGE, limitReached: true };
    }
    return { status: "error", message: "Gagal menyimpan layanan. Coba lagi." };
  }

  revalidatePath(ROUTES.services);
  revalidatePath(ROUTES.dashboard);
  return { status: "success" };
}

export async function updateService(
  _prevState: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const id = formData.get("id")?.toString();
  if (!id) return { status: "error", message: "Layanan tidak ditemukan." };

  const parsed = parseServiceForm(formData);
  if (!parsed.success) return toFieldErrors(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  const { error } = await supabase
    .from("services")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      price: parsed.data.price,
      duration_minutes: parsed.data.duration_minutes,
    })
    .eq("id", id)
    // RLS sudah membatasi ke merchant pemilik, tapi filter eksplisit ini
    // membuat maksudnya jelas terbaca di kode dan bukan hanya bergantung
    // pada policy database.
    .eq("merchant_id", user.id);

  if (error) {
    return { status: "error", message: "Gagal menyimpan perubahan. Coba lagi." };
  }

  revalidatePath(ROUTES.services);
  return { status: "success" };
}

export async function deleteService(
  id: string,
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

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
  return { ok: true };
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
