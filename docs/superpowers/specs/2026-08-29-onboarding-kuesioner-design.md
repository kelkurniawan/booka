# Kuesioner Onboarding Interaktif

**Tanggal:** 2026-08-29
**Status:** Disetujui, siap direncanakan
**Ruang lingkup:** `/onboarding` (dijadikan wizard), tabel baru `merchant_profiles`,
RPC `complete_onboarding`, kartu `ProfileNudge` di `/dashboard`

## 1. Masalah

Onboarding sekarang satu kartu berisi tiga isian — nama usaha, username, WhatsApp —
lalu merchant dilempar ke dashboard yang menyambutnya dengan peringatan bahwa
halaman bookingnya belum siap menerima pesanan (`src/app/dashboard/setup-alerts.tsx`).
Merchant baru mendarat di kekosongan dan harus menebak sendiri harus mulai dari mana.

Di sisi lain, Booka tidak tahu apa pun tentang siapa yang memakainya. Tidak ada
data jenis usaha, ukuran usaha, sebaran wilayah, maupun masalah yang sebenarnya
ingin diselesaikan merchant. Keputusan produk dan penargetan paket berjalan tanpa
dasar.

## 2. Hasil yang diinginkan

Merchant baru menyelesaikan onboarding dengan halaman booking yang **sudah bisa
menerima pesanan** — sudah punya satu layanan dan jam kerja — dan merasa Booka
mengerti jenis usahanya. Booka mendapat klasifikasi bisnis dan demografi
penggunanya sebagai efek samping dari proses yang memang menguntungkan merchant,
bukan sebagai pajak yang dibayar merchant di depan.

## 3. Prinsip yang mengikat

**Setiap pertanyaan wajib harus menghasilkan baris di database.** Pertanyaan yang
hanya berguna untuk analitik internal tidak boleh berada di jalur wajib; tempatnya
di blok opsional setelah akun jadi. Aturan ini yang menjaga wizard tetap pendek
dan menjaga kita jujur soal apa yang kita minta dari merchant.

Konsekuensi langsung: pertanyaan "layanan diberikan di tempat atau datang ke
pelanggan" dibuang, walau menggoda. Tabel `bookings` belum punya kolom alamat,
jadi jawabannya tidak bisa dipakai untuk apa pun.

## 4. Keputusan

| Keputusan | Pilihan | Alasan |
| --- | --- | --- |
| Bentuk | Wizard yang sekaligus mengerjakan setup | Merchant dapat imbalan atas jawabannya |
| Urutan | Wajib → identitas → opsional | Skip baru aman setelah akun jadi |
| Garis finis | Progres berhenti di langkah 4 | Blok opsional jadi bonus, bukan pekerjaan tertinggal |
| Penyimpanan jawaban | Tabel terpisah `merchant_profiles` | `anon` tidak punya hak apa pun atasnya |
| Katalog jenis usaha | TypeScript, bukan tabel referensi | Mengikuti `theme/presets.ts` dan `font-pairs.ts` |
| Penulisan | Satu RPC `security invoker` | Atomik, RLS tetap berlaku |
| Rute | `?langkah=` + `history.pushState` | Back browser berpindah langkah, bukan keluar |

## 5. Alur wizard

### 5.1 Langkah wajib

**Langkah 1 — Jenis usaha.** "Usaha Anda bergerak di bidang apa?" Grid ikon, pilih
satu dari sepuluh kategori. Setelah kategori dipilih, chip sub-kategori muncul di
**layar yang sama**, bukan langkah baru. Sub-kategori menentukan template layanan
di langkah 2. Dua ketukan, satu layar.

**Langkah 2 — Layanan pertama.** "Layanan apa yang paling sering dipesan?" Empat
sampai enam kartu template sesuai sub-kategori, plus "Tulis sendiri". Template
mengisi **nama dan durasi saja**. Harga wajib diketik merchant, disertai petunjuk
kisaran khas. Harga adalah keputusan merchant; angka bawaan yang salah lalu
tersimpan diam-diam lebih berbahaya daripada kolom kosong.

