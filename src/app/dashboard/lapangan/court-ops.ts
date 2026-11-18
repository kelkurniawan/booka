import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { isScopedMediaPath } from "@/lib/media/path";
import { MEDIA_BUCKET } from "@/lib/media/url";
import {
  courtAltSchema,
  courtNameSchema,
  courtPhotoSchema,
  courtProfileSchema,
  venueLayoutSchema,
  type CourtPhotoInput,
  type CourtProfileInput,
  type VenueLayoutInput,
} from "@/lib/validations/court";
import type { Database } from "@/types/database";

/**
 * Operasi lapangan, denah, dan foto. Menerima klien bersesi (authenticated,
 * RLS aktif), jadi tidak ada jalur admin di sini. Server Action tipis di
 * actions.ts; yang bisa diuji ada di sini. Daftar kode di docs/ERROR-CODES.md.
 */
type Sb = SupabaseClient<Database>;
export type Fail = { ok: false; code: string; error: string; /** has_bookings: lapangan sudah dinonaktifkan. */ deactivated?: boolean };
export type Result<T = object> = ({ ok: true } & T) | Fail;
type Ctx = "delete" | "photo" | undefined;

const MSG = {
  validation: "Data tidak valid. Periksa isian lalu coba lagi.",
  name_taken: "Nama lapangan itu sudah dipakai. Pakai nama lain.",
  forbidden: "Anda tidak punya akses untuk tindakan ini.",
  invalid_data: "Data tidak valid. Periksa isian lalu coba lagi.",
  has_bookings: "Lapangan yang punya riwayat booking dinonaktifkan, bukan dihapus.",
  court_not_found: "Lapangan tidak ditemukan. Muat ulang halaman lalu coba lagi.",
  photo_not_found: "Foto tidak ditemukan. Muat ulang halaman lalu coba lagi.",
  photo_limit: "Satu lapangan maksimal 5 foto.",
  invalid_path: "Berkas tidak dikenali. Coba unggah ulang gambarnya.",
  reorder_partial: "Urutan hanya tersimpan sebagian. Muat ulang halaman untuk melihat urutan sebenarnya.",
  server_error: "Terjadi kesalahan. Coba lagi.",
} as const;
type Code = keyof typeof MSG;

const fail = (code: Code, error?: string): Fail => ({ ok: false, code, error: error ?? MSG[code] });

/** Kode Postgres ke galat form; teks mentah tidak pernah ikut. Tak dikenal dicatat. */
export function mapCourtManageError(pgCode: string | undefined, ctx?: Ctx): Fail {
  switch (pgCode) {
    case "23505": return ctx === "photo" ? fail("invalid_path") : fail("name_taken");
    case "42501": return fail("forbidden");
    case "22023":
    case "23514": return fail("invalid_data");
    case "23503": return fail(ctx === "delete" ? "has_bookings" : ctx === "photo" ? "court_not_found" : "invalid_data");
    case "P0001": return fail("photo_limit");
    default:
      console.error("[lapangan] galat tak dikenal", { pgCode });
      return fail("server_error");
  }
}

const zodFail = (e: z.ZodError) => fail("validation", e.issues[0]?.message ?? MSG.validation);
/** MIME dibatasi bucket (allowed_mime_types); di sini ekstensinya. */
const PHOTO_EXT = /\.(webp|jpe?g|png)$/i;
const idSchema = z.uuid();
const notFound = (rows: unknown) => !Array.isArray(rows) || rows.length === 0;

/** Hapus objek Storage; kegagalan tidak boleh membatalkan hasil (berkas yatim tidak berbahaya). */
async function removeObjects(sb: Sb, paths: string[]): Promise<number> {
  if (paths.length === 0) return 0;
  try {
    const { error } = await sb.storage.from(MEDIA_BUCKET).remove(paths);
    if (error) throw error;
    return 0;
  } catch (e) {
    console.error("[lapangan] gagal menghapus objek Storage", { count: paths.length, e });
    return paths.length;
  }
}

