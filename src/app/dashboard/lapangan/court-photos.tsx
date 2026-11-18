"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { compressImage } from "@/lib/media/compress";
import { MEDIA_LIMITS } from "@/lib/media/limits";
import { removeMedia, uploadMedia } from "@/lib/media/upload";
import { publicMediaUrl } from "@/lib/media/url";
import { isPhotoPublishable, MAX_COURT_PHOTOS } from "@/lib/validations/court";
import type { CourtMedia } from "@/types/database";

import { deleteCourtPhoto, saveCourtPhotoAlt, uploadCourtPhoto } from "./actions";
import { COURT_PHOTO_MAX_BYTES, COURT_PHOTO_TOO_BIG, courtPhotoPath } from "./court-photo-rules";

type Photo = Pick<CourtMedia, "id" | "path" | "alt_text" | "width" | "height">;

/** Foto lapangan (papan L6): maksimal 5, alt wajib supaya tampil, foto pertama jadi sampul. */
export function CourtPhotos({
  merchantId,
  courtId,
  photos,
  onChange,
}: {
  merchantId: string;
  courtId: string;
  photos: Photo[];
  onChange: (photos: Photo[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [alts, setAlts] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!MEDIA_LIMITS.imageTypes.includes(file.type as never) || file.size > COURT_PHOTO_MAX_BYTES) {
      setError(COURT_PHOTO_TOO_BIG);
      return;
    }
    start(async () => {
      let path: string | null = null;
      try {
        const out = await compressImage(file, { maxSide: 1600, square: false });
        path = courtPhotoPath(merchantId, courtId, crypto.randomUUID(), "webp");
        await uploadMedia(path, out.blob, "image/webp");
        // Bila baris gagal disimpan, server menghapus objek barunya sendiri.
        const r = await uploadCourtPhoto({ courtId, path, width: out.width, height: out.height, altText: "" });
        if (!r.ok) { setError(r.error); return; }
        onChange([...photos, { id: r.id, path, alt_text: null, width: out.width, height: out.height }]);
      } catch {
        if (path) await removeMedia([path]).catch(() => undefined);
        setError("Foto gagal diunggah. Coba lagi.");
      }
    });
  }

  function saveAlt(p: Photo) {
    const alt = (alts[p.id] ?? p.alt_text ?? "").trim();
    if (alt === (p.alt_text ?? "")) return;
    start(async () => {
      const r = await saveCourtPhotoAlt(p.id, alt);
      if (!r.ok) { toast.error(r.error); return; }
      onChange(photos.map((x) => (x.id === p.id ? { ...x, alt_text: alt || null } : x)));
    });
  }

  function remove(p: Photo) {
    start(async () => {
      const r = await deleteCourtPhoto(p.id);
      if (!r.ok) { toast.error(r.error); return; }
      onChange(photos.filter((x) => x.id !== p.id));
    });
  }

  return (
    <fieldset className="flex flex-col gap-2" data-tour="court-photos">
      <legend className="mb-2 font-medium">Foto, maksimal {MAX_COURT_PHOTOS}</legend>
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p> : null}
      {photos.map((p, i) => {
        const missing = !isPhotoPublishable(alts[p.id] ?? p.alt_text);
        return (
          <div key={p.id} className="flex items-start gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- foto merchant dari Storage publik */}
            <img src={publicMediaUrl(p.path)} alt={p.alt_text ?? ""} width={72} height={54} className="h-[54px] w-[72px] shrink-0 rounded-md object-cover" />
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor={`alt-${p.id}`} className="text-muted-foreground text-xs">
                Teks alternatif foto {i + 1}{i === 0 ? ", sampul" : ""}
              </label>
              <input
                id={`alt-${p.id}`}
                maxLength={140}
                value={alts[p.id] ?? p.alt_text ?? ""}
                placeholder="Jelaskan isi foto untuk pembaca layar"
                aria-invalid={missing}
                onChange={(e) => setAlts({ ...alts, [p.id]: e.target.value })}
                onBlur={() => saveAlt(p)}
                className={`h-9 w-full rounded-lg border px-2.5 text-sm ${missing ? "border-red-700" : ""}`}
              />
              {missing ? <span className="text-xs text-red-700">Teks alternatif wajib diisi sebelum foto tampil.</span> : null}
            </div>
            <button type="button" aria-label={`Hapus foto ${i + 1}`} disabled={pending} onClick={() => remove(p)} className="h-9 px-2 text-sm text-red-700 disabled:opacity-50">
              Hapus
            </button>
          </div>
        );
      })}
      <input ref={input} type="file" accept={MEDIA_LIMITS.imageTypes.join(",")} className="sr-only" tabIndex={-1} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      <Button type="button" variant="outline" className="h-11 self-start border-dashed" disabled={pending || photos.length >= MAX_COURT_PHOTOS} onClick={() => input.current?.click()}>
        {pending ? "Memproses..." : "Unggah foto"}
      </Button>
      <span className="text-muted-foreground text-xs">Foto pertama jadi sampul di halaman booking.</span>
    </fieldset>
  );
}