**Langkah 3 — Jam buka.** "Kapan pelanggan bisa memesan?" Empat kartu:
Senin–Jumat 09.00–17.00, Senin–Sabtu 09.00–18.00, Setiap hari 10.00–20.00, dan
"Atur sendiri" yang mengembang di tempat. Tersimpan sebagai satu baris
`availability` per hari terpilih.

**Langkah 4 — Identitas.** Nama usaha, username, WhatsApp. Memakai ulang
`onboarding-form.tsx` yang sudah ada beserta pengecekan username langsungnya —
logika itu sudah menangani balapan yang sulit dan tidak ditulis ulang. Di titik
ini seluruh jawaban disimpan dan `onboarded_at` terisi.

### 5.2 Layar keberhasilan

Setelah langkah 4 berhasil: "Halaman booking Anda siap — booka.id/studio-mawar"
dengan tautan yang bisa disalin. Barulah muncul tawaran blok opsional, dengan
tombol **"Lewati" yang sama menonjolnya** dengan "Lanjut".

Indikator progres sepanjang wizard berbunyi "Langkah N dari 4" dan hanya
menghitung langkah wajib. Kalau progres menyebut enam langkah lalu dua di
antaranya opsional, merchant yang melewatinya merasa meninggalkan pekerjaan
setengah jadi. Dengan garis finis di langkah 4, melewati blok opsional benar-benar
terasa gratis — dan justru itu yang membuat orang mengisinya.

### 5.3 Blok opsional

**Bonus A — Profil usaha.** Berapa orang yang melayani pelanggan (Sendiri / 2–5 /
6–15 / lebih dari 15) dan provinsi.

**Bonus B — Kebutuhan Anda.** Tiga pertanyaan pilihan cepat:
- Sekarang pelanggan memesan lewat apa? (multi-pilih)
- Apa yang paling ingin Anda selesaikan? (multi-pilih, maksimal 3)
- Tahu Booka dari mana?

Keduanya punya tombol "Lewati" yang setara dengan tombol lanjut.

Semantik melewati, agar tidak ambigu: "Lewati" pada Bonus A langsung menuju
dashboard dan tidak menurunkan merchant ke Bonus B. `optional_answered_at` diisi
begitu merchant menyimpan salah satu dari dua layar bonus; `optional_skipped_at`
diisi hanya bila merchant menekan "Lewati" tanpa pernah menyimpan satu pun.
Keduanya tidak pernah terisi bersamaan.

### 5.4 Peta pertanyaan ke tujuan

| Pertanyaan | Personalisasi | Demografi | Paket/upsell | Riset produk |
| --- | --- | --- | --- | --- |
| Kategori + sub-kategori | template layanan | industri | — | — |
| Layanan pertama | baris `services` | harga & durasi pasar | — | — |
| Jam buka | baris `availability` | pola operasi | — | — |
| Ukuran tim | — | skala usaha | sinyal PRO/STUDIO | kebutuhan multi-staf |
| Provinsi | — | sebaran wilayah | prioritas pasar | — |
| Channel pemesanan lama | — | — | — | pesaing sesungguhnya |
| Kendala terbesar | pesan dashboard | — | pemicu upgrade | arah roadmap |
| Sumber akuisisi | — | kanal akuisisi | — | — |

## 6. Skema database

Migration baru `supabase/migrations/20260829000100_onboarding_profile.sql`.

### 6.1 Enum baru

| Enum | Nilai |
| --- | --- |
| `business_category` | `KECANTIKAN` `KESEHATAN` `FOTOGRAFI` `ACARA` `PENDIDIKAN` `HEWAN` `OTOMOTIF` `SERVIS` `KONSULTASI` `LAINNYA` |
| `team_size` | `SENDIRI` `KECIL_2_5` `MENENGAH_6_15` `BESAR_15_PLUS` |
| `id_province` | 38 provinsi Indonesia, huruf besar dengan garis bawah (`DKI_JAKARTA`, `DI_YOGYAKARTA`, `PAPUA_BARAT_DAYA`, …) |
| `booking_channel` | `WHATSAPP` `INSTAGRAM_DM` `TELEPON` `DATANG_LANGSUNG` `APLIKASI_LAIN` `BELUM_ADA` |
| `merchant_goal` | `NO_SHOW` `DP_SULIT` `JADWAL_BENTROK` `CHAT_BERULANG` `HALAMAN_RAPI` `LAPORAN_PEMASUKAN` |
| `acquisition_source` | `INSTAGRAM` `TIKTOK` `TEMAN` `GOOGLE` `KOMUNITAS` `LAINNYA` |

