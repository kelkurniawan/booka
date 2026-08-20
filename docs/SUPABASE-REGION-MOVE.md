# Runbook: memindahkan project Supabase ke `ap-southeast-1` (Singapura)

Status: **belum dijalankan.** Dokumen ini rencana, bukan catatan sesudah.

## Kenapa

Project Supabase Booka (`ydhllxeeymvthgfsqmkb`) berjalan di
`ap-northeast-1` (Tokyo), sedangkan penggunanya merchant Indonesia dan
Vercel Functions-nya di-pin ke Singapura. Akibatnya tiap round-trip
database menyeberang Tokyo–Singapura (~70 ms), dan satu navigasi dashboard
masih melakukan sekitar tiga round-trip berurutan.

Supabase **tidak** menyediakan perpindahan region di tempat. Satu-satunya
jalan adalah membuat project baru di region tujuan lalu memindahkan datanya.

## Yang harus ikut pindah

| Aset | Catatan |
| --- | --- |
| 7 tabel `public` | `merchants`, `services`, `availability`, `bookings`, `payment_connections`, `booking_attempts`, `reserved_usernames` |
| Seluruh migration | 17 file di `supabase/migrations/` — jalankan dari awal, jangan dump skema |
| `auth.users` | Termasuk hash password. Wajib dump/restore, bukan dibuat ulang |
| Extension | `pgcrypto`, `btree_gist` (dipakai constraint `bookings_no_overlap`) |
| Edge Functions | **Tidak ada** — sudah diverifikasi kosong |
| Storage buckets | **Tidak ada** |

## Jebakan yang khusus untuk project ini

1. **`TOKEN_ENCRYPTION_KEY` TIDAK BOLEH BERUBAH.** Kredensial payment
   gateway merchant disimpan terenkripsi di `payment_connections`
   (`src/lib/crypto/secret-box.ts`). Baris-baris itu pindah sebagai
   ciphertext. Kalau key-nya diganti saat migrasi, seluruh koneksi
   pembayaran merchant jadi tidak bisa didekripsi — dan gagalnya baru
   ketahuan saat ada pelanggan mencoba bayar, bukan saat migrasi.
2. **Google OAuth punya dua sisi.** Selain Redirect URL di Auth settings
   project baru, `client_secret_*.json` / Google Cloud Console juga memuat
   authorized redirect URI yang menunjuk ke domain project LAMA
   (`ydhllxeeymvthgfsqmkb.supabase.co`). Keduanya wajib diperbarui, kalau
   tidak login Google gagal walau email+password jalan.
3. **Urutan `reserved_usernames`.** Tabel ini di-seed oleh migration
   `20260730000100_reserve_indonesian_routes.sql`. Kalau data lama
   di-restore SETELAH migration jalan, akan bentrok primary key. Restore
   data tabel ini dengan `--on-conflict-do-nothing`, atau lewati sama
   sekali karena isinya deterministik dari migration.
4. **`exclude using gist` butuh `btree_gist` lebih dulu.** Pastikan
   extension terpasang di project baru sebelum migration dijalankan.

## Langkah

Lakukan di jam sepi. Perkirakan downtime tulis 15–30 menit.

1. **Bekukan tulisan.** Aktifkan maintenance di halaman booking publik atau
   matikan sementara deployment, supaya tidak ada booking masuk di
   tengah dump — booking yang masuk setelah dump akan hilang.

2. **Buat project baru** di organisasi yang sama, region
   `Southeast Asia (Singapore) / ap-southeast-1`. Catat ref-nya.

3. **Dump data saja** dari project lama (skema datang dari migration):

   ```bash
   npx supabase db dump --project-ref ydhllxeeymvthgfsqmkb --data-only -f data.sql
   npx supabase db dump --project-ref ydhllxeeymvthgfsqmkb --data-only --schema auth -f auth.sql
   ```

4. **Terapkan migration ke project baru**, lalu restore data:

   ```bash
   npx supabase link --project-ref <REF_BARU>
   npx supabase db push
   psql "<CONNECTION_STRING_BARU>" -f auth.sql
   psql "<CONNECTION_STRING_BARU>" -f data.sql
   ```

5. **Verifikasi sebelum memindahkan trafik.** Minimal:
   - jumlah baris tiap tabel sama dengan project lama
   - satu merchant bisa login (membuktikan `auth.users` + hash password ikut)
   - `select * from public.dashboard_booking_summary()` mengembalikan satu
     baris untuk merchant yang punya booking
   - satu koneksi pembayaran berhasil didekripsi (membuktikan poin 1 di atas)

6. **Perbarui environment variable** di Vercel (Production, Preview,
   Development) dan `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`.
   `TOKEN_ENCRYPTION_KEY` **tetap**.

7. **Perbarui Google OAuth** di kedua sisi (lihat jebakan 2), dan Site URL
   serta redirect allowlist di Auth settings project baru.

8. **Ubah `vercel.json`** dari region saat ini ke `["sin1"]`, lalu deploy.
   Ini langkah terakhir: sebelum database benar-benar di Singapura,
   memindahkan function ke `sin1` justru menambah jarak.

9. **Perbarui `docs/DECISIONS.md` #20** supaya mencatat keadaan baru, dan
   hapus status "belum dijalankan" di dokumen ini.

10. **Simpan project lama dalam keadaan paused** selama beberapa hari
    sebagai jaring pengaman — jangan langsung dihapus.

## Rollback

Sampai langkah 6 belum dijalankan, tidak ada yang perlu di-rollback:
aplikasi masih menunjuk project lama. Setelah langkah 6, rollback berarti
mengembalikan environment variable ke project lama — karena itu project
lama tidak boleh dihapus sampai project baru terbukti stabil.
