"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";

import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { serviceSchema } from "@/lib/validations/service";

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
