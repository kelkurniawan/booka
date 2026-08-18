import type { PaymentProvider } from "@/types/database";

/**
 * Memilih koneksi payment yang dipakai untuk booking baru, dari daftar
 * koneksi ACTIVE milik satu merchant.
 *
 * Dipakai bersama oleh `POST /api/bookings` (menentukan provider charge) dan
 * halaman Pembayaran (menentukan badge "dipakai untuk booking baru") --
 * SATU tempat supaya kedua sisi tidak bisa diam-diam tidak sinkron.
 *
 * Aturan:
 *   1. Kalau merchant sudah pernah memilih provider eksplisit
 *      (`merchants.active_payment_provider`) DAN koneksi provider itu ada di
 *      antara `connections` (artinya statusnya ACTIVE -- pemanggil wajib
 *      sudah memfilter ke ACTIVE saja sebelum memanggil ini), pilih itu.
 *   2. Kalau tidak (belum pernah dipilih, atau koneksi yang ditunjuknya
 *      sudah tidak ACTIVE lagi), jatuh balik ke koneksi pertama dalam
 *      `connections` -- pemanggil wajib mengurutkannya `connected_at`
 *      ascending supaya hasilnya "paling lama tersambung", bukan sekadar
 *      baris pertama yang kebetulan dikembalikan Postgres.
 *
 * Fungsi ini sengaja tidak melakukan query/sort sendiri -- murni pemilihan
 * dari array yang sudah disiapkan pemanggil, supaya bisa dites tanpa
 * Supabase sama sekali.
 */
export function selectActiveConnection<T extends { provider: PaymentProvider }>(
  connectionsOrderedByConnectedAt: readonly T[],
  activeProvider: PaymentProvider | null,
): T | null {
  if (activeProvider) {
    const chosen = connectionsOrderedByConnectedAt.find(
      (connection) => connection.provider === activeProvider,
    );
    if (chosen) return chosen;
  }

  return connectionsOrderedByConnectedAt[0] ?? null;
}
