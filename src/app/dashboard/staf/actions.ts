"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PESAN_PATH_TIDAK_VALID } from "@/lib/media/path";
import { clipPosterPath, isStaffPhotoPath } from "@/lib/media/staff-paths";
import { MEDIA_BUCKET } from "@/lib/media/url";
import { ROUTES } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  staffHoursSchema,
  staffNameSchema,
  staffProfileSchema,
  type StaffHoursInput,
  type StaffProfileInput,
} from "@/lib/validations/staff";

export type StaffActionResult = { ok: true } | { ok: false; message: string };

async function sessionClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(ROUTES.login);
  return { supabase, userId: user.id };
}

function done(): StaffActionResult {
  revalidatePath(ROUTES.staff);
  return { ok: true };
}

export async function createStaff(name: string): Promise<StaffActionResult> {
  const parsed = staffNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const { supabase, userId } = await sessionClient();
  const { count } = await supabase
    .from("staff")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", userId);

  const { error } = await supabase
    .from("staff")
    .insert({ merchant_id: userId, name: parsed.data, sort_order: count ?? 0 });

  if (error) {
    // Kode dari trigger enforce_staff_limit (migration 20261005180027).
    if (error.code === "BK010") return { ok: false, message: "Fitur staf khusus paket Studio." };
    if (error.code === "BK011") return { ok: false, message: "Maksimal 20 staf." };
    console.error("[staf] gagal menambah staf", { userId, error });
    return { ok: false, message: "Gagal menambah staf. Coba lagi." };
  }
  return done();
}

export async function updateStaff(
  id: string,
  changes: { name?: string; is_active?: boolean },
): Promise<StaffActionResult> {
  const update: { name?: string; is_active?: boolean } = {};
  if (changes.name !== undefined) {
    const parsed = staffNameSchema.safeParse(changes.name);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    update.name = parsed.data;
  }
  if (changes.is_active !== undefined) update.is_active = changes.is_active;

  const { supabase, userId } = await sessionClient();
  const { error } = await supabase.from("staff").update(update).eq("id", id).eq("merchant_id", userId);
  if (error) {
    console.error("[staf] gagal mengubah staf", { userId, error });
    return { ok: false, message: "Gagal menyimpan perubahan. Coba lagi." };
  }
  return done();
}

/** Berkas staf di bucket publik: foto, klip MP4, dan posternya. */
function staffFiles(row: { photo_path: string | null; motion_path: string | null }): string[] {
  return [
    row.photo_path,
    row.motion_path,
    row.motion_path ? clipPosterPath(row.motion_path) : null,
  ].filter((path): path is string => Boolean(path));
}

/** Gagal menghapus berkas tidak menggagalkan aksi; yang tersisa hanya berkas yatim. */
async function removeFiles(userId: string, paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await createAdminClient().storage.from(MEDIA_BUCKET).remove(paths);
  if (error) console.error("[staf] gagal menghapus berkas", { userId, error });
}

export async function deleteStaff(id: string): Promise<StaffActionResult> {
  const { supabase, userId } = await sessionClient();
  const { data: lama } = await supabase
    .from("staff")
    .select("photo_path, motion_path")
    .eq("id", id)
    .eq("merchant_id", userId)
    .maybeSingle();
  const { error } = await supabase.from("staff").delete().eq("id", id).eq("merchant_id", userId);
  if (error) {
    // 23503: masih dirujuk booking -- riwayatnya harus tetap menunjuk staf ini.
    if (error.code === "23503") {
      return {
        ok: false,
        message: "Staf ini punya riwayat booking. Nonaktifkan saja supaya tidak bisa dipesan lagi.",
      };
    }
    console.error("[staf] gagal menghapus staf", { userId, error });
    return { ok: false, message: "Gagal menghapus staf. Coba lagi." };
  }
  if (lama) await removeFiles(userId, staffFiles(lama));
  return done();
}

export async function updateStaffProfile(
  id: string,
  input: StaffProfileInput,
): Promise<StaffActionResult> {
  const parsed = staffProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const { supabase, userId } = await sessionClient();
  if (parsed.data.photo_path && !isStaffPhotoPath(parsed.data.photo_path, userId, id)) {
    return { ok: false, message: PESAN_PATH_TIDAK_VALID };
  }

  const { error } = await supabase
    .from("staff")
    .update(parsed.data)
    .eq("id", id)
    .eq("merchant_id", userId);
  if (error) {
    if (error.code === "23514") return { ok: false, message: "Profil tidak valid. Periksa isiannya." };
    console.error("[staf] gagal menyimpan profil", { userId, error });
    return { ok: false, message: "Gagal menyimpan profil. Coba lagi." };
  }
  return done();
}

/** Mengosongkan motion_path (admin, difilter merchant_id) lalu menghapus MP4 dan posternya. */
export async function removeStaffClip(id: string): Promise<StaffActionResult> {
  const { supabase, userId } = await sessionClient();
  const { data: lama } = await supabase
    .from("staff")
    .select("motion_path")
    .eq("id", id)
    .eq("merchant_id", userId)
    .maybeSingle();
  if (!lama?.motion_path) return done();

  // motion_path hanya bisa ditulis service_role (Keputusan 3), jadi klien admin.
  const { error } = await createAdminClient()
    .from("staff")
    .update({ motion_path: null })
    .eq("id", id)
    .eq("merchant_id", userId);
  if (error) {
    console.error("[staf] gagal menghapus klip", { userId, error });
    return { ok: false, message: "Gagal menghapus klip. Coba lagi." };
  }
  await removeFiles(userId, staffFiles({ photo_path: null, motion_path: lama.motion_path }));
  return done();
}

/** Daftar kosong = staf kembali mengikuti jam kerja usaha. */
export async function saveStaffHours(id: string, rows: StaffHoursInput): Promise<StaffActionResult> {
  const parsed = staffHoursSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const { supabase, userId } = await sessionClient();
  const { error } = await supabase.rpc("replace_staff_availability", {
    p_staff_id: id,
    p_rows: parsed.data,
  });
  if (error) {
    console.error("[staf] gagal menyimpan jam kerja staf", { userId, error });
    return { ok: false, message: "Gagal menyimpan jam kerja. Coba lagi." };
  }
  return done();
}
