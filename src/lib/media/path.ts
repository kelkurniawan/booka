/**
 * Aturan bentuk path berkas di bucket merchant-media.
 *
 * WAJIB sama persis dengan constraint `service_media_path_scoped`,
 * `service_media_poster_path_scoped`, dan
 * `merchant_themes_background_path_scoped` di migration
 * 20260821000100_harden_media_and_faqs.sql. Yang di database adalah yang
 * benar-benar mengikat; yang di sini ada supaya merchant mendapat pesan yang
 * bisa dibaca sebelum requestnya sampai ke Postgres.
 *
 * Charset sengaja sempit. `background_image_path` berakhir di dalam
 * `url("...")` pada CSS halaman publik, jadi kutip, kurung, dan koma harus
 * mustahil masuk -- tanpa itu, nilai seperti
 *   x.webp"), url("https://pihak-ketiga/beacon.png
 * menghasilkan daftar background-image yang sah dan halaman di domain kita
 * memuat URL pihak ketiga.
 */
const SEGMEN_AMAN = /^[A-Za-z0-9._/-]+$/;

export function isScopedMediaPath(path: string, merchantId: string): boolean {
  const awalan = `${merchantId}/`;
  if (!path.startsWith(awalan)) return false;

  const sisa = path.slice(awalan.length);
  if (sisa.length === 0) return false;
  if (!SEGMEN_AMAN.test(sisa)) return false;
  // Dicek pada path utuh, bukan cuma sisanya: '..' di mana pun berarti path
  // bisa memanjat keluar folder merchant saat URL-nya diresolusi browser.
  if (path.includes("..")) return false;

  return path.length <= 400;
}

export const PESAN_PATH_TIDAK_VALID =
  "Berkas tidak dikenali. Coba unggah ulang gambarnya.";
