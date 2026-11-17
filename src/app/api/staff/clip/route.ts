import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { validateClipFile } from "@/lib/media/limits";
import {
  CLIP_UPLOAD_BUCKET,
  clipPosterPath,
  isClipUploadPath,
  staffMediaPrefix,
} from "@/lib/media/staff-paths";
import { ClipError, transcodeClip } from "@/lib/media/transcode-clip";
import { MEDIA_BUCKET } from "@/lib/media/url";
import { ROUTES } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  staffId: z.uuid(),
  uploadPath: z.string().max(400),
});

const GAGAL = "Gagal memproses klip. Coba lagi.";

function galat(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/**
 * POST /api/staff/clip
 *
 * Mengubah klip mentah di bucket privat jadi MP4 bisu + poster JPG di bucket
 * publik, lalu menulis `staff.motion_path` (hanya service_role yang boleh).
 * /api/* TIDAK dicakup matcher proxy, jadi sesi diverifikasi di sini dengan
 * getUser(). Klien admin melewati RLS: setiap query memfilter merchant_id.
 */
export async function POST(request: Request) {
  const raw = await request.text().catch(() => "");
  let parsed: z.infer<typeof bodySchema>;
  try {
    // Badan sah hanya ~100 byte; 2 KB sudah sangat longgar.
    if (raw.length > 2048) throw new Error("terlalu besar");
    parsed = bodySchema.parse(JSON.parse(raw));
  } catch {
    return galat("Permintaan tidak valid.", 400);
  }
  const { staffId, uploadPath } = parsed;

  const { data } = await (await createClient()).auth.getUser();
  const user = data.user;
  if (!user) return galat("Silakan masuk lagi.", 401);

  const admin = createAdminClient();

  const { data: merchant } = await admin
    .from("merchants")
    .select("subscription_tier")
    .eq("id", user.id)
    .maybeSingle();
  if (merchant?.subscription_tier !== "STUDIO") {
    return galat("Fitur staf khusus paket Studio.", 403);
  }

  const { data: staff } = await admin
    .from("staff")
    .select("id, motion_path")
    .eq("id", staffId)
    .eq("merchant_id", user.id)
    .maybeSingle();
  if (!staff) return galat("Staf tidak ditemukan.", 404);

  if (!isClipUploadPath(uploadPath, user.id, staffId)) {
    return galat("Berkas tidak dikenali. Coba unggah ulang klipnya.", 400);
  }

  let result: Awaited<ReturnType<typeof transcodeClip>>;
  try {
    const { data: blob, error } = await admin.storage.from(CLIP_UPLOAD_BUCKET).download(uploadPath);
    if (error || !blob) throw error ?? new Error("unduhan kosong");
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const sebelum = validateClipFile({ type: blob.type, size: bytes.length }, null);
    if (sebelum) return galat(sebelum, 422);

    result = await transcodeClip(bytes);
    const sesudah = validateClipFile({ type: blob.type, size: bytes.length }, result.durationSeconds);
    if (sesudah) return galat(sesudah, 422);
  } catch (error) {
    if (error instanceof ClipError) return galat(error.message, 422);
    console.error("[staf/klip] transcode gagal", { userId: user.id, staffId, error });
    return galat(GAGAL, 500);
  } finally {
    const { error } = await admin.storage.from(CLIP_UPLOAD_BUCKET).remove([uploadPath]);
    if (error) console.error("[staf/klip] hapus mentah gagal", { userId: user.id, staffId, error });
  }

  const prefix = staffMediaPrefix(user.id, staffId);
  const motionPath = `${prefix}clip-${randomBytes(4).toString("hex")}.mp4`;
  const posterPath = clipPosterPath(motionPath);
  const media = admin.storage.from(MEDIA_BUCKET);

  const [mp4Up, posterUp] = await Promise.all([
    media.upload(motionPath, result.mp4, { contentType: "video/mp4", upsert: false }),
    media.upload(posterPath, result.poster, { contentType: "image/jpeg", upsert: false }),
  ]);
  if (mp4Up.error || posterUp.error) {
    console.error("[staf/klip] unggah gagal", { userId: user.id, staffId, error: mp4Up.error ?? posterUp.error });
    await media.remove([motionPath, posterPath]);
    return galat(GAGAL, 500);
  }

  const { error: updateError } = await admin
    .from("staff")
    .update({ motion_path: motionPath })
    .eq("id", staffId)
    .eq("merchant_id", user.id);
  if (updateError) {
    console.error("[staf/klip] simpan gagal", { userId: user.id, staffId, error: updateError });
    await media.remove([motionPath, posterPath]);
    return galat(GAGAL, 500);
  }

  if (staff.motion_path?.startsWith(prefix)) {
    const { error } = await media.remove([staff.motion_path, clipPosterPath(staff.motion_path)]);
    if (error) console.error("[staf/klip] hapus klip lama gagal", { userId: user.id, staffId, error });
  }
  revalidatePath(ROUTES.staff);
  return NextResponse.json({ motionPath });
}
