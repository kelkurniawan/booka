# Menjalankan dengan Docker

Tiga mode, dipilih lewat profile Compose.

## 1. Dev server (default)

```bash
npm run docker:dev
```

Buka http://localhost:3000. Kode di-mount dari host, jadi menyimpan file
langsung memicu reload — sekitar 2 detik, tanpa rebuild image.

Sebelum menjalankan, salin `.env.example` ke `.env.local` dan isi kredensial
Supabase. Compose membacanya otomatis. Tanpa file itu halaman `/` dan `/login`
tetap tampil, tapi `/dashboard` akan mengembalikan 500 dengan pesan yang
menyebut variabel mana yang kurang.

Menghentikan:

```bash
npm run docker:down
```

### Setelah menambah dependensi

`node_modules` berada di dalam image, bukan di host, supaya binary native
Next.js cocok dengan Linux di container. Jadi setiap kali `package.json`
berubah, image perlu dibangun ulang:

```bash
docker compose up --build
```

Atau jalankan `docker compose watch` — Compose akan rebuild sendiri begitu
`package-lock.json` berubah.

## 2. Image produksi

```bash
npm run docker:prod
```

Berjalan di http://localhost:3001, terpisah dari port dev.

Perhatikan `--env-file .env.local` di dalam skrip itu: variabel
`NEXT_PUBLIC_*` **di-inline ke bundle browser saat build**, bukan dibaca saat
container jalan. Menyetelnya hanya lewat `env_file` tidak cukup — bundle-nya
sudah terlanjur jadi. Kalau URL atau publishable key kosong, build berhenti
dengan pesan yang menjelaskan hal ini.

Ganti URL produksi saat build image untuk deploy:

```bash
docker build \
  --build-arg NEXT_PUBLIC_APP_URL=https://booka.app \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
  --target runner -t booka:latest .
```

`SUPABASE_SECRET_KEY` dan kredensial payment gateway **tidak** boleh masuk
build arg — nilainya akan tersimpan permanen di layer image. Semuanya dibaca
saat runtime, jadi pasok lewat environment variable container.

Image produksi hanya berisi output standalone: tidak ada source code, tidak ada
file `.env`, dan berjalan sebagai user non-root `nextjs`. Ukurannya ~311 MB,
dibanding ~1,2 GB untuk image dev.

## 3. Uji migration

```bash
npm run docker:test
```

Menjalankan Postgres 17 polos, memasang tiruan minimal lingkungan Supabase
(schema `auth`, peran `anon`/`authenticated`/`service_role`, dan default
privileges Supabase), lalu menerapkan semua file di `supabase/migrations/`
berurutan dan menjalankan `supabase/tests/99_verify.sql`.

Hasilnya tercetak di log. Setiap baris diawali `OK` atau `FAIL`:

```
OK   ditolak -> booking 10:00-12:00 bentrok dengan yang PAID
OK   anon TIDAK bisa membaca whatsapp_number
```

Yang diperiksa: trigger `handle_new_user`, format & reserved username, batas
layanan paket STARTER, jam kerja tumpang tindih, anti double-booking, format
nomor E.164, serta hak akses kolom dan schema untuk peran `anon`.

Migration baru otomatis ikut terjalankan — skrip memakai glob, tidak ada daftar
nama file yang perlu dirawat.

Ini **bukan** Supabase lengkap: tidak ada GoTrue, PostgREST, maupun Storage,
jadi aplikasi tidak bisa dijalankan terhadapnya. Fungsinya khusus memverifikasi
skema, constraint, trigger, dan hak akses.

Skrip init hanya berjalan saat volume database masih kosong, karena itu
`npm run docker:test` selalu melakukan `down -v` lebih dulu.
