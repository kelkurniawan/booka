/**
 * Id dari useId() memuat karakter seperti ":" atau "«»" yang tidak aman di
 * dalam url(#...). Setiap karakter selain huruf, angka, "_" dan "-" diganti
 * kode heksnya supaya dua id React yang berbeda tetap berbeda.
 */
export function maskIdFromReactId(reactId: string): string {
  const safe = [...reactId]
    .map((ch) => (/[A-Za-z0-9_-]/.test(ch) ? ch : `_${ch.codePointAt(0)!.toString(16)}`))
    .join("");
  return `marky-cap-${safe}`;
}

/** Label loader: tanpa label, "Memuat" hanya untuk pembaca layar. */
export function loaderLabel(label: string | undefined): { text: string; visible: boolean } {
  return label ? { text: label, visible: true } : { text: "Memuat", visible: false };
}
