import "server-only";

import type { PaymentProvider } from "@/types/database";

/**
 * Penolakan DEFINITIF gateway pembayaran terhadap sebuah charge QRIS --
 * gateway MENJAWAB dan MENOLAK, bukan gangguan jaringan/timeout.
 *
 * Pembedaan ini penting: insiden produksi yang memicu kelas ini (koneksi
 * Midtrans SANDBOX ACTIVE dengan channel QRIS belum diaktifkan) membalas
 * `status_code 402` setiap kali, tidak akan pernah pulih sendiri --
 * mengulang percobaan tidak ada gunanya. Kegagalan jaringan sebaliknya
 * BISA pulih sendiri di percobaan berikutnya. Kode pemanggil (POST
 * /api/bookings) memakai pembedaan ini untuk (1) memutuskan apakah koneksi
 * `payment_connections` boleh ditandai bermasalah, dan (2) memilih pesan
 * yang jujur ke pelanggan -- lihat brief di
 * .superpowers/sdd/payment-charge-health/brief.md.
 *
 * Dilempar HANYA oleh adapter (src/lib/payments/midtrans.ts,
 * src/lib/payments/xendit.ts) saat:
 *   - HTTP non-2xx dari gateway, ATAU
 *   - (khusus Midtrans) `status_code` di body di luar 200/201 walau HTTP-nya
 *     200, ATAU
 *   - (khusus Midtrans) charge "sukses" tapi tidak membawa QR sama sekali.
 *
 * `providerMessage` HANYA berisi pesan yang SUDAH dirangkai adapter sendiri
 * dari field pesan gateway (mis. `status_message`/`message`) -- bukan body
 * respons mentah, header, maupun kredensial. Field ini yang boleh disimpan
 * ke `payment_connections.last_charge_error` dan ditampilkan ke merchant;
 * TIDAK PERNAH diteruskan ke pelanggan (lihat POST /api/bookings).
 */
export class ChargeRejectedError extends Error {
  readonly provider: PaymentProvider;
  readonly providerMessage: string;
  /** Kode status dari body respons provider, kalau providernya memberi satu. `null` kalau tidak ada. */
  readonly providerStatusCode: string | null;

  constructor(
    provider: PaymentProvider,
    /** Pesan lengkap untuk `.message`/log -- format sudah ditentukan pemanggil supaya tetap konsisten dengan pesan Error biasa yang digantikannya. */
    message: string,
    providerMessage: string,
    providerStatusCode: string | null = null,
  ) {
    super(message);
    this.name = "ChargeRejectedError";
    this.provider = provider;
    this.providerMessage = providerMessage;
    this.providerStatusCode = providerStatusCode;
  }
}