`business_category` dijadikan enum karena inilah dimensi yang benar-benar
dikelompokkan saat analitik. `business_type_slug` (sub-kategori) cukup `text` yang
divalidasi Zod terhadap katalog TypeScript — pola yang sama dengan `font_pair`
yang enum sementara detail pasangan fontnya hidup di TypeScript.

### 6.2 Tabel `merchant_profiles`

```
merchant_id            uuid  primary key → merchants(id) on delete cascade
business_category      business_category  not null
business_type_slug     text                      -- null untuk kategori LAINNYA
team_size              team_size                 -- opsional
province               id_province               -- opsional
current_channels       booking_channel[]         -- opsional, maks 6
goals                  merchant_goal[]           -- opsional, maks 3
acquisition_source     acquisition_source        -- opsional
optional_answered_at   timestamptz
optional_skipped_at    timestamptz
created_at             timestamptz not null default now()
updated_at             timestamptz not null default now()
```

Constraint pada kolom array membatasi panjang **dan** melarang elemen `NULL`
(`array_position(goals, null) is null`). Tanpa larangan kedua, `array_length`
tetap lolos sementara analitik menghitung kategori hantu.

`optional_answered_at` dan `optional_skipped_at` sengaja dipisah: keduanya `NULL`
berarti merchant belum pernah ditawari, dan itu berbeda dari merchant yang
ditawari lalu menolak. Perbedaan itulah yang menentukan apakah `ProfileNudge`
boleh menagih.

Trigger `set_updated_at` seperti tabel lain.

### 6.3 Kenapa tabel terpisah, bukan kolom di `merchants`

`merchants` punya policy `merchants_public_read` untuk `anon`. Menaruh ukuran tim
dan kendala usaha di sana membuat keamanannya bergantung pada disiplin
grant-per-kolom selamanya — satu `grant select on public.merchants to anon` yang
ceroboh di kemudian hari membocorkan semuanya sekaligus. Tabel terpisah yang
`anon` tidak punya hak apa pun atasnya membuat kebocoran itu mustahil secara
struktural, bukan sekadar kebetulan tidak terjadi.

### 6.4 Hak akses

```
revoke all on public.merchant_profiles from anon, authenticated;
grant select, insert on public.merchant_profiles to authenticated;
grant update (business_category, business_type_slug, team_size, province,
              current_channels, goals, acquisition_source,
              optional_answered_at, optional_skipped_at)
  on public.merchant_profiles to authenticated;
```

`anon` tidak diberi apa pun. RLS aktif dengan tiga policy — `read_own`,
`insert_own`, `update_own`, semuanya `(select auth.uid()) = merchant_id`. Tidak
ada policy publik.

### 6.5 RPC `complete_onboarding`

PL/pgSQL, `security invoker`, `set search_path = ''`. Pemanggilnya adalah merchant
itu sendiri, jadi RLS dan grant per kolom tetap berlaku penuh — tidak ada yang
perlu dilewati. Ini berbeda dari `create_booking` yang `security definer` +
`service_role` karena di sana pemanggilnya pelanggan anonim.

Parameter: identitas (nama usaha, username, WhatsApp), profil (kategori, slug),
layanan (nama, durasi, harga), dan jam kerja (daftar hari + jam mulai/selesai).

Isi transaksi, berurutan:
1. `update merchants` (identitas + `onboarded_at`); bila 0 baris terkena, `insert`.
   Pola ini diwarisi dari `actions.ts` yang ada — `upsert` PostgREST gagal karena
   `authenticated` tidak punya hak `update` pada kolom `id`.
2. `insert into merchant_profiles ... on conflict (merchant_id) do update`.
3. `insert into services` **hanya bila jumlah layanan merchant masih nol**.
4. `insert into availability` **hanya bila merchant belum punya baris jam kerja**.

