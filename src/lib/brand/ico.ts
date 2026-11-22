/**
 * Menyusun berkas .ico dari beberapa PNG (format ICO dengan entri PNG,
 * didukung semua browser modern). Dipakai scripts/brand-icons.ts.
 */
export function buildIco(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // dicadangkan
  header.writeUInt16LE(1, 2); // 1 = ikon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    // Lebar dan tinggi 1 byte; 0 berarti 256.
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0; // jumlah warna palet
    entry[3] = 0; // dicadangkan
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bit per piksel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}
