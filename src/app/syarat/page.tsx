import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL_IDENTITY } from "@/lib/legal";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Ketentuan Layanan",
  description: "Aturan pemakaian Booka bagi merchant dan pelanggannya.",
};

/**
 * Batas paket di bagian "Paket dan pembayaran" WAJIB sejalan dengan PLANS di
 * src/app/page.tsx dan src/app/dashboard/billing/page.tsx.
 */
export default function TermsPage() {
  const { operatorName, contactEmail } = LEGAL_IDENTITY;

  return (
    <LegalPage title="Ketentuan Layanan">
      <p>
        Ketentuan ini mengatur pemakaian Booka, layanan halaman booking dan
        penagihan DP yang diselenggarakan oleh {operatorName} (&quot;kami&quot;).
        Dengan mendaftar atau memakai Booka, Anda menyetujui ketentuan ini.
      </p>

      <h2>Layanan kami</h2>
      <p>
        Booka menyewakan sistem kepada pemilik usaha jasa (&quot;merchant&quot;)
        untuk menerima pemesanan dan DP lewat satu tautan. Booka{" "}
        <strong>tidak menampung dana</strong>: pembayaran pelanggan masuk
        langsung ke akun payment gateway milik merchant.
      </p>

      <h2>Akun merchant</h2>
      <ul>
        <li>Anda wajib memberikan data yang benar dan menjaga kerahasiaan kata sandi.</li>
        <li>Anda bertanggung jawab atas seluruh aktivitas yang terjadi di akun Anda.</li>
        <li>Satu akun mewakili satu usaha. Username tidak boleh meniru merek atau orang lain.</li>
      </ul>

      <h2>Pembayaran pelanggan</h2>
      <ul>
        <li>
          Merchant wajib memiliki akun payment gateway sendiri dan tunduk pada
          ketentuan penyedia tersebut.
        </li>
        <li>
          Pembatalan, pengembalian dana, dan sengketa layanan adalah urusan
          antara merchant dan pelanggannya. Kami membantu menyediakan catatan
          pesanan bila diperlukan.
        </li>
        <li>
          Pesanan yang tidak dibayar dalam batas waktu yang ditampilkan
          dibatalkan otomatis dan slotnya dibuka kembali.
        </li>
      </ul>

      <h2>Paket dan pembayaran langganan</h2>
      <ul>
        <li>Paket Starter gratis dengan batas 10 transaksi per bulan dan 1 jenis layanan.</li>
        <li>
          Paket berbayar ditagih per bulan sesuai harga yang tercantum saat
          berlangganan. Perubahan harga diumumkan paling lambat 30 hari sebelumnya.
        </li>
        <li>
          Bila langganan berakhir, akun turun ke paket Starter. Data tetap
          tersimpan, tetapi fitur dan tampilan di luar paket Starter berhenti
          berlaku.
        </li>
      </ul>

      <h2>Pemakaian yang dilarang</h2>
      <ul>
        <li>Menawarkan barang atau jasa yang melanggar hukum Indonesia.</li>
        <li>Menipu pelanggan, termasuk menerima DP untuk layanan yang tidak akan diberikan.</li>
        <li>Mengunggah konten yang melanggar hak cipta, SARA, pornografi, atau kekerasan.</li>
        <li>Mencoba membobol, membebani, atau mengakali batas sistem.</li>
      </ul>
      <p>
        Kami berhak menangguhkan atau menutup akun yang melanggar ketentuan ini,
        dengan pemberitahuan bila memungkinkan.
      </p>

      <h2>Konten merchant</h2>
      <p>
        Konten yang Anda unggah tetap milik Anda. Anda memberi kami izin
        terbatas untuk menyimpan dan menampilkannya di halaman booking Anda,
        semata untuk menjalankan layanan.
      </p>

      <h2>Ketersediaan dan batas tanggung jawab</h2>
      <p>
        Kami berupaya menjaga Booka tetap berjalan, tetapi layanan disediakan
        sebagaimana adanya dan bisa terganggu sewaktu-waktu, termasuk karena
        gangguan payment gateway atau penyedia infrastruktur. Sejauh diizinkan
        hukum, tanggung jawab kami terbatas pada biaya langganan yang Anda
        bayarkan dalam tiga bulan terakhir.
      </p>

      <h2>Mengakhiri layanan</h2>
      <p>
        Anda dapat menghapus akun kapan saja dari halaman Pengaturan. Data
        diperlakukan sesuai{" "}
        <Link href={ROUTES.privacy} className="underline">
          Kebijakan Privasi
        </Link>
        .
      </p>

      <h2>Hukum yang berlaku</h2>
      <p>
        Ketentuan ini tunduk pada hukum Republik Indonesia. Perselisihan
        diupayakan selesai secara musyawarah terlebih dahulu. Pertanyaan
        tentang ketentuan ini dapat dikirim ke {contactEmail}.
      </p>
    </LegalPage>
  );
}