Fungsi ditutup default sejak `20260730000300`, jadi wajib
`grant execute ... to authenticated` eksplisit.

Jawaban blok opsional disimpan terpisah lewat server action biasa yang
`update merchant_profiles`. Akun sudah jadi di titik itu, jadi tidak butuh
atomicity dengan apa pun.

## 7. Katalog jenis usaha

`src/lib/business/catalog.ts` — sumber kebenaran untuk kategori, sub-kategori, dan
template layanan. Di TypeScript, bukan tabel, mengikuti preseden
`src/lib/theme/presets.ts` dan `font-pairs.ts`. Konsekuensinya: tidak ada tabel
referensi baru, tidak ada RLS baru, tidak ada seed migration, dan integritasnya
bisa diuji di `npm run test:unit`.

Sepuluh kategori dan sub-kategorinya:

| Kategori | Sub-kategori |
| --- | --- |
| `KECANTIKAN` | Salon rambut, Barbershop, Nail art, Eyelash & alis, Facial & skincare, Spa & pijat, Lainnya |
| `KESEHATAN` | Klinik & praktik dokter, Fisioterapi, Pijat terapi, Personal trainer, Studio yoga/pilates, Konsultasi gizi, Lainnya |
| `FOTOGRAFI` | Studio foto, Prewedding, Dokumentasi acara, Foto produk, Videografi, Lainnya |
| `ACARA` | Perias (MUA), Dekorasi, Wedding organizer, Sewa busana, Katering, Hiburan & musik, Lainnya |
| `PENDIDIKAN` | Les privat akademik, Kursus musik, Kursus bahasa, Mengaji, Kursus keterampilan, Bimbingan karier, Lainnya |
| `HEWAN` | Grooming, Klinik hewan, Penitipan, Pelatihan, Lainnya |
| `OTOMOTIF` | Bengkel mobil, Bengkel motor, Salon & detailing, Cuci kendaraan, Servis AC mobil, Lainnya |
| `SERVIS` | Servis AC, Servis elektronik, Servis gadget, Laundry, Kebersihan rumah, Tukang & renovasi, Lainnya |
| `KONSULTASI` | Psikolog & konseling, Konsultan bisnis, Konsultan pajak, Notaris & hukum, Desain & kreatif, Lainnya |
| `LAINNYA` | — (tanpa sub-kategori; `business_type_slug` bernilai `NULL`) |

Tiap sub-kategori membawa 4–6 template layanan berbentuk
`{ nama, durasi_menit, petunjuk_harga }`. Contoh untuk Barbershop:
Potong rambut (45 mnt), Potong + keramas (60 mnt), Cukur jenggot (30 mnt),
Pewarnaan (90 mnt). `petunjuk_harga` hanya teks bantu di UI dan tidak pernah
mengisi kolom harga.

## 8. Antarmuka

### 8.1 Rute dan navigasi

