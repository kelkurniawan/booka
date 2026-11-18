import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL_IDENTITY } from "@/lib/legal";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Ketentuan Layanan",
  description: "Aturan pemakaian Marky bagi merchant dan pelanggannya.",
};

/**
 * Bagian "Masa awal gratis dan paket" WAJIB sejalan dengan EARLY_ACCESS_FREE
 * dan PLANS di src/lib/plans.ts (DECISIONS #40). Setiap klaim faktual di sini
 * dicatat sumbernya di .superpowers/sdd/legal-report.md.
 */
export default function TermsPage() {
  const { operatorName, contactEmail } = LEGAL_IDENTITY;

  return (
    <LegalPage title="Ketentuan Layanan">
      <p>
        Ketentuan ini mengatur pemakaian Marky, layanan halaman booking dan
        penagihan untuk usaha jasa. Marky adalah proyek pribadi yang
        diselenggarakan oleh {operatorName}, seorang perorangan
        (&quot;kami&quot;), bukan oleh perusahaan atau badan usaha.
      </p>

      <h2>Istilah yang dipakai</h2>
      <ul>
        <li>
          <strong>Marky</strong> atau <strong>layanan</strong>: situs, dashboard,
          halaman booking, dan fitur lain yang kami sediakan.
        </li>
        <li>
          <strong>Merchant</strong>: pemilik usaha yang mendaftar dan memakai
          Marky untuk menerima pesanan.
        </li>
        <li>
          <strong>Pelanggan</strong>: orang yang memesan layanan merchant lewat
          halaman booking.
        </li>
        <li>
          <strong>Halaman booking</strong>: halaman publik merchant di Marky,
          termasuk halaman status pesanan yang dibuka pelanggan lewat tautan
          pribadinya.
        </li>
        <li>
          <strong>Payment gateway</strong>: penyedia pembayaran pihak ketiga
          (saat ini Midtrans atau Xendit) yang akunnya dimiliki merchant
          sendiri.
        </li>
        <li>
          <strong>Konten</strong>: teks, foto, video, logo, dan materi lain yang
          diunggah atau diisi merchant.
        </li>
      </ul>

      <h2>Menerima ketentuan ini</h2>
      <p>
        Dengan mendaftar, masuk, atau memakai Marky, Anda menyetujui ketentuan
        ini dan{" "}
        <Link href={ROUTES.privacy} className="underline">
          Kebijakan Privasi
        </Link>
        . Bila Anda tidak setuju, mohon jangan memakai Marky.
      </p>

      <h2>Siapa yang boleh memakai Marky</h2>
      <ul>
        <li>
          Merchant harus berusia minimal 18 tahun atau sudah cakap hukum menurut
          hukum Indonesia.
        </li>
        <li>
          Bila Anda mendaftar atas nama usaha milik orang lain, Anda menyatakan
          berwenang bertindak untuk usaha itu.
        </li>
        <li>
          Marky tidak ditujukan untuk anak. Pelanggan yang belum dewasa sebaiknya
          memesan dengan sepengetahuan orang tua atau walinya.
        </li>
      </ul>

      <h2>Layanan kami</h2>
      <p>
        Marky menyediakan halaman booking, kalender, pengelolaan layanan, dan
        pemberitahuan pesanan bagi merchant. Kami menyediakan alatnya. Kami
        tidak menjual jasa merchant, tidak menetapkan harganya, dan tidak menjadi
        pihak dalam transaksi antara merchant dan pelanggannya.
      </p>

      <h2>Masa awal gratis dan paket</h2>
      <ul>
        <li>
          Saat ini Marky berada dalam masa awal (early access). Selama masa ini,
          seluruh fitur dapat dipakai gratis oleh semua merchant.
        </li>
        <li>
          Daftar paket (Starter, Pro, dan Studio) beserta batas fiturnya, seperti
          batas transaksi per bulan dan jumlah layanan di paket Starter, sudah
          ada di produk tetapi belum diberlakukan. Batas itu dapat mulai berlaku
          nanti.
        </li>
        <li>
          Bila kami mulai menagih, kami memberi tahu Anda paling lambat 30 hari
          sebelumnya lewat dashboard atau email. Tidak ada biaya yang ditagih
          tanpa persetujuan tegas dari Anda.
        </li>
        <li>
          Bila Anda tidak memilih paket berbayar, akun Anda tetap ada. Data
          tetap tersimpan, tetapi fitur di luar paket gratis dapat berhenti
          berlaku.
        </li>
      </ul>

      <h2>Akun merchant</h2>
      <ul>
        <li>Berikan data yang benar dan perbarui bila berubah.</li>
        <li>
          Jaga kerahasiaan kata sandi dan akses email Anda. Anda bertanggung
          jawab atas aktivitas yang terjadi di akun Anda.
        </li>
        <li>
          Satu akun mewakili satu usaha. Username tidak boleh meniru merek, usaha,
          atau orang lain.
        </li>
        <li>
          Bila Anda mengisi data orang lain, misalnya profil staf beserta foto
          atau klipnya, Anda wajib sudah mendapat izin dari orang tersebut.
        </li>
        <li>
          Segera hubungi kami bila Anda menduga akun Anda dipakai orang lain.
        </li>
      </ul>

      <h2>Tanggung jawab merchant kepada pelanggannya</h2>
      <p>
        Merchant adalah penyedia jasa bagi pelanggannya dan bertanggung jawab
        penuh atas:
      </p>
      <ul>
        <li>Layanan yang ditawarkan, mutunya, dan kesesuaiannya dengan deskripsi.</li>
        <li>Harga, DP, diskon, dan voucher yang dipasang.</li>
        <li>
          Kebijakan pembatalan dan ubah jadwal yang diatur di Pengaturan, serta
          menepatinya.
        </li>
        <li>
          Pengembalian dana. Membatalkan booking di Marky tidak mengembalikan
          dana secara otomatis. Bila perlu refund, merchant melakukannya sendiri
          lewat payment gateway miliknya.
        </li>
        <li>Pajak dan izin usaha yang berlaku bagi usahanya.</li>
        <li>
          Data pribadi pelanggannya. Merchant adalah pengendali data pelanggan,
          seperti dijelaskan di Kebijakan Privasi.
        </li>
        <li>
          Pixel iklan yang dipasangnya, termasuk memberi tahu pelanggannya bila
          diperlukan.
        </li>
      </ul>
      <p>
        Keluhan atas layanan merchant diselesaikan antara merchant dan
        pelanggannya. Kami dapat membantu menyediakan catatan pesanan bila
        diperlukan.
      </p>

      <h2>Alur pembayaran</h2>
      <ul>
        <li>
          Marky <strong>tidak menampung dana</strong>. Pembayaran pelanggan, baik
          DP maupun pelunasan, masuk langsung ke akun payment gateway milik
          merchant.
        </li>
        <li>
          Merchant yang menerima pembayaran online wajib memiliki akun payment
          gateway sendiri dan tunduk pada ketentuan penyedia tersebut. Biaya dari
          penyedia itu menjadi urusan merchant dengan penyedianya.
        </li>
        <li>
          Merchant juga dapat memilih bayar di tempat atau ajukan dulu untuk
          layanannya. Pembayaran di tempat terjadi di luar Marky.
        </li>
        <li>
          Pesanan yang harus dibayar online tetapi tidak dibayar dalam batas
          waktu yang ditampilkan dibatalkan otomatis, dan jadwalnya dibuka
          kembali.
        </li>
      </ul>

      <h2>Bagi pelanggan</h2>
      <ul>
        <li>
          Isi nama dan nomor WhatsApp yang benar supaya merchant dapat
          menghubungi Anda.
        </li>
        <li>
          Tautan status pesanan bersifat pribadi. Siapa pun yang memegang tautan
          itu dapat melihat pesanan Anda, jadi jangan membagikannya.
        </li>
        <li>
          Ubah jadwal dan pembatalan hanya bisa dilakukan sendiri bila merchant
          mengizinkannya, dalam batas waktu dan jumlah yang ditetapkan merchant.
        </li>
        <li>
          Untuk sewa lapangan, Anda tidak dapat memindahkan sendiri booking ke
          jam yang harganya lebih tinggi dari harga yang tercatat di booking
          Anda. Untuk itu, hubungi merchant.
        </li>
      </ul>

      <h2>Pemakaian yang dilarang</h2>
      <ul>
        <li>Menawarkan barang atau jasa yang melanggar hukum Indonesia.</li>
        <li>
          Menipu pelanggan, termasuk menerima DP untuk layanan yang tidak akan
          diberikan.
        </li>
        <li>
          Mengunggah konten yang melanggar hak cipta atau hak orang lain, atau
          bermuatan SARA, pornografi, perjudian, atau kekerasan.
        </li>
        <li>Memakai Marky untuk mengirim spam atau pesan promosi massal.</li>
        <li>
          Mencoba membobol, membebani, menyalin data pengguna lain, atau
          mengakali batas sistem.
        </li>
      </ul>

      <h2>Konten merchant</h2>
      <p>
        Konten yang Anda unggah tetap milik Anda. Anda memberi kami izin
        terbatas, tanpa biaya, untuk menyimpan, memproses (misalnya mengubah
        klip staf menjadi video pendek), dan menampilkan
        konten itu di halaman booking Anda, semata untuk menjalankan layanan.
        Izin ini berakhir saat konten atau akun Anda dihapus. Anda menjamin
        berhak memakai konten tersebut.
      </p>

      <h2>Hak kekayaan intelektual</h2>
      <p>
        Nama Marky, tampilan, kode, dan materi yang kami buat tetap milik kami.
        Anda boleh memakainya sebatas untuk memakai layanan. Anda tidak boleh
        menyalin, menjual kembali, atau membuat turunan dari Marky tanpa izin
        tertulis.
      </p>

      <h2>Ketersediaan layanan</h2>
      <p>
        Marky masih dalam masa awal dan disediakan sebagaimana adanya. Fitur
        dapat berubah, ditambah, atau dihentikan, dan sebagian fitur masih
        bersifat percobaan (beta). Kami berupaya menjaga Marky tetap berjalan,
        tetapi layanan bisa terganggu, termasuk karena gangguan payment gateway,
        gateway WhatsApp, atau penyedia infrastruktur. Pemberitahuan lewat
        WhatsApp, email, atau notifikasi HP tidak dijamin selalu terkirim.
        Simpan catatan penting usaha Anda sendiri, misalnya lewat fitur Unduh
        data Anda di Pengaturan.
      </p>

      <h2>Batas tanggung jawab</h2>
      <p>
        Sejauh diizinkan hukum, kami tidak bertanggung jawab atas kerugian tidak
        langsung, seperti hilangnya keuntungan atau peluang usaha, yang timbul
        dari pemakaian Marky. Kami juga tidak bertanggung jawab atas tindakan
        merchant, pelanggan, payment gateway, atau platform pihak ketiga.
      </p>
      <p>
        Batasan ini tidak menghapus tanggung jawab kami atas kerugian yang
        disebabkan oleh kesengajaan atau kelalaian berat kami, dan tidak
        mengurangi hak yang dijamin peraturan perundang-undangan, termasuk
        Undang-Undang Perlindungan Konsumen.
      </p>

      <h2>Penangguhan dan pengakhiran</h2>
      <ul>
        <li>
          Anda dapat berhenti kapan saja dan menghapus akun dari halaman
          Pengaturan. Penghapusan baru bisa dilakukan setelah tidak ada booking
          yang masih berjalan atau menunggu pembayaran.
        </li>
        <li>
          Kami dapat menangguhkan atau menutup akun yang melanggar ketentuan
          ini, membahayakan pelanggan, atau membahayakan sistem. Bila
          memungkinkan, kami memberi tahu Anda lebih dulu beserta alasannya.
        </li>
        <li>
          Bila kami menghentikan Marky seluruhnya, kami memberi tahu Anda lebih
          dulu dalam waktu yang wajar supaya Anda sempat mengunduh data Anda.
        </li>
        <li>
          Setelah akun dihapus, data diperlakukan sesuai Kebijakan Privasi.
        </li>
      </ul>

      <h2>Perubahan ketentuan</h2>
      <p>
        Kami dapat mengubah ketentuan ini. Perubahan penting kami umumkan lewat
        dashboard atau email sebelum berlaku, dan tanggal berlaku di atas ikut
        diperbarui. Bila Anda terus memakai Marky setelah perubahan berlaku,
        Anda dianggap menyetujuinya. Bila tidak setuju, Anda dapat menghapus
        akun.
      </p>

      <h2>Hukum yang berlaku dan penyelesaian sengketa</h2>
      <p>
        Ketentuan ini tunduk pada hukum Republik Indonesia. Bila ada
        perselisihan, kita upayakan dulu penyelesaian secara musyawarah. Bila
        musyawarah tidak berhasil, perselisihan diselesaikan menurut hukum
        Indonesia di pengadilan Indonesia yang berwenang.
      </p>

      <h2>Kontak</h2>
      <p>
        Pertanyaan, keluhan, atau laporan pelanggaran dapat dikirim ke{" "}
        {contactEmail}.
      </p>
    </LegalPage>
  );
}
