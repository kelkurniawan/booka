import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL_IDENTITY } from "@/lib/legal";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Kebijakan Privasi",
  description: "Data apa yang dikumpulkan Booka, untuk apa, dan hak Anda atasnya.",
};

/**
 * Disusun mengacu UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.
 * Daftar data dan pemroses di bawah WAJIB ikut diperbarui setiap kali ada
 * kolom berisi data pribadi atau layanan pihak ketiga baru.
 */
export default function PrivacyPage() {
  const { operatorName, address, contactEmail } = LEGAL_IDENTITY;

  return (
    <LegalPage title="Kebijakan Privasi">
      <p>
        Booka diselenggarakan oleh {operatorName} ({address}). Kebijakan ini
        menjelaskan data pribadi apa yang kami proses, untuk apa, dengan siapa
        data itu dibagikan, dan hak Anda atasnya, sesuai Undang-Undang Nomor 27
        Tahun 2022 tentang Pelindungan Data Pribadi.
      </p>

      <h2>Dua peran kami</h2>
      <ul>
        <li>
          <strong>Untuk data merchant</strong> (pemilik usaha yang mendaftar di
          Booka), kami adalah <em>pengendali data</em>.
        </li>
        <li>
          <strong>Untuk data pelanggan merchant</strong> (orang yang memesan
          lewat halaman booking), merchant adalah pengendali datanya dan kami
          memprosesnya atas nama merchant, semata untuk menjalankan pemesanan.
        </li>
      </ul>

      <h2>Data yang kami kumpulkan</h2>
      <p>Dari merchant:</p>
      <ul>
        <li>Email dan kata sandi (disimpan dalam bentuk hash), atau identitas akun Google bila masuk lewat Google.</li>
        <li>Nama usaha, username, bio, nomor WhatsApp, foto profil, serta foto dan video layanan.</li>
        <li>Jawaban kuesioner opsional: bidang usaha, ukuran tim, provinsi, kanal pemesanan, dan kendala.</li>
        <li>Kredensial payment gateway (Server Key atau token), disimpan terenkripsi dan tidak pernah ditampilkan utuh.</li>
      </ul>
      <p>Dari pelanggan merchant:</p>
      <ul>
        <li>Nama dan nomor WhatsApp yang diisi saat memesan.</li>
        <li>Rincian pesanan: layanan, jadwal, nominal DP, dan status pembayaran.</li>
        <li>
          Alamat IP dalam bentuk hash satu arah, hanya untuk membatasi
          pemesanan berulang yang tidak wajar. IP mentah tidak kami simpan.
        </li>
      </ul>
      <p>
        Kami tidak pernah menerima atau menyimpan nomor kartu, rekening, atau
        PIN. Pembayaran diproses langsung oleh payment gateway milik merchant.
      </p>

      <h2>Untuk apa data dipakai</h2>
      <ul>
        <li>Menjalankan akun merchant dan halaman booking-nya.</li>
        <li>Membuat tagihan QRIS dan mencatat status pembayaran.</li>
        <li>Mengirim pemberitahuan pesanan dan pengingat jadwal lewat email atau WhatsApp.</li>
        <li>Menjaga keamanan layanan, mencegah penyalahgunaan, dan memperbaiki gangguan.</li>
        <li>Memahami kebutuhan merchant secara agregat untuk mengembangkan produk.</li>
      </ul>
      <p>Kami tidak menjual data pribadi dan tidak memakainya untuk iklan pihak ketiga.</p>

      <h2>Pihak yang memproses data bersama kami</h2>
      <ul>
        <li>Supabase: basis data, autentikasi, dan penyimpanan berkas (server di Singapura).</li>
        <li>Vercel: hosting aplikasi (server di Singapura).</li>
        <li>Midtrans atau Xendit: payment gateway yang dihubungkan merchant sendiri.</li>
        <li>Penyedia pengiriman email dan gateway WhatsApp untuk pemberitahuan.</li>
        <li>Layanan pemantauan error, yang menerima keterangan teknis saat terjadi gangguan.</li>
      </ul>
      <p>
        Sebagian pemroses berada di luar Indonesia. Kami hanya memakai pemroses
        yang menerapkan perlindungan data setara atau lebih tinggi dari yang
        disyaratkan UU PDP.
      </p>

      <h2>Berapa lama data disimpan</h2>
      <p>
        Data merchant disimpan selama akun aktif. Saat merchant menghapus
        akunnya dari halaman Pengaturan, seluruh data akun, layanan, jadwal,
        riwayat pesanan, dan berkas yang diunggah ikut dihapus permanen.
        Cadangan basis data otomatis terhapus sesuai siklus penyedia kami.
      </p>

      <h2>Hak Anda</h2>
      <ul>
        <li>Mengakses dan mendapatkan salinan data Anda.</li>
        <li>Memperbaiki data yang keliru.</li>
        <li>Menghapus data dan menarik persetujuan.</li>
        <li>Mengajukan keberatan atas pemrosesan tertentu.</li>
      </ul>
      <p>
        Merchant dapat mengunduh dan menghapus seluruh datanya sendiri dari
        halaman Pengaturan di dashboard. Pelanggan merchant dapat mengajukan
        permintaan kepada merchant tempat ia memesan, atau langsung kepada kami
        di {contactEmail}. Kami menanggapi paling lambat 3 x 24 jam sesuai UU PDP.
      </p>

      <h2>Keamanan</h2>
      <p>
        Koneksi selalu terenkripsi (HTTPS), kredensial payment gateway
        dienkripsi AES-256, dan akses ke data dibatasi per merchant di tingkat
        basis data. Bila terjadi kegagalan pelindungan data, kami memberi tahu
        pihak yang terdampak dan lembaga yang berwenang paling lambat 3 x 24 jam.
      </p>

      <h2>Cookie</h2>
      <p>
        Kami hanya memakai cookie yang diperlukan agar Anda tetap masuk ke
        dashboard. Halaman booking pelanggan tidak memasang cookie pelacak.
      </p>

      <h2>Perubahan dan kontak</h2>
      <p>
        Perubahan penting akan kami umumkan di dashboard sebelum berlaku.
        Pertanyaan tentang privasi dapat dikirim ke {contactEmail}. Lihat juga{" "}
        <Link href={ROUTES.terms} className="underline">
          Ketentuan Layanan
        </Link>
        .
      </p>
    </LegalPage>
  );
}
