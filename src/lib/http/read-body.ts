/**
 * Baca body request sebagai teks dengan batas ukuran yang ditegakkan SAAT
 * membaca, bukan sesudahnya. `request.text()` menampung seluruh body dulu,
 * jadi body chunked tanpa content-length tetap bisa menghabiskan memori.
 *
 * Mengembalikan null bila body melewati `maxBytes` atau gagal dibaca.
 */
export async function readBodyText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
