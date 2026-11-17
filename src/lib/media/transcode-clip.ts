import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ffmpegPath from "ffmpeg-static";

import { MEDIA_LIMITS } from "./limits";

/** Pesan galat yang aman ditampilkan ke merchant. */
export class ClipError extends Error {}

const TIMEOUT_MS = 45_000;
const FORMAT_WHITELIST = "gif,mov,mp4,m4a,3gp,3g2,mj2,matroska,webm";
const UNREADABLE = "Klip tidak bisa dibaca. Coba berkas lain.";
const FAILED = "Gagal memproses klip. Coba lagi.";

export function parseFfmpegDuration(stderr: string): number | null {
  const m = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

// Whitelist protokol dan format menutup playlist HLS/concat yang menyamar
// sebagai GIF lalu membaca berkas lokal atau jaringan.
const SAFE_INPUT = [
  "-hide_banner",
  "-nostdin",
  "-protocol_whitelist",
  "file",
  "-format_whitelist",
  FORMAT_WHITELIST,
  "-max_pixels",
  "16777216",
];

export function clipFfmpegArgs(inputPath: string, outputPath: string): string[] {
  return [
    ...SAFE_INPUT,
    "-i", inputPath,
    "-t", "5",
    "-map", "0:v:0",
    "-an", "-sn", "-dn",
    "-vf", "scale=480:480:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=24",
    "-c:v", "libx264",
    // Batasi utas encoder supaya beberapa permintaan bersamaan tidak menghabiskan CPU.
    "-threads", "2",
    "-preset", "veryfast",
    "-crf", "28",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-f", "mp4",
    "-y", outputPath,
  ];
}

export function posterFfmpegArgs(mp4Path: string, outputPath: string): string[] {
  return [
    ...SAFE_INPUT,
    "-i", mp4Path,
    "-frames:v", "1",
    "-q:v", "4",
    "-f", "image2",
    "-y", outputPath,
  ];
}

/** Menjalankan ffmpeg tanpa shell; mengembalikan stderr, melempar ClipError bila gagal. */
function runFfmpeg(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { timeout: TIMEOUT_MS, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      // shortcut: stderr dipotong di 64 KB; cukup untuk baris Duration.
      if (stderr.length < 65536) stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code !== 0 || signal) reject(new ClipError(UNREADABLE));
      else resolve(stderr);
    });
  });
}

export async function transcodeClip(input: Uint8Array): Promise<{
  mp4: Uint8Array;
  poster: Uint8Array;
  durationSeconds: number | null;
}> {
  if (!ffmpegPath) throw new Error("ffmpeg-static tidak menemukan binary ffmpeg");
  const dir = await mkdtemp(join(tmpdir(), "klip-"));
  try {
    const inPath = join(dir, "masuk");
    const mp4Path = join(dir, "keluar.mp4");
    const posterPath = join(dir, "poster.jpg");
    await writeFile(inPath, input);

    const stderr = await runFfmpeg(ffmpegPath, clipFfmpegArgs(inPath, mp4Path));
    const durationSeconds = parseFfmpegDuration(stderr);
    await runFfmpeg(ffmpegPath, posterFfmpegArgs(mp4Path, posterPath));

    const [mp4, poster] = await Promise.all([readFile(mp4Path), readFile(posterPath)]);
    if (mp4.length > MEDIA_LIMITS.clipMaxBytes) throw new ClipError(FAILED);
    return { mp4, poster, durationSeconds };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