export async function createCourt(sb: Sb, uid: string, name: string): Promise<Result<{ court: { id: string; name: string } }>> {
  const p = courtNameSchema.safeParse(name);
  if (!p.success) return zodFail(p.error);
  const { count, error: ce } = await sb.from("courts").select("id", { count: "exact", head: true }).eq("merchant_id", uid);
  if (ce) return mapCourtManageError(ce.code);
  const { data, error } = await sb
    .from("courts")
    .insert({ merchant_id: uid, name: p.data, sort_order: count ?? 0 })
    .select("id, name")
    .single();
  if (error || !data) return mapCourtManageError(error?.code);
  return { ok: true, court: { id: data.id, name: data.name } };
}

async function updateOwn(sb: Sb, uid: string, id: string, patch: Database["public"]["Tables"]["courts"]["Update"]): Promise<Result> {
  if (!idSchema.safeParse(id).success) return fail("validation");
  const { data, error } = await sb.from("courts").update(patch).eq("id", id).eq("merchant_id", uid).select("id");
  if (error) return mapCourtManageError(error.code);
  return notFound(data) ? fail("court_not_found") : { ok: true };
}

export async function renameCourt(sb: Sb, uid: string, id: string, name: string): Promise<Result> {
  const p = courtNameSchema.safeParse(name);
  return p.success ? updateOwn(sb, uid, id, { name: p.data }) : zodFail(p.error);
}

export async function setCourtActive(sb: Sb, uid: string, id: string, active: boolean): Promise<Result> {
  if (typeof active !== "boolean") return fail("validation");
  return updateOwn(sb, uid, id, { is_active: active });
}

export async function saveCourtProfile(sb: Sb, uid: string, id: string, input: CourtProfileInput): Promise<Result> {
  const p = courtProfileSchema.safeParse(input);
  return p.success ? updateOwn(sb, uid, id, p.data) : zodFail(p.error);
}

export async function reorderCourts(sb: Sb, uid: string, ids: string[]): Promise<Result> {
  const p = z.array(z.uuid()).max(100).safeParse(ids);
  if (!p.success || new Set(p.data).size !== p.data.length) return fail("validation");
  const res = await Promise.all(p.data.map((id, i) => updateOwn(sb, uid, id, { sort_order: i })));
  const failed = res.filter((r): r is Fail => !r.ok);
  if (failed.length === 0) return { ok: true };
  // Sebagian berhasil: jangan berpura-pura gagal total atau sukses.
  return failed.length === res.length ? failed[0] : fail("reorder_partial");
}

/** Pesan "dinonaktifkan, bukan dihapus" harus benar: lapangan benar-benar dinonaktifkan. */
async function deactivateInstead(sb: Sb, uid: string, id: string): Promise<Fail> {
  const r = await updateOwn(sb, uid, id, { is_active: false });
  return { ...fail("has_bookings"), deactivated: r.ok };
}

/**
 * Hapus lapangan: ditolak bila punya booking (FK bookings_court_fk tanpa
 * cascade, 23503 jadi jaring balapan). Baris dihapus DULU, objek Storage
 * sesudahnya: kalau urutannya dibalik, kegagalan DB meninggalkan foto
 * publik yang rusak; kegagalan Storage sesudahnya hanya meninggalkan berkas yatim.
 */
export async function deleteCourt(sb: Sb, uid: string, id: string): Promise<Result<{ orphanedFiles: number }>> {
  if (!idSchema.safeParse(id).success) return fail("validation");
  const bk = await sb.from("bookings").select("id", { count: "exact", head: true }).eq("merchant_id", uid).eq("court_id", id);
  if (bk.error) return mapCourtManageError(bk.error.code, "delete");
  if ((bk.count ?? 0) > 0) return deactivateInstead(sb, uid, id);

  const media = await sb.from("court_media").select("path").eq("merchant_id", uid).eq("court_id", id);
  if (media.error) return mapCourtManageError(media.error.code, "delete");

  const { data, error } = await sb.from("courts").delete().eq("id", id).eq("merchant_id", uid).select("id");
  if (error) return error.code === "23503" ? deactivateInstead(sb, uid, id) : mapCourtManageError(error.code, "delete");
  if (notFound(data)) return fail("court_not_found");

  const orphanedFiles = await removeObjects(sb, (media.data ?? []).map((m) => m.path));
  return { ok: true, orphanedFiles };
}

