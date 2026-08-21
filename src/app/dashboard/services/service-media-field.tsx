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
 * Berkas media yang sudah diproses (dikompres/poster dibuat) tapi belum
 * diunggah -- dipakai saat layanannya belum tersimpan sehingga belum punya
 * `service_id` untuk dilampirkan.
 */
export type DraftMedia = {
  /** Kunci lokal untuk React; bukan id database. */
  key: string;
  kind: "IMAGE" | "VIDEO";
  /** Berkas hasil kompresi, siap diunggah. */
  blob: Blob;
  ext: string;
  contentType: string;
  /** Hanya untuk VIDEO. */
  posterBlob?: Blob;
  width: number;
  height: number;
  /** Object URL untuk pratinjau; pemanggil yang mencabutnya. */
  previewUrl: string;
};

type ServiceMediaFieldProps = {
  merchantId: string;
  tier: SubscriptionTier;
} & (
  | {
      /** Mode terlampir: layanan sudah ada, media langsung disimpan. */
      serviceId: string;
      media: ServiceMedia[];
    }
  | {
      /** Mode draft: layanan belum ada, berkas ditahan di memori. */
      serviceId?: undefined;
      draft: DraftMedia[];
      onDraftChange: (draft: DraftMedia[]) => void;
      /**
       * Mengunci seluruh kontrol (tambah maupun hapus) selagi form induk
       * sedang menyimpan layanan atau mengunggah draftnya. Tanpa ini,
       * berkas yang ditambahkan/dihapus setelah submit tidak pernah
       * tercermin di unggahan yang sudah berjalan dengan snapshot draft
       * lama -- lenyap diam-diam atau tetap terunggah padahal sudah
       * "dihapus".
       */
      disabled?: boolean;
    }
);

/**
 * Memproses gambar (validasi + kompresi) tanpa menyentuh jaringan, supaya
 * bisa dipakai baik oleh mode terlampir (langsung unggah) maupun mode draft
 * (ditahan di memori dulu). Mengembalikan `string` berarti pesan galat.
 */
async function siapkanGambar(file: File): Promise<DraftMedia | string> {
  const galat = validateImageFile(file);
  if (galat) return galat;

  const { blob, width, height } = await compressImage(file, {
    maxSide: MEDIA_LIMITS.serviceImageMaxSide,
    square: false,
  });

  return {
    key: crypto.randomUUID(),
    kind: "IMAGE",
    blob,
    ext: "webp",
    contentType: "image/webp",
    width,
    height,
    previewUrl: URL.createObjectURL(blob),
  };
}

/**
 * Memproses video (poster + validasi) tanpa menyentuh jaringan. Lihat
 * `siapkanGambar` untuk alasan pemisahannya dari jalur unggah.
 */
async function siapkanVideo(file: File): Promise<DraftMedia | string> {
  // Poster dibuat LEBIH DULU karena durasinya cuma bisa dibaca dari sini.
  // Memeriksa durasi setelah mengunggah 20MB berarti kuota merchant sudah
  // telanjur habis untuk berkas yang akan ditolak.
  const poster = await captureVideoPoster(file);
  const galat = validateVideoFile(file, poster.duration);
  if (galat) return galat;

  return {
    key: crypto.randomUUID(),
    kind: "VIDEO",
    blob: file,
    ext: file.type === "video/webm" ? "webm" : "mp4",
    contentType: file.type,
    posterBlob: poster.blob,
    width: poster.width,
    height: poster.height,
    previewUrl: URL.createObjectURL(poster.blob),
  };
}

/**
 * Galeri per layanan: maksimal lima gambar dan satu video.
 *
 * Tombol video tetap TERLIHAT untuk merchant Starter, dalam keadaan terkunci.
 * Menyembunyikannya berarti merchant tidak pernah tahu ada yang bisa dibeli.
 *
 * Dua mode: terlampir (layanan sudah ada, `serviceId` terisi, media langsung
 * disimpan ke database) dan draft (layanan belum ada, berkas ditahan di
 * memori lewat `draft`/`onDraftChange` sampai layanannya disimpan).
 */
