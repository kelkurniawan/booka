"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Film, ImageUp, Loader2, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { captureVideoPoster, compressImage } from "@/lib/media/compress";
import {
  MEDIA_LIMITS,
  validateImageFile,
  validateVideoFile,
} from "@/lib/media/limits";
import { mediaFileName, removeMedia, uploadMedia } from "@/lib/media/upload";
import { publicMediaUrl } from "@/lib/media/url";
import { ROUTES } from "@/lib/routes";
import type { ServiceMedia, SubscriptionTier } from "@/types/database";

import { attachServiceMedia, detachServiceMedia } from "./actions";

/**
 * Galeri per layanan: maksimal lima gambar dan satu video.
 *
 * Tombol video tetap TERLIHAT untuk merchant Starter, dalam keadaan terkunci.
 * Menyembunyikannya berarti merchant tidak pernah tahu ada yang bisa dibeli.
 */
export function ServiceMediaField({
  serviceId,
  merchantId,
  tier,
  media: mediaAwal,
}: {
  serviceId: string;
  merchantId: string;
  tier: SubscriptionTier;
  media: ServiceMedia[];
}) {
  const starter = tier === "STARTER";
  const [media, setMedia] = useState(mediaAwal);
  const [sibuk, setSibuk] = useState<"image" | "video" | null>(null);
  const [, mulaiTransisi] = useTransition();

  const gambar = media.filter((m) => m.kind === "IMAGE");
  const video = media.filter((m) => m.kind === "VIDEO");
  const gambarPenuh = gambar.length >= MEDIA_LIMITS.maxServiceImages;

  const dasar = `${merchantId}/svc/${serviceId}`;

  async function tambahGambar(file: File) {
    const galat = validateImageFile(file);
    if (galat) {
      toast.error(galat);
      return;
    }

    setSibuk("image");
    let path: string | null = null;
    try {
      const { blob, width, height } = await compressImage(file, {
        maxSide: MEDIA_LIMITS.serviceImageMaxSide,
        square: false,
      });
      path = `${dasar}/${mediaFileName("img", "webp")}`;
      await uploadMedia(path, blob, "image/webp");

      const data = new FormData();
      data.set("service_id", serviceId);
      data.set("kind", "IMAGE");
      data.set("path", path);
      data.set("width", String(width));
      data.set("height", String(height));
      data.set("sort_order", String(gambar.length));

      const hasil = await attachServiceMedia(data);
      if (hasil.status === "error") {
        await removeMedia(hasil.paths);
        toast.error(hasil.message);
        return;
      }

      setMedia((lama) => [
        ...lama,
        {
          id: crypto.randomUUID(),
          service_id: serviceId,
          merchant_id: merchantId,
          kind: "IMAGE",
          path: path as string,
          poster_path: null,
          alt: null,
          width,
          height,
          sort_order: gambar.length,
          created_at: new Date().toISOString(),
        },
      ]);
      toast.success("Gambar ditambahkan");
    } catch (error) {
      if (path) await removeMedia([path]);
      toast.error(error instanceof Error ? error.message : "Gambar gagal diunggah.");
    } finally {
      setSibuk(null);
    }
  }

  async function tambahVideo(file: File) {
    setSibuk("video");
    const berkas: string[] = [];
    try {
      // Poster dibuat LEBIH DULU karena durasinya cuma bisa dibaca dari sini.
      // Memeriksa durasi setelah mengunggah 20MB berarti kuota merchant sudah
      // telanjur habis untuk berkas yang akan ditolak.
      const poster = await captureVideoPoster(file);
      const galat = validateVideoFile(file, poster.duration);
      if (galat) {
        toast.error(galat);
        return;
      }

      const ext = file.type === "video/webm" ? "webm" : "mp4";
      const nama = mediaFileName("vid", ext);
      const pathVideo = `${dasar}/${nama}`;
      const pathPoster = `${dasar}/${nama.replace(/\.\w+$/, "")}-poster.webp`;

      await uploadMedia(pathPoster, poster.blob, "image/webp");
      berkas.push(pathPoster);
      await uploadMedia(pathVideo, file, file.type);
      berkas.push(pathVideo);

      const data = new FormData();
      data.set("service_id", serviceId);
      data.set("kind", "VIDEO");
      data.set("path", pathVideo);
      data.set("poster_path", pathPoster);
      data.set("width", String(poster.width));
      data.set("height", String(poster.height));

      const hasil = await attachServiceMedia(data);
      if (hasil.status === "error") {
        await removeMedia(hasil.paths);
        toast.error(hasil.message);
        return;
      }

      setMedia((lama) => [
        ...lama,
        {
          id: crypto.randomUUID(),
          service_id: serviceId,
          merchant_id: merchantId,
          kind: "VIDEO",
          path: pathVideo,
          poster_path: pathPoster,
          alt: null,
          width: poster.width,
          height: poster.height,
          sort_order: 0,
          created_at: new Date().toISOString(),
        },
      ]);
      toast.success("Video ditambahkan");
    } catch (error) {
      if (berkas.length > 0) await removeMedia(berkas);
      toast.error(error instanceof Error ? error.message : "Video gagal diunggah.");
    } finally {
      setSibuk(null);
    }
  }

  function hapus(item: ServiceMedia) {
    const data = new FormData();
    data.set("id", item.id);
    mulaiTransisi(async () => {
      const hasil = await detachServiceMedia(data);
      if (hasil.status === "error") {
        toast.error(hasil.message);
        return;
      }
      await removeMedia(hasil.paths);
      setMedia((lama) => lama.filter((m) => m.id !== item.id));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium">Foto dan video</span>

      {media.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {media.map((item) => (
            <li
              key={item.id}
              className="border-border relative aspect-[4/3] overflow-hidden border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- sudah
                  dikompres ke WebP berukuran tetap sebelum diunggah. */}
              <img
                src={publicMediaUrl(item.poster_path ?? item.path)}
                alt=""
                className="size-full object-cover"
              />
              {item.kind === "VIDEO" ? (
                <Film
                  className="absolute top-1 left-1 size-4 text-white drop-shadow"
                  aria-hidden
                />
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute top-1 right-1 bg-black/60 text-white hover:bg-black/80"
                onClick={() => hapus(item)}
                aria-label="Hapus media"
              >
                <Trash2 className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={gambarPenuh || sibuk !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void tambahGambar(file);
            }}
          />
          <span
            className={
              gambarPenuh || sibuk !== null
                ? "border-border inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium opacity-50"
                : "border-border hover:bg-muted inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium"
            }
          >
            {sibuk === "image" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImageUp className="size-4" />
            )}
            Tambah gambar
          </span>
        </label>

        {starter ? (
          <Link href={ROUTES.billing} className="inline-flex items-center gap-1">
            <Badge variant="secondary" className="gap-1">
              <Lock className="size-3" />
              Video khusus Pro
            </Badge>
          </Link>
        ) : (
          <label className="inline-flex">
            <input
              type="file"
              accept="video/mp4,video/webm"
              className="sr-only"
              disabled={video.length > 0 || sibuk !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void tambahVideo(file);
              }}
            />
            <span
              className={
                video.length > 0 || sibuk !== null
                  ? "border-border inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium opacity-50"
                  : "border-border hover:bg-muted inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium"
              }
            >
              {sibuk === "video" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Film className="size-4" />
              )}
              Tambah video
            </span>
          </label>
        )}
      </div>

      <FieldDescription>
        Maksimal {MEDIA_LIMITS.maxServiceImages} gambar dan 1 video per layanan. Video
        maksimal 20MB dan 30 detik; posternya dibuat otomatis.
        {gambarPenuh ? " Kuota gambar sudah penuh." : ""}
      </FieldDescription>
    </div>
  );
}