/**
 * Mencatat foto yang SUDAH diunggah browser ke Storage (pola halaman/actions:
 * klien menulis objek, policy folder menjaga). Bila baris gagal disimpan,
 * objek barunya dihapus supaya tidak yatim.
 */
export async function registerCourtPhoto(sb: Sb, uid: string, input: CourtPhotoInput): Promise<Result<{ id: string }>> {
  const p = courtPhotoSchema.safeParse(input);
  if (!p.success) return zodFail(p.error);
  const v = p.data;
  if (!v.path.startsWith(`${uid}/court/${v.courtId}/`) || !isScopedMediaPath(v.path, uid) || !PHOTO_EXT.test(v.path)) return fail("invalid_path");

  // Objek hanya dihapus bila tidak dirujuk baris mana pun (jalur yang sudah dipakai foto lain tetap aman).
  const abort = async (f: Fail) => {
    const used = await sb.from("court_media").select("id").eq("merchant_id", uid).eq("path", v.path).maybeSingle();
    if (!used.data) await removeObjects(sb, [v.path]);
    return f;
  };
  const cnt = await sb.from("court_media").select("id", { count: "exact", head: true }).eq("merchant_id", uid).eq("court_id", v.courtId);
  if (cnt.error) return abort(mapCourtManageError(cnt.error.code, "photo"));
  const { data, error } = await sb
    .from("court_media")
    .insert({
      court_id: v.courtId, merchant_id: uid, path: v.path,
      alt_text: v.altText === "" ? null : v.altText,
      width: v.width, height: v.height, sort_order: cnt.count ?? 0,
    })
    .select("id")
    .single();
  if (error || !data) return abort(mapCourtManageError(error?.code, "photo"));
  return { ok: true, id: data.id };
}

export async function saveCourtPhotoAlt(sb: Sb, uid: string, photoId: string, alt: string): Promise<Result> {
  const a = courtAltSchema.safeParse(alt);
  if (!a.success) return zodFail(a.error);
  if (!idSchema.safeParse(photoId).success) return fail("validation");
  const { data, error } = await sb
    .from("court_media")
    .update({ alt_text: a.data === "" ? null : a.data })
    .eq("id", photoId)
    .eq("merchant_id", uid)
    .select("id");
  if (error) return mapCourtManageError(error.code);
  return notFound(data) ? fail("photo_not_found") : { ok: true };
}

export async function deleteCourtPhoto(sb: Sb, uid: string, photoId: string): Promise<Result<{ orphanedFiles: number }>> {
  if (!idSchema.safeParse(photoId).success) return fail("validation");
  const row = await sb.from("court_media").select("path").eq("id", photoId).eq("merchant_id", uid).maybeSingle();
  if (row.error) return mapCourtManageError(row.error.code);
  if (!row.data) return fail("photo_not_found");
  const { error } = await sb.from("court_media").delete().eq("id", photoId).eq("merchant_id", uid).select("id");
  if (error) return mapCourtManageError(error.code);
  return { ok: true, orphanedFiles: await removeObjects(sb, [row.data.path]) };
}

export async function saveVenueLayout(sb: Sb, input: VenueLayoutInput): Promise<Result> {
  const p = venueLayoutSchema.safeParse(input);
  if (!p.success) return zodFail(p.error);
  const { error } = await sb.rpc("save_venue_layout", { p_courts: p.data.courts, p_areas: p.data.areas, p_markers: p.data.markers });
  return error ? mapCourtManageError(error.code) : { ok: true };
}