export function ServiceMediaField(props: ServiceMediaFieldProps) {
  const { merchantId, tier } = props;
  const starter = tier === "STARTER";
  const [media, setMedia] = useState<ServiceMedia[]>(
    props.serviceId !== undefined ? props.media : [],
  );
  const [sibuk, setSibuk] = useState<"image" | "video" | null>(null);
  const [, mulaiTransisi] = useTransition();

  // Hanya berlaku di mode draft -- mode terlampir tidak punya konsep ini dan
  // tetap mengunci lewat `sibuk` internal saja seperti sebelumnya.
  const terkunciDariLuar = props.serviceId === undefined && (props.disabled ?? false);

  const gambar = props.serviceId !== undefined
    ? media.filter((m) => m.kind === "IMAGE")
    : props.draft.filter((m) => m.kind === "IMAGE");
  const video = props.serviceId !== undefined
    ? media.filter((m) => m.kind === "VIDEO")
    : props.draft.filter((m) => m.kind === "VIDEO");
  const gambarPenuh = gambar.length >= MEDIA_LIMITS.maxServiceImages;
  const gambarTerkunci = gambarPenuh || sibuk !== null || terkunciDariLuar;
  const videoTerkunci = video.length > 0 || sibuk !== null || terkunciDariLuar;

  async function tambahGambar(file: File) {
    setSibuk("image");
    try {
      const hasil = await siapkanGambar(file);
      if (typeof hasil === "string") {
        toast.error(hasil);
        return;
      }

      if (props.serviceId === undefined) {
        props.onDraftChange([...props.draft, hasil]);
        return;
      }

      // Mode terlampir tidak memakai pratinjau blob; thumbnail-nya memakai
      // publicMediaUrl dari path storage setelah berkas terunggah.
      URL.revokeObjectURL(hasil.previewUrl);

      const serviceId = props.serviceId;
      const dasar = `${merchantId}/svc/${serviceId}`;
      let path: string | null = null;
      try {
        path = `${dasar}/${mediaFileName("img", hasil.ext)}`;
        await uploadMedia(path, hasil.blob, hasil.contentType);

        const data = new FormData();
        data.set("service_id", serviceId);
        data.set("kind", "IMAGE");
        data.set("path", path);
        data.set("width", String(hasil.width));
        data.set("height", String(hasil.height));
        data.set("sort_order", String(gambar.length));

        const hasilAksi = await attachServiceMedia(data);
        if (hasilAksi.status === "error") {
          await removeMedia(hasilAksi.paths);
          toast.error(hasilAksi.message);
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
            width: hasil.width,
            height: hasil.height,
            sort_order: gambar.length,
            created_at: new Date().toISOString(),
          },
        ]);
        toast.success("Gambar ditambahkan");
      } catch (error) {
        if (path) await removeMedia([path]);
        toast.error(error instanceof Error ? error.message : "Gambar gagal diunggah.");
      }
    } catch (error) {
      // Menangkap galat dari siapkanGambar (validasi/kompresi) -- try/catch
      // di atas hanya menangani galat unggah, bukan galat pemrosesan berkas.
      toast.error(error instanceof Error ? error.message : "Gambar gagal diproses.");
    } finally {
      setSibuk(null);
    }
  }

  async function tambahVideo(file: File) {
    setSibuk("video");
    try {
      const hasil = await siapkanVideo(file);
      if (typeof hasil === "string") {
        toast.error(hasil);
        return;
      }

      if (props.serviceId === undefined) {
        props.onDraftChange([...props.draft, hasil]);
        return;
      }

      // Mode terlampir tidak memakai pratinjau blob poster; thumbnail-nya
      // memakai publicMediaUrl dari path storage setelah berkas terunggah.
      URL.revokeObjectURL(hasil.previewUrl);

      const posterBlob = hasil.posterBlob;
      if (!posterBlob) {
        toast.error("Video gagal diunggah.");
        return;
      }

      const serviceId = props.serviceId;
      const dasar = `${merchantId}/svc/${serviceId}`;
      const berkas: string[] = [];
      try {
        const nama = mediaFileName("vid", hasil.ext);
        const pathVideo = `${dasar}/${nama}`;
        const pathPoster = `${dasar}/${nama.replace(/\.\w+$/, "")}-poster.webp`;

        await uploadMedia(pathPoster, posterBlob, "image/webp");
        berkas.push(pathPoster);
        await uploadMedia(pathVideo, hasil.blob, hasil.contentType);
        berkas.push(pathVideo);

        const data = new FormData();
        data.set("service_id", serviceId);
        data.set("kind", "VIDEO");
        data.set("path", pathVideo);
        data.set("poster_path", pathPoster);
        data.set("width", String(hasil.width));
        data.set("height", String(hasil.height));

        const hasilAksi = await attachServiceMedia(data);
        if (hasilAksi.status === "error") {
          await removeMedia(hasilAksi.paths);
          toast.error(hasilAksi.message);
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
            width: hasil.width,
            height: hasil.height,
            sort_order: 0,
            created_at: new Date().toISOString(),
          },
        ]);
        toast.success("Video ditambahkan");
      } catch (error) {
        if (berkas.length > 0) await removeMedia(berkas);
        toast.error(error instanceof Error ? error.message : "Video gagal diunggah.");
      }
    } catch (error) {
      // Menangkap galat dari siapkanVideo (poster/validasi) -- try/catch di
      // atas hanya menangani galat unggah, bukan galat pemrosesan berkas.
      toast.error(error instanceof Error ? error.message : "Video gagal diproses.");
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

  const thumbnailItems = props.serviceId !== undefined
    ? media.map((item) => ({
        key: item.id,
        kind: item.kind,
        src: publicMediaUrl(item.poster_path ?? item.path),
        // Mode terlampir memakai updater fungsional (setMedia), jadi aman
        // dihapus kapan pun -- tidak perlu dikunci saat sibuk.
        disabled: false,
        onHapus: () => hapus(item),
      }))
    : props.draft.map((item) => ({
        key: item.key,
        kind: item.kind,
        src: item.previewUrl,
        // Dikunci selama sibuk !== null: tambahGambar/tambahVideo memanggil
        // onDraftChange([...props.draft, hasil]) dengan props.draft yang
        // ditangkap di awal proses. Kalau item lain dihapus di tengah
        // pemrosesan (kompresi gambar/poster video bisa makan waktu), hasil
        // hapus itu tertimpa begitu penambahan selesai -- item yang sudah
        // dihapus (dan previewUrl-nya sudah dicabut) muncul lagi. Dikunci
        // juga saat `terkunciDariLuar`: form induk sedang menyimpan layanan
        // atau mengunggah draft memakai snapshot draft saat ini -- baris
        // yang dihapus setelah snapshot diambil akan tetap terunggah kalau
        // penghapusan masih diizinkan di sini.
        disabled: sibuk !== null || terkunciDariLuar,
        onHapus: () => {
          URL.revokeObjectURL(item.previewUrl);
          props.onDraftChange(props.draft.filter((d) => d.key !== item.key));
        },
      }));

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium">Foto dan video</span>

      {thumbnailItems.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {thumbnailItems.map((item) => (
            <li
              key={item.key}
              className="border-border relative aspect-[4/3] overflow-hidden border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- sudah
                  dikompres ke WebP berukuran tetap sebelum diunggah. */}
              <img src={item.src} alt="" className="size-full object-cover" />
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
                onClick={item.onHapus}
                disabled={item.disabled}
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
            disabled={gambarTerkunci}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void tambahGambar(file);
            }}
          />
          <span
            className={
              gambarTerkunci
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
              disabled={videoTerkunci}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void tambahVideo(file);
              }}
            />
            <span
              className={
                videoTerkunci
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
        Opsional. Maksimal {MEDIA_LIMITS.maxServiceImages} gambar dan 1 video per
        layanan. Video maksimal 20MB dan 30 detik; posternya dibuat otomatis.
        {gambarPenuh ? " Kuota gambar sudah penuh." : ""}
      </FieldDescription>
    </div>
  );
}
