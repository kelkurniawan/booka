import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL_IDENTITY } from "@/lib/legal";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Kebijakan Privasi",
  description: "Data apa yang dikumpulkan Marky, untuk apa, dan hak Anda atasnya.",
};

/**
 * Disusun mengacu UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.
 * Daftar data dan pemroses di bawah WAJIB ikut diperbarui setiap kali ada
 * kolom berisi data pribadi atau layanan pihak ketiga baru. Sumber setiap
 * klaim dicatat di .superpowers/sdd/legal-report.md.
 */
export default function PrivacyPage() {
  const { operatorName, address, contactEmail } = LEGAL_IDENTITY;

  return (
    <LegalPage title="Kebijakan Privasi">
      <p>
        Marky diselenggarakan oleh {operatorName}, seorang perorangan ({address}).
        Kebijakan ini menjelaskan data pribadi apa yang kami proses, untuk apa,
        dengan siapa data itu dibagikan, berapa lama disimpan, dan hak Anda
        atasnya. Kebijakan ini disusun mengacu Undang-Undang Nomor 27 Tahun 2022
        tentang Pelindungan Data Pribadi (UU PDP), dengan memperhatikan UU
        Informasi dan Transaksi Elektronik beserta perubahannya dan Peraturan
        Pemerintah Nomor 71 Tahun 2019.
      </p>

      <h2>Dua peran kami</h2>
      <ul>
        <li>
          <strong>Untuk data merchant</strong> (pemilik usaha yang mendaftar di
          Marky), kami adalah <em>pengendali data pribadi</em>.
        </li>
        <li>
          <strong>Untuk data pelanggan merchant</strong> (orang yang memesan
          lewat halaman booking) dan data staf yang diisi merchant, merchant
          adalah pengendali datanya. Kami adalah <em>prosesor data pribadi</em>{" "}
          yang memprosesnya atas nama merchant, semata untuk menjalankan
          pemesanan dan fitur yang dipakai merchant.
        </li>
      </ul>

      <h2>Data merchant yang kami kumpulkan</h2>
      <ul>
        <li>
          Akun: email dan kata sandi (disimpan dalam bentuk hash oleh penyedia
          autentikasi kami), atau email dan profil dasar akun Google bila Anda
          masuk lewat Google.
        </li>
        <li>
          Profil usaha: nama usaha, username, bio, nomor WhatsApp, foto profil,
          logo, foto sampul dan latar, kontak yang Anda pilih untuk ditampilkan
          (telepon, email, Instagram, Threads, X, TikTok), jam buka, dan teks
          kebijakan Anda. Nomor WhatsApp hanya tampil di halaman publik bila
          Anda mencentangnya.
        </li>
        <li>
          Layanan dan isinya: nama, harga, foto, video, FAQ, voucher, dan banner
          promosi.
        </li>
        <li>
          Sewa lapangan dan reservasi: profil lapangan (nama, jenis olahraga,
          dalam atau luar ruang), foto lapangan beserta teks alternatifnya,
          harga per jam, serta denah tempat atau denah meja.
        </li>
        <li>
          Profil staf yang Anda isi: nama, peran, perkenalan, keahlian, jam
          kerja, foto, dan klip. Klip mentah diubah menjadi video bisu
          maksimal 5 detik beserta gambar sampulnya, lalu berkas mentahnya
          dihapus.
        </li>
        <li>
          Tautan: tautan link-in-bio, tautan iklan per kanal, dan domain sendiri
          bila Anda memasangnya.
        </li>
        <li>
          ID pixel iklan (Meta, TikTok, Google Analytics 4) bila Anda
          memasangnya.
        </li>
        <li>
          Jawaban kuesioner opsional: bidang usaha, ukuran tim, provinsi, kanal
          pemesanan, kendala utama, dan dari mana Anda tahu Marky. Kuesioner ini
          boleh dilewati.
        </li>
        <li>
          Kredensial payment gateway (kunci atau token Midtrans atau Xendit),
          disimpan terenkripsi dan tidak pernah ditampilkan atau diekspor utuh.
        </li>
      </ul>

      <h2>Data pelanggan yang kami proses atas nama merchant</h2>
      <ul>
        <li>Nama dan nomor WhatsApp yang diisi saat memesan, serta catatan opsional.</li>
        <li>
          Rincian pesanan: layanan, jadwal, staf, lapangan atau meja, jumlah tamu,
          harga, DP, kode voucher dan potongannya, status pembayaran, jumlah
          ubah jadwal, serta waktu dan alasan pembatalan.
        </li>
        <li>
          Pilihan pengingat: kanal yang dipilih dan email bila Anda mengisinya
          untuk pengingat.
        </li>
        <li>
          Langganan notifikasi HP bila Anda mengaktifkannya, disimpan terenkripsi
          dan terikat ke satu booking.
        </li>
        <li>
          Kunjungan halaman booking: nomor sesi acak, langkah yang dibuka
          (halaman dilihat, layanan dipilih, mulai memesan, tautan diklik), dan
          asal kunjungan (tautan iklan, parameter UTM, dan nama situs perujuk
          tanpa alamat lengkapnya). Penjelasan di bagian Kunjungan dan atribusi.
        </li>
        <li>
          Alamat IP dalam bentuk hash satu arah, hanya untuk membatasi
          permintaan berulang yang tidak wajar. IP mentah tidak kami simpan.
        </li>
        <li>Catatan pengiriman pemberitahuan per booking (kanal, jenis, dan status kirim).</li>
      </ul>

      <h2>Data yang tidak kami terima</h2>
      <p>
        Kami tidak pernah menerima atau menyimpan nomor kartu, nomor rekening,
        atau PIN. Pembayaran diproses oleh payment gateway milik merchant. Untuk
        membuat tagihan QRIS, Marky hanya mengirim nomor pesanan dan nominal ke
        payment gateway, lalu menerima status pembayarannya.
      </p>

      <h2>Untuk apa data dipakai dan dasar hukumnya</h2>
      <ul>
        <li>
          Menjalankan akun merchant, halaman booking, kalender, dan pesanan.
          Dasarnya pemenuhan perjanjian, yaitu Ketentuan Layanan dengan merchant
          dan pemesanan antara pelanggan dan merchant.
        </li>
        <li>
          Membuat tagihan QRIS dan mencatat status pembayaran. Dasarnya
          pemenuhan perjanjian.
        </li>
        <li>
          Mengirim pemberitahuan pesanan dan pengingat jadwal lewat WhatsApp,
          email, atau notifikasi HP. Pemberitahuan pesanan dasarnya pemenuhan
          perjanjian. Notifikasi HP dan email pengingat dasarnya persetujuan
          Anda, dan dapat dimatikan kapan saja.
        </li>
        <li>
          Menampilkan laporan kunjungan dan asal pelanggan kepada merchant.
          Dasarnya kepentingan yang sah merchant untuk mengukur pemasarannya.
        </li>
        <li>
          Menjaga keamanan, mencegah penyalahgunaan, dan memperbaiki gangguan.
          Dasarnya kepentingan yang sah.
        </li>
        <li>
          Memahami kebutuhan merchant secara agregat dari kuesioner opsional
          untuk mengembangkan produk. Dasarnya persetujuan, karena kuesioner
          boleh dilewati.
        </li>
        <li>Memenuhi kewajiban hukum bila diminta pihak berwenang sesuai peraturan.</li>
      </ul>
      <p>Kami tidak menjual data pribadi dan tidak memakainya untuk iklan kami sendiri.</p>

      <h2>Keputusan otomatis</h2>
      <p>
        Beberapa hal berjalan otomatis: pesanan yang tidak dibayar sampai batas
        waktunya dibatalkan, permintaan berulang yang tidak wajar ditolak
        sementara, dan aturan yang dipilih merchant di Pengaturan, misalnya
        batas booking aktif per nomor WhatsApp atau kewajiban bayar di muka bagi
        nomor yang pernah tidak datang. Kami tidak membuat profil pelanggan
        untuk tujuan lain. Bila Anda keberatan atas hasil keputusan otomatis,
        hubungi merchant terkait atau kami supaya ditinjau oleh manusia.
      </p>

      <h2>Pihak yang memproses data bersama kami</h2>
      <ul>
        <li>Supabase: basis data, autentikasi, dan penyimpanan berkas, di region Singapura.</li>
        <li>Vercel: hosting aplikasi, di region Singapura. Domain sendiri merchant didaftarkan lewat Vercel.</li>
        <li>Google: hanya bila merchant memilih masuk lewat akun Google.</li>
        <li>Midtrans atau Xendit: payment gateway yang dihubungkan merchant sendiri.</li>
        <li>Resend: pengiriman email pemberitahuan dan email akun.</li>
        <li>
          Gateway WhatsApp: server WAHA atau Evolution API yang kami jalankan
          sendiri, atau layanan Fonnte, untuk pesan WhatsApp.
        </li>
        <li>
          Layanan push milik peramban (misalnya Google, Apple, atau Mozilla),
          hanya bila pelanggan mengaktifkan notifikasi HP. Isinya hanya teks
          pengingat dan alamat halaman di Marky.
        </li>
        <li>
          Sentry: pemantauan error. Sentry hanya menerima keterangan teknis saat
          terjadi gangguan. Token pesanan, nomor telepon, dan email disensor
          lebih dulu, dan tidak ada rekaman layar.
        </li>
      </ul>

      <h2>Transfer data ke luar Indonesia</h2>
      <p>
        Sebagian pemroses di atas menyimpan atau memproses data di luar
        Indonesia. Basis data dan hosting kami berada di Singapura, sedangkan
        penyedia lain dapat memproses data di negara tempat servernya berada.
        Sesuai Pasal 56 UU PDP, kami hanya memakai penyedia yang menerapkan
        pelindungan data yang memadai, dan membatasi data yang dikirim ke
        masing-masing penyedia sebatas yang diperlukan untuk fungsinya.
      </p>

      <h2>Kunjungan dan atribusi</h2>
      <p>
        Marky mencatat kunjungan ke halaman booking merchant tanpa cookie. Satu
        kunjungan hanya dikenali lewat nomor sesi acak yang tersimpan di tab
        peramban dan hilang saat tab ditutup. Catatan ini dipakai merchant untuk
        melihat dari tautan atau iklan mana pelanggan datang dan di langkah mana
        mereka berhenti. Bila pelanggan jadi memesan, asal kunjungan itu ikut
        tercatat di pesanannya.
      </p>

      <h2>Pixel iklan milik merchant</h2>
      <p>
        Merchant boleh memasang pixel Meta, TikTok, atau Google Analytics 4 di
        halaman booking dan halaman terima kasihnya. Untuk pixel ini, merchant
        adalah pengendali datanya dan bertanggung jawab atas pemakaiannya. Bila
        dipasang, platform itu menerima jenis kejadian (misalnya halaman
        dilihat, layanan dipilih, booking dibuat, pembayaran berhasil), nama
        layanan, dan nilainya, dan dapat memakai cookie miliknya sendiri menurut
        kebijakan platform tersebut.
      </p>
      <p>
        Marky tidak mengirim nama, nomor WhatsApp, atau email pelanggan ke
        platform iklan. Namun skrip platform dapat membaca isian formulir bila
        pengaturan pencocokan otomatis (Automatic Advanced Matching) aktif di
        akun iklan merchant. Pixel tidak pernah dimuat di halaman pesanan
        pelanggan maupun dashboard. Merchant mengatur dan dapat mematikan pixel
        kapan saja di menu Iklan, tab Pixel.
      </p>

      <h2>Cookie dan penyimpanan di peramban</h2>
      <p>
        Kami hanya memakai cookie yang diperlukan agar merchant tetap masuk ke
        dashboard. Di halaman booking, Marky sendiri tidak memasang cookie dan
        hanya memakai penyimpanan sesi tab untuk nomor sesi dan asal kunjungan.
        Pixel pilihan merchant dijelaskan di bagian sebelumnya.
      </p>

      <h2>Berapa lama data disimpan</h2>
      <ul>
        <li>
          Pesanan yang tidak dibayar sampai batas waktunya dibatalkan otomatis.
          Catatannya tetap ada di riwayat merchant sebagai pesanan batal.
        </li>
        <li>Catatan kunjungan halaman booking dihapus otomatis setelah 13 bulan.</li>
        <li>
          Hash IP untuk pembatasan permintaan dihapus otomatis pada pengecekan
          berikutnya setelah berumur lebih dari satu jam, atau sepuluh menit
          untuk cek ketersediaan username.
        </li>
        <li>
          Langganan notifikasi HP dihapus otomatis bila pesanannya batal, sehari
          setelah jadwalnya lewat, atau bila ditolak layanan push.
        </li>
        <li>Klip staf mentah dihapus setelah diproses.</li>
        <li>
          Data lain, termasuk akun, layanan, pesanan, data pelanggan, dan
          catatan pengiriman pemberitahuan, disimpan selama akun merchant aktif.
        </li>
        <li>
          Saat merchant menghapus akunnya dari halaman Pengaturan, seluruh data
          akun, layanan, jadwal, riwayat pesanan, data pelanggan, dan berkas
          yang diunggah ikut dihapus permanen. Cadangan basis data terhapus
          sesuai siklus penyedia kami.
        </li>
      </ul>

      <h2>Hak Anda</h2>
      <p>Sesuai Pasal 5 sampai Pasal 13 UU PDP, Anda berhak:</p>
      <ul>
        <li>
          <strong>Mendapat informasi</strong> tentang siapa yang memproses data
          Anda, untuk apa, dan dasar hukumnya. Kebijakan ini adalah informasinya.
        </li>
        <li>
          <strong>Melengkapi, memperbarui, dan memperbaiki</strong> data yang
          keliru. Merchant dapat mengubah datanya sendiri di dashboard.
        </li>
        <li>
          <strong>Mengakses dan mendapat salinan</strong> data Anda. Merchant
          dapat mengunduh salinan data akun, layanan, dan pesanannya di
          Pengaturan, bagian Unduh data Anda.
          Pelanggan dapat melihat pesanannya lewat tautan status pesanan.
        </li>
        <li>
          <strong>Mengakhiri pemrosesan, menghapus, dan memusnahkan</strong>{" "}
          data Anda. Merchant dapat menghapus akunnya di Pengaturan, bagian
          Hapus akun.
        </li>
        <li>
          <strong>Menarik persetujuan</strong> yang pernah diberikan, misalnya
          mematikan notifikasi HP atau pengingat dari halaman status pesanan.
        </li>
        <li>
          <strong>Mengajukan keberatan</strong> atas keputusan yang hanya
          didasarkan pada pemrosesan otomatis.
        </li>
        <li>
          <strong>Menunda atau membatasi</strong> pemrosesan data Anda.
        </li>
        <li>
          <strong>Menggugat dan menerima ganti rugi</strong> atas pelanggaran
          pemrosesan data Anda sesuai peraturan.
        </li>
        <li>
          <strong>Memindahkan data</strong> ke pihak lain. Berkas Unduh data
          Anda berformat JSON yang dapat dibaca sistem lain.
        </li>
      </ul>

      <h2>Cara mengajukan permintaan</h2>
      <p>
        Merchant dapat memakai alat di dashboard di atas, atau mengirim
        permintaan ke {contactEmail}.
      </p>
      <p>
        Pelanggan merchant sebaiknya menghubungi merchant tempat ia memesan,
        karena merchant adalah pengendali datanya. Kontak merchant tersedia di
        halaman status pesanan. Pelanggan juga dapat menulis langsung ke{" "}
        {contactEmail}. Kami akan meneruskannya ke merchant terkait dan
        membantu merchant menjalankannya.
      </p>
      <p>
        Untuk permintaan yang oleh UU PDP diberi batas waktu, misalnya
        perbaikan data, akses dan salinan, penarikan persetujuan, serta
        penundaan atau pembatasan pemrosesan, kami menanggapi paling lambat 3 x
        24 jam sejak permintaan kami terima. Permintaan lain kami tangani tanpa
        penundaan. Kami dapat meminta keterangan untuk memastikan permintaan
        benar berasal dari pemilik data.
      </p>

      <h2>Keamanan</h2>
      <ul>
        <li>Koneksi ke Marky selalu terenkripsi (HTTPS).</li>
        <li>
          Akses data dibatasi per merchant di tingkat basis data (row level
          security). Pengunjung halaman publik tidak dapat membaca data
          pelanggan lain.
        </li>
        <li>
          Kredensial payment gateway dienkripsi AES-256-GCM dan disimpan terpisah
          dari data lain.
        </li>
        <li>
          Halaman status pesanan dibuka lewat tautan berisi token acak yang
          sulit ditebak, dan halaman itu tidak mengirim alamatnya ke situs lain
          (no-referrer).
        </li>
      </ul>
      <p>
        Tidak ada sistem yang sepenuhnya kebal. Kami tidak mengklaim sertifikasi
        keamanan apa pun.
      </p>

      <h2>Bila terjadi kegagalan pelindungan data</h2>
      <p>
        Bila terjadi kegagalan pelindungan data pribadi, kami memberi tahu
        secara tertulis kepada pemilik data yang terdampak dan lembaga yang
        berwenang paling lambat 3 x 24 jam, sesuai Pasal 46 UU PDP. Untuk data
        pelanggan, kami juga segera memberi tahu merchant terkait.
        Pemberitahuan memuat data yang terungkap, kapan dan bagaimana terjadi,
        serta langkah penanganan dan pemulihannya.
      </p>

      <h2>Data anak</h2>
      <p>
        Marky tidak ditujukan untuk anak, dan akun merchant hanya untuk orang
        dewasa. Merchant yang melayani anak, misalnya kelas atau les,
        bertanggung jawab memastikan pemesanan dilakukan atau disetujui orang
        tua atau walinya. Bila Anda mengetahui data anak terkirim tanpa
        persetujuan itu, hubungi kami di {contactEmail}.
      </p>

      <h2>Perubahan dan kontak</h2>
      <p>
        Perubahan penting akan kami umumkan di dashboard sebelum berlaku, dan
        tanggal berlaku di atas ikut diperbarui. Pertanyaan tentang privasi
        dapat dikirim ke {contactEmail}. Lihat juga{" "}
        <Link href={ROUTES.terms} className="underline">
          Ketentuan Layanan
        </Link>
        .
      </p>
    </LegalPage>
  );
}
