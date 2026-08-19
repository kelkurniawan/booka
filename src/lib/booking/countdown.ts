/**
 * Format sisa waktu (ms) jadi label mm:ss untuk hitung mundur pembayaran di
 * src/app/pesanan/[token]/booking-live-status.tsx.
 *
 * Diekstrak ke sini (dari komponen client-nya) supaya bisa diuji sebagai
 * fungsi murni tanpa perlu me-render komponen React.
 *
 * `remainingMs` negatif (tenggat sudah lewat) DI-CLAMP ke 0 di sini juga --
 * bukan cuma mengandalkan pemanggilnya selalu mengirim nilai yang sudah
 * di-clamp -- supaya fungsi ini aman dipanggil langsung dengan input apa
 * pun tanpa pernah menghasilkan label aneh seperti "-1:-1".
 */
export function formatCountdown(remainingMs: number): string {
  const clampedMs = Math.max(remainingMs, 0);
  const totalSeconds = Math.floor(clampedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
