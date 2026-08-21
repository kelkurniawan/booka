"use client";

/**
 * Pengecilan gambar dan pembuatan poster video lewat canvas.
 *
 * Semuanya terjadi di browser SEBELUM berkas menyentuh jaringan. Selain
 * menghemat kuota merchant, ini yang membuat halaman publik bisa memakai
 * <img> biasa dengan ukuran yang sudah pasti, tanpa optimisasi gambar berbayar.
 */

const KUALITAS_WEBP = 0.82;

function muatGambar(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gambar tidak bisa dibaca."));
    };
    img.src = url;
  });
}

function keBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Gagal mengubah gambar ke WebP.")),
      "image/webp",
      KUALITAS_WEBP,
    );
  });
}

export async function compressImage(
  file: File,
  { maxSide, square }: { maxSide: number; square: boolean },
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await muatGambar(file);

  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;

  if (square) {
    // Center-crop, bukan digepengkan: avatar selalu tampil dalam lingkaran,
    // jadi rasio yang salah langsung kelihatan.
    const sisi = Math.min(sw, sh);
    sx = (sw - sisi) / 2;
    sy = (sh - sisi) / 2;
    sw = sisi;
    sh = sisi;
  }

  const rasio = Math.min(1, maxSide / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * rasio));
  const height = Math.max(1, Math.round(sh * rasio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser tidak mendukung pemrosesan gambar.");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);

  return { blob: await keBlob(canvas), width, height };
}

/**
 * Mengambil bingkai detik ke-1 sebagai poster video, sekaligus melaporkan
 * durasi dan dimensinya. Merchant tidak perlu mengunggah thumbnail terpisah.
 *
 * Dipanggil SEBELUM videonya diunggah: durasinya cuma bisa dibaca dari sini,
 * dan memeriksanya setelah mengunggah 20MB berarti kuota merchant sudah
 * telanjur habis untuk berkas yang akan ditolak.
 */
export async function captureVideoPoster(
  file: File,
): Promise<{ blob: Blob; width: number; height: number; duration: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Video tidak bisa dibaca."));
      video.src = url;
    });

    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Video tidak bisa dibaca."));
      // Klip yang lebih pendek dari 1 detik tetap harus dapat poster.
      video.currentTime = Math.min(1, Math.max(0, video.duration - 0.1));
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Browser tidak mendukung pemrosesan video.");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return {
      blob: await keBlob(canvas),
      width: canvas.width,
      height: canvas.height,
      duration: video.duration,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
