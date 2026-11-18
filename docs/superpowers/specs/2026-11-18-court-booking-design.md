# Booking lapangan (padel, futsal, badminton, tenis)

Tanggal: 2026-11-18. Status: draf, menunggu persetujuan pemilik.

## Maksud dan alasan

Marky saat ini cocok untuk usaha jasa per orang (salon, klinik) dan restoran
(F8). Pemilik ingin memperluas ke tempat olahraga, terutama padel yang sedang
ramai, plus futsal, mini soccer, badminton, dan tenis. Pemilik lapangan sudah
terbiasa dengan aplikasi sewa lapangan, jadi versi tempelan (lapangan sebagai
"staf") ditolak: pemilik memilih pendekatan B, fitur lapangan yang lengkap.

Yang membedakan sewa lapangan dari layanan biasa:

1. Yang dipesan adalah **tempat** (Lapangan 1, Lapangan 2), bukan orang.
2. Pelanggan memilih **lama main** (1 jam, 1,5 jam, 2 jam), bukan durasi tetap.
3. **Harga per jam berbeda menurut jam dan hari** (jam ramai sore dan akhir
   pekan lebih mahal).
4. Pemilik ingin melihat **jadwal per jam untuk semua lapangan** sekaligus.

## Sasaran

- Merchant bisa mendaftarkan lapangan, mengaitkannya ke layanan sewa, dan
  menetapkan harga per jam plus aturan jam ramai per hari.