Tetap satu rute `/onboarding`; langkah disimpan di `?langkah=`. Perpindahan
memakai `window.history.pushState`, yang di Next 16 tersinkron dengan
`useSearchParams` (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`).
Tombol Back browser berpindah antar langkah alih-alih keluar dari onboarding.
Tidak ada segmen tingkat atas baru, jadi `ROUTES` dan `reserved_usernames` tidak
perlu disentuh.

Wizard memeriksa prasyarat tiap langkah. Bila `?langkah=` menunjuk langkah yang
prasyaratnya belum terjawab — tautan langsung, atau state klien yang hilang —
merchant dikembalikan ke langkah valid terakhir dengan `replaceState`, bukan
`pushState`, supaya tombol Back tidak terjebak memantul.

### 8.2 Perilaku maju

| Langkah | Interaksi | Cara maju |
| --- | --- | --- |
| 1 Jenis usaha | Grid ikon → chip sub-kategori di layar sama | Otomatis setelah sub-kategori dipilih |
| 2 Layanan | Kartu template → nama/durasi terisi, harga diketik | Tombol "Lanjut" |
| 3 Jam buka | Empat kartu preset; "Atur sendiri" mengembang di tempat | Otomatis untuk preset, tombol untuk kustom |
| 4 Identitas | Form yang sudah ada | Tombol "Selesai" |
| Bonus A | Ukuran tim + provinsi | "Lanjut" / "Lewati" |
| Bonus B | Tiga pertanyaan pilihan cepat | "Simpan" / "Lewati" |

Maju otomatis **hanya** pada langkah yang satu-satunya masukannya adalah pilihan
dan sepenuhnya bisa dibatalkan. Tombol "Kembali" selalu ada dan jawaban
sebelumnya tetap tersorot saat kembali. Langkah yang melibatkan pengetikan tidak
pernah maju sendiri — kehilangan harga yang baru diketik karena layar berpindah
adalah pengkhianatan kecil yang diingat orang.

### 8.3 Komponen baru

Repo belum punya `radio-group`, `checkbox`, maupun `progress` di
`src/components/ui/`.

- `OptionCard` — `<input type="radio">` tersembunyi + `<label>` bergaya. Bukan
  `<button>` dengan `aria-checked` manual: radio asli memberi navigasi panah,
  pengelompokan, dan pengumuman screen reader secara gratis dan benar.
- `OptionCheckCard` — versi checkbox untuk multi-pilih; saat batas maksimum
  tercapai, sisa pilihan dinonaktifkan alih-alih memunculkan pesan error.
- `WizardProgress` — bar tipis + "Langkah N dari 4".
- `WizardShell` — kerangka layar penuh: judul, konten, footer lengket
  Kembali/Lanjut.

Mobile-first: target ketuk minimal 44px, satu kolom di ponsel, dua sampai tiga
kolom di layar lebar. Transisi antar langkah berupa fade + geser halus, dimatikan
di bawah `prefers-reduced-motion`.

### 8.4 Ketahanan

Jawaban dicadangkan ke `sessionStorage` pada setiap perubahan dan dipulihkan saat
halaman dimuat ulang. Kunci cadangan menyertakan id user, sehingga akun lain di
perangkat yang sama tidak mewarisi jawaban orang sebelumnya. Cadangan dihapus
begitu RPC berhasil.

Tidak ada apa pun yang ditulis ke database sebelum langkah 4. Sebelum identitas
terisi merchant belum punya `username`, sehingga baris `services` yang ditulis
lebih awal akan menggantung pada akun yang belum onboarded — dan proxy akan terus
melemparnya kembali ke `/onboarding`.

### 8.5 Merchant lama

Merchant yang sudah punya `username` tidak akan pernah melihat wizard. Untuk
mereka, komponen `src/app/dashboard/profile-nudge.tsx` menawarkan pertanyaan yang
sama di dalam `Dialog`, memakai komponen yang persis sama. Kartu ini terpisah dari
`SetupAlerts`, yang urusannya kesiapan halaman booking, bukan pengenalan usaha.

Kartu muncul bila `merchant_profiles` belum ada, atau blok opsional belum pernah
dijawab maupun dilewati. "Nanti saja" mengisi `optional_skipped_at` sehingga tidak
pernah menagih dua kali.

## 9. Kegagalan dan kasus tepi

**Batas layanan paket STARTER.** Trigger `enforce_service_limit` melempar `P0001`
bila merchant sudah punya satu layanan. RPC menyisipkan layanan hanya bila jumlah
layanan masih nol — bukan sekadar menghindari error, tapi supaya merchant yang
entah bagaimana sudah punya layanan tidak kehilangannya karena wizard.

**Jam kerja bentrok.** `availability_no_overlap` adalah exclusion constraint. RPC
melewati penulisan jam kerja bila merchant sudah punya baris `availability` —
melewati, bukan menghapus lalu menulis ulang. Wizard tidak berhak menghancurkan
jadwal yang sudah ada.

**Username diambil orang lain bersamaan.** `23505` dari unique index dan `23514`
dari trigger `reject_reserved_username` merambat keluar dari RPC apa adanya, dan
server action menerjemahkannya ke pesan yang sudah dipakai sekarang. Karena satu
transaksi, seluruh penulisan batal dan merchant cukup mengganti username —
jawaban langkah 1–3 masih utuh di state klien.

**Kirim ganda.** Tombol dinonaktifkan lewat `useFormStatus`, tetapi itu tidak
cukup di jaringan lambat. Penjaga sebenarnya adalah `on conflict (merchant_id) do
update` pada profil, ditambah aturan "sisipkan layanan hanya bila nol".

**Zona waktu.** `availability` memakai kolom `time` tanpa zona waktu. Rancangan ini
mewarisi asumsi yang sudah berlaku di aplikasi; tidak memperkenalkan asumsi baru
dan tidak memperbaikinya.

**Validasi tidak diduplikasi.** Skema Zod memakai ulang
`src/lib/validations/service.ts`, `availability.ts`, dan `merchant.ts`. Yang baru
hanya `onboarding.ts` untuk field kuesioner. Panjang nama, rentang durasi 5–480,
harga non-negatif, dan format E.164 tetap punya satu sumber kebenaran.

## 10. Pengujian

### 10.1 `npm run docker:test`

Kasus baru di `supabase/tests/99_verify.sql`:

- `anon` tidak punya `select`, `insert`, `update`, maupun `delete` pada
  `merchant_profiles` — pengujian terpenting di seluruh perubahan ini
- `anon` tidak boleh `execute` `complete_onboarding`; `authenticated` boleh
- `goals` menolak 4 elemen, dan menolak array yang mengandung `NULL`
- `business_category` menolak nilai di luar enum
- menghapus merchant ikut menghapus baris profil (cascade)
- `complete_onboarding` atomik: username terpakai → tidak ada baris `services`
  maupun `availability` yang tertinggal

Sesuai peringatan `AGENTS.md`, tiap baris uji disusun agar tidak tertangkap
constraint lain lebih dulu — baris uji `goals` memakai username dan nama usaha
yang valid, supaya kegagalan yang muncul benar-benar soal `goals`.

### 10.2 `npm run check`

- `src/lib/business/catalog.test.ts` — setiap slug unik; setiap sub-kategori
  menunjuk kategori yang ada; setiap durasi template berada di 5–480; setiap
  kategori selain `LAINNYA` punya minimal satu sub-kategori. Katalog di TypeScript
  hanya aman kalau integritasnya diuji.
- `src/lib/validations/onboarding.test.ts` — skema menolak slug di luar katalog,
  menolak lebih dari 3 `goals`, dan menerima jawaban opsional yang kosong
  seluruhnya.

## 11. Berkas

```
src/lib/business/catalog.ts + catalog.test.ts
src/lib/validations/onboarding.ts + onboarding.test.ts
src/app/onboarding/page.tsx              penjaga sesi + nilai awal
src/app/onboarding/actions.ts            cek username, RPC, simpan jawaban opsional
src/app/onboarding/wizard.tsx            orkestrator klien, ?langkah=, sessionStorage
src/app/onboarding/steps/*.tsx           satu berkas per langkah
src/components/ui/option-card.tsx
src/components/ui/option-check-card.tsx
src/components/onboarding/wizard-shell.tsx
src/components/onboarding/wizard-progress.tsx
src/app/dashboard/profile-nudge.tsx
supabase/migrations/20260829000100_onboarding_profile.sql
src/types/database.ts                    diperbarui; semua tabel bertipe `type`
```

`onboarding-form.tsx` dipakai ulang sebagai langkah identitas, tidak ditulis ulang.

## 12. Yang sengaja tidak dikerjakan

- **Dashboard analitik demografi.** Data dibaca lewat Supabase Studio atau service
  role. UI admin adalah proyek tersendiri dan tidak dibutuhkan untuk mendapat
  datanya.
- **Penerapan otomatis preset tema dari kategori.** Menyeret aturan tier tema
  tanpa manfaat sepadan.
- **Pertanyaan bercabang per kategori.** Percabangan berlipat, sulit diuji, dan
  tiap kategori baru menuntut set pertanyaan baru.
- **Lebih dari satu layanan di wizard.** Paket STARTER hanya mengizinkan satu.
- **Kolom alamat pelanggan pada `bookings`.** Lihat prinsip di bagian 3.
