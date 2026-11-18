import { z } from "zod";

import { VENUE_MAX } from "@/lib/venue/geometry";

export const COURT_SPORTS = ["PADEL", "FUTSAL", "MINI_SOCCER", "BADMINTON", "TENIS"] as const;
export const COURT_ENVIRONMENTS = ["INDOOR", "OUTDOOR", "OUTDOOR_BERATAP"] as const;
export const MAX_COURT_PHOTOS = 5;

export const courtNameSchema = z
  .string()
  .trim()
  .min(1, "Nama lapangan wajib diisi")
  .max(40, "Nama lapangan maksimal 40 karakter");

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

/** Cermin constraint tabel `courts` (Global Constraints). */
export const courtProfileSchema = z.object({
  name: courtNameSchema,
  sport: z.enum(COURT_SPORTS),
  environment: z.enum(COURT_ENVIRONMENTS),
  surface: z.preprocess(emptyToNull, z.string().trim().max(60, "Permukaan maksimal 60 karakter").nullable()),
  description: z.preprocess(emptyToNull, z.string().trim().max(280, "Deskripsi maksimal 280 karakter").nullable()),
  // Butir kosong dibuang diam-diam; sisanya harus 1 sampai 40 karakter, maksimal 5.
  features: z.preprocess(
    (v) => (Array.isArray(v) ? v.map((f) => (typeof f === "string" ? f.trim() : f)).filter((f) => f !== "") : v),
    z.array(z.string().max(40, "Tiap ciri maksimal 40 karakter")).max(5, "Maksimal 5 ciri"),
  ),
});
export type CourtProfileInput = z.input<typeof courtProfileSchema>;

/** Foto tanpa teks alternatif tersimpan, tetapi tidak dikirim ke halaman publik. */
export function isPhotoPublishable(alt: string | null | undefined): boolean {
  return (alt ?? "").trim() !== "";
}

export const courtAltSchema = z.string().trim().max(140, "Teks alternatif maksimal 140 karakter");

export const courtPhotoSchema = z.object({
  courtId: z.uuid(),
  path: z.string().min(1).max(400),
  width: z.number().int().min(1).max(4096),
  height: z.number().int().min(1).max(4096),
  altText: courtAltSchema,
});
export type CourtPhotoInput = z.input<typeof courtPhotoSchema>;

const coord = z.number().int().min(0, "Posisi di luar denah").max(VENUE_MAX, "Posisi di luar denah");
const label = z.string().trim().min(1, "Label wajib diisi").max(40, "Label maksimal 40 karakter");
const box = z.object({
  id: z.uuid(),
  label,
  pos_x: coord,
  pos_y: coord,
  width: z.number().int().min(20).max(VENUE_MAX),
  height: z.number().int().min(20).max(VENUE_MAX),
  sort_order: z.number().int().min(0).max(1000),
});

export const venueLayoutSchema = z
  .object({
    courts: z
      .array(z.object({ id: z.uuid(), pos_x: coord, pos_y: coord, rotation: z.union([z.literal(0), z.literal(90)]) }))
      .max(100),
    areas: z.array(box).max(20, "Maksimal 20 area"),
    markers: z.array(box).max(50, "Maksimal 50 penanda"),
  })
  .refine((v) => new Set(v.courts.map((c) => c.id)).size === v.courts.length, { message: "Denah tidak valid" });
export type VenueLayoutInput = z.input<typeof venueLayoutSchema>;