- Pelanggan memilih tanggal, lama main, jam mulai, dan lapangan (atau "Mana
  saja") di halaman publik, lalu membayar lewat alur bayar yang sudah ada
  (lunas, DP, bayar di tempat, permintaan).
- Harga yang ditampilkan selalu sama dengan harga yang ditagih.
- Satu lapangan tidak pernah terpesan dua kali di jam yang beririsan, termasuk
  saat dua pelanggan berebut slot terakhir.
- Dashboard punya tampilan jadwal harian: lapangan sebagai kolom, jam sebagai
  baris, dengan booking di dalamnya. Booking manual (telepon/walk-in) bisa
  memilih lapangan dan lama main.
- Onboarding punya kategori Olahraga dengan template layanan sewa lapangan.

## Bukan sasaran (versi ini)

- **Booking rutin mingguan** (tim langganan tiap Selasa 19.00). Diusulkan
  sebagai fase berikutnya, dimulai dari sisi merchant.
- **Bayar patungan per pemain** dan **membership/paket jam**. Keduanya butuh
  model pembayaran baru; ditunda sampai ada permintaan nyata.
- Jam buka per lapangan. Semua lapangan mengikuti jam kerja usaha; lapangan
  yang sedang diperbaiki dinonaktifkan atau diblok dengan booking manual.
- Lesson dengan pelatih (butuh staf DAN lapangan sekaligus).
- Harga per lapangan (lapangan indoor lebih mahal dari outdoor). Pakai dua
  layanan terpisah bila perlu: "Padel indoor" dan "Padel outdoor".

## Anti-sasaran

- Booking salon, klinik, atau restoran yang sudah berjalan berubah perilaku.
- Harga di halaman publik berbeda dengan `amount_due_now` di database.
- Lapangan terpesan ganda.

## Pendekatan yang dipertimbangkan

| | Pendekatan | Untung | Rugi |
|---|---|---|---|
| A | Lapangan sebagai baris `staff` | Cepat, 1-2 hari | Tidak bisa pilih lama main, tidak ada harga jam ramai, label "staf" janggal, staf terkunci di Studio |
| **B** | **Tabel `courts` sendiri + harga per jam + lama main pilihan** | Sesuai kebiasaan pemilik lapangan, bisa tumbuh ke booking rutin | Satu fase penuh, seukuran F8 |
| B' | B tetapi memakai tabel `staff` dengan kolom `kind` di belakang | Memakai ulang eksklusi per staf | Lapangan dan pelatih kelak tidak bisa dipesan bersamaan; kolom staf (klip, bio) tidak relevan |

Pemilik memilih **B**. B' ditolak karena lesson (pelatih + lapangan) kelak
butuh dua sumber daya terpisah dalam satu booking.

## Desain

### Data

**`courts`**: `id`, `merchant_id`, `name` (1-40 karakter), `sort_order`,
`is_active`, `created_at`. Unik `(merchant_id, name)`. Lapangan yang punya
riwayat booking dinonaktifkan, tidak dihapus (`bookings.court_id` memakai
`NO ACTION`, sama seperti staf di DECISIONS #28).

**`service_courts`**: `(service_id, court_id, merchant_id)`, kunci asing
gabungan dengan `merchant_id` supaya tidak bisa menyilang merchant. Tabel
penghubung, karena satu GOR serbaguna bisa dipakai futsal DAN badminton.
Bentrok dihitung per lapangan, jadi lapangan serbaguna otomatis terkunci untuk
kedua olahraga.

**Penanda layanan sewa** di `services`:

- `court_unit_minutes` (30 atau 60, null = bukan sewa lapangan). Jarak antar
  jam mulai dan kelipatan lama main.
- `duration_minutes` (kolom lama) = lama main minimum.
- `court_max_minutes` = lama main maksimum (kelipatan unit, maksimal 480).
- `price` (kolom lama) = **harga per jam dasar**.

Contoh padel: unit 30, minimum 60, maksimum 120 → pilihan 1 jam, 1,5 jam,
2 jam, jam mulai tiap 30 menit.

**`court_price_rules`**: `id`, `merchant_id`, `service_id`, `day_of_week`
(1-7), `start_time`, `end_time`, `price_per_hour`. Satu baris per hari; UI
mengedit chip hari sekaligus dan menyimpan lewat satu RPC atomik
`save_court_pricing`. Eksklusi `(service_id, day_of_week, rentang jam)`
mencegah aturan yang tumpang tindih. Jam di luar aturan memakai harga dasar.

**`bookings`**: tambah `court_id` (FK `NO ACTION`) dan snapshot `court_name`.
Booking lapangan tetap `capacity_mode = 'NONE'`; predikat `bookings_no_overlap`
ditambah `and court_id is null` (kalau tidak, semua booking lapangan tanpa
staf saling bentrok lewat UUID nol), dan constraint baru
`bookings_court_no_overlap` mengecualikan irisan per `court_id` untuk status
aktif yang sama. Sengaja tidak menambah nilai ke enum `table_mode`, karena
`seats_in_use` menghitung semua baris `capacity_mode <> 'NONE'`.

### Harga

Lama main dipecah per unit. Tiap unit dihargai dengan aturan yang aktif pada
**jam mulai unit itu** (hari dan jam Jakarta), atau harga dasar bila tidak ada
aturan. Total = jumlah `harga_per_jam × unit / 60`, dibulatkan ke rupiah.
Contoh: padel dasar Rp150.000, jam ramai Senin-Jumat 17.00-22.00 Rp250.000;
main 16.30-18.00 = 30 menit × 150rb + 60 menit × 250rb = Rp325.000.

SQL (`court_price`, dipanggil `create_booking`) adalah sumber kebenaran.
TypeScript `courtPrice()` mencerminkannya untuk tampilan dan diuji dengan
kasus yang sama di `99_verify.sql`, mengikuti pola `computeStaffSlots`
(DECISIONS #28). `bookings.service_price` menyimpan total itu, sehingga DP
persen/tetap, voucher, minimum Rp1.500, dan batas QRIS Rp10 juta berlaku
tanpa perubahan pada aturannya.

### Booking oleh pelanggan

`create_booking` mendapat dua parameter baru dengan default null:
`p_court_id` (null = "Mana saja") dan `p_duration_minutes`. Untuk layanan
sewa: validasi lama main (kelipatan unit, di antara minimum dan maksimum),
jam mulai di grid unit dan di dalam jam kerja, lalu di bawah advisory lock
merchant yang sudah ada pilih lapangan yang diminta atau lapangan aktif
pertama yang terkait dan kosong. Kode error baru: BK070 lapangan tidak
tersedia, BK071 lama main tidak valid, BK072 tidak ada lapangan kosong.
Untuk layanan bukan sewa, kedua parameter diabaikan dan perilaku lama tidak
berubah.

`anon` membaca ketersediaan lewat RPC `get_court_availability(merchant,
service, tanggal)` yang mengembalikan per lapangan: id, nama, dan rentang
terpakai saja, tanpa data pelanggan (pola `get_seat_availability`).
`/api/slots` mendapat cabang untuk layanan sewa.

Alur di halaman publik (`BookingFlow`, langkah 2), sketsa HP:

```
Sewa lapangan padel            mulai Rp150.000/jam
[ Sen 18 ][ Sel 19 ][ Rab 20 ] ...
Lama main   ( 1 jam ) ( 1,5 jam ) ( 2 jam )
Jam mulai
  16.00  Rp150.000  3 lapangan
  16.30  Rp200.000  3 lapangan
  17.00  Rp250.000  1 lapangan   ← jam ramai
  17.30  Penuh (dicoret)
Lapangan  ( Mana saja ) ( Lapangan 1 ) ( Lapangan 3 )
```

Harga di tiap jam adalah total untuk lama main yang dipilih. Jam penuh tampil
dicoret, bukan disembunyikan, supaya pelanggan paham polanya. Semua warna dan
ukuran lewat token tema (`themeToCssVars`), karena komponen ini juga tampil
di preview dashboard.

### Dashboard

- **`/dashboard/lapangan`**: daftar lapangan (tambah, ganti nama, urutkan,
  nonaktifkan) dan tampilan jadwal harian: lapangan sebagai kolom, jam
  sebagai baris, booking sebagai blok yang membuka panel detail (`?b=`) yang
  sudah ada. Di HP kolom bisa digeser horizontal.
- **Form layanan**: bagian "Sewa lapangan" (toggle, unit, minimum, maksimum,
  lapangan yang dipakai) dan editor jam ramai (chip hari + jam + harga).
- **Booking manual**: memilih lapangan dan lama main, harga dihitung
  otomatis.
- Daftar booking, detail, notifikasi, dan pengingat menampilkan nama lapangan
  seperti nama staf.

### Jadwal ulang

`reschedule_booking_by_merchant`, ubah jadwal oleh pelanggan, dan
`move_booking_slot` mempertahankan lapangan dan lama main. Bila lapangan itu
terisi di jam baru, pindah ke lapangan lain yang terkait dan kosong; bila
tidak ada, tolak (BK072). Harga **tidak** dihitung ulang, karena booking sudah
dibayar atau disepakati dengan harga lama.

### Onboarding dan landing

- Kategori baru `OLAHRAGA` (nilai enum `business_category` baru) dengan jenis
  Padel, Futsal, Mini soccer, Badminton, Tenis. Wizard membuat layanan sewa
  plus dua lapangan contoh ("Lapangan 1", "Lapangan 2") yang bisa diganti.
- Halaman `/untuk/lapangan` dari `industries.ts`.
- Panduan merchant (`src/lib/guide/content.ts`) untuk halaman Lapangan.

### Paket

Tidak dikunci paket, sama seperti restoran (DECISIONS #37). Selama masa awal
semuanya gratis.

## Batasan

- Semua aturan AGENTS.md: migration baru saja; `REVOKE ALL` lalu grant per
  kolom; fungsi baru tertutup kecuali di-`GRANT EXECUTE`; definer memakai
  `search_path = ''`; `database.ts` memakai `type`; UI dan komentar
  berbahasa Indonesia; segmen tingkat atas baru masuk `ROUTES` dan
  `reserved_usernames` (`lapangan` hanya di bawah `/dashboard`, jadi tidak
  perlu).
- Nilai enum baru dipasang di migration terpisah sebelum dipakai.
- Parameter baru `create_booking` ber-default null, supaya kode lama jalan
  selama jeda antara migration produksi dan deploy.
- Setiap perubahan skema diuji `npm run docker:test` dengan kasus baru di
  `99_verify.sql`: bentrok lapangan, rebutan "Mana saja", harga lintas jam
  ramai, lama main tidak valid, anon tidak bisa membaca data pelanggan.

## Keputusan dari pemeriksaan pembuat

Diputuskan pengendali (Claude), bukan pemilik; boleh dikoreksi:

1. **Staf dan lapangan tidak digabung.** Layanan sewa melewati penugasan staf
   sepenuhnya (`staff_id` null), juga untuk merchant yang punya staf.
2. **Restoran dan lapangan boleh di satu merchant**, tetapi tidak di satu
   layanan: CHECK `court_unit_minutes is null or seat_duration_minutes is
   null`. Di `create_booking`, cabang lapangan dicek sebelum cabang kursi.
3. **`create_booking` lama di-drop lalu dibuat ulang** dengan parameter
   tambahan, dalam satu migration, supaya tidak ada overload ganda yang
   membingungkan PostgREST. Pemanggil lama memakai parameter bernama, jadi
   tetap cocok lewat default null. `create_manual_booking` dan
   `move_booking_slot` ikut diperbarui di migration yang sama.
4. **`price` layanan sewa = harga per jam di semua tampilan merchant**:
   tabel layanan dan form manual memberi akhiran "/jam". Voucher
   `min_amount` dibandingkan dengan total booking hasil `court_price`.
   Analitik dan ekspor sudah membaca `bookings.service_price` (total), jadi
   tidak berubah.
5. **Aturan harga tidak melewati tengah malam** (`start_time < end_time`).
   Eksklusi aturan tumpang tindih per `(service_id, day_of_week)` dengan
   rentang jam.
6. **Seluruh lama main harus muat di jam kerja**, bukan hanya jam mulainya
   (`slot_within_hours` dengan jam mulai dan selesai).
7. **"Mana saja" memilih lapangan menurut `sort_order`, lalu nama.** Saat
   jadwal ulang pindah lapangan, notifikasi dan halaman pesanan memakai nama
   lapangan baru dari snapshot `court_name`.
8. **Tanpa "slot terdekat" untuk sewa di versi ini.** Ada fungsi murni
   `computeCourtSlots` di TypeScript untuk `/api/slots`, diuji unit, dan
   cerminnya diuji di `99_verify.sql`.
9. Nilai enum `OLAHRAGA` dipasang di migration terpisah. CHECK pada
   `merchant_profiles.business_category` di
   `20260830171027_nullable_business_category.sql` diperiksa ulang.

## Diserahkan ke pembuat

- Struktur komponen dan nama berkas UI.
- Cara grid dashboard digambar (CSS grid atau tabel), selama bisa digeser di
  HP dan memakai komponen shadcn yang ada.
- Isi template harga di onboarding (hanya `priceHint`, harga tetap keputusan
  merchant).
