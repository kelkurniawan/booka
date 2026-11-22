// Membuat ulang semua ikon Marky dari satu sumber bentuk (src/lib/brand/mark.ts).
// Jalankan: npm run brand:icons. Hasilnya di-commit; jalankan lagi hanya bila
// bentuk atau warna logo berubah.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import sharp from "sharp";

import { buildIco } from "../src/lib/brand/ico";
import { INK_HEX, PAPER_HEX, markSvg } from "../src/lib/brand/mark";

const root = join(import.meta.dirname, "..");

async function png(svg: string, size: number): Promise<Buffer> {
  // density tinggi supaya tepi tetap tajam saat diperkecil ke 16 px.
  return sharp(Buffer.from(svg), { density: 1200 }).resize(size, size).png().toBuffer();
}

async function write(path: string, data: string | Buffer) {
  const full = join(root, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, data);
  console.log(`ditulis ${path}`);
}

const plain = markSvg({ color: INK_HEX });
const tile = markSvg({
  color: PAPER_HEX,
  tile: { background: INK_HEX, radius: 22, scale: 0.66 },
});

await write("src/app/icon.svg", `${markSvg({ adaptive: true })}\n`);
await write(
  "src/app/favicon.ico",
  buildIco(
    await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await png(plain, size) }))),
  ),
);
await write("src/app/apple-icon.png", await png(tile, 180));
await write("public/brand/marky-192.png", await png(tile, 192));
await write("public/brand/marky-512.png", await png(tile, 512));
await write("public/brand/marky-email.png", await png(plain, 64));
