"use server";

import { revalidatePath } from "next/cache";

import { requireMerchant } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import type { CourtPhotoInput, CourtProfileInput, VenueLayoutInput } from "@/lib/validations/court";

import * as ops from "./court-ops";

/** Sesi dari requireMerchant (terverifikasi), klien bersesi: RLS tetap aktif. */
async function ctx() {
  const { user, merchant } = await requireMerchant();
  return { sb: await createClient(), uid: user.id, username: merchant.username };
}

/** Halaman publik memuat lapangan lewat RPC; segarkan bila perubahan terlihat di sana. */
function refresh(username: string) {
  revalidatePath(ROUTES.courts);
  revalidatePath(ROUTES.merchantPage(username));
}

async function run<T extends { ok: boolean }>(fn: (c: Awaited<ReturnType<typeof ctx>>) => Promise<T>): Promise<T> {
  const c = await ctx();
  const r = await fn(c);
  if (r.ok) refresh(c.username);
  return r;
}

export async function createCourt(name: string) {
  return run((c) => ops.createCourt(c.sb, c.uid, name));
}
export async function renameCourt(id: string, name: string) {
  return run((c) => ops.renameCourt(c.sb, c.uid, id, name));
}
export async function reorderCourts(ids: string[]) {
  return run((c) => ops.reorderCourts(c.sb, c.uid, ids));
}
export async function setCourtActive(id: string, active: boolean) {
  return run((c) => ops.setCourtActive(c.sb, c.uid, id, active));
}
export async function deleteCourt(id: string) {
  return run((c) => ops.deleteCourt(c.sb, c.uid, id));
}
export async function saveCourtProfile(id: string, input: CourtProfileInput) {
  return run((c) => ops.saveCourtProfile(c.sb, c.uid, id, input));
}
export async function uploadCourtPhoto(input: CourtPhotoInput) {
  return run((c) => ops.registerCourtPhoto(c.sb, c.uid, input));
}
export async function saveCourtPhotoAlt(photoId: string, alt: string) {
  return run((c) => ops.saveCourtPhotoAlt(c.sb, c.uid, photoId, alt));
}
export async function deleteCourtPhoto(photoId: string) {
  return run((c) => ops.deleteCourtPhoto(c.sb, c.uid, photoId));
}
export async function saveVenueLayout(input: VenueLayoutInput) {
  return run((c) => ops.saveVenueLayout(c.sb, input));
}
