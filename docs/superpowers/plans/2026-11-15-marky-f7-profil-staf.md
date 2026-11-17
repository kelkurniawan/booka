# F7 Profil staf dengan foto dan klip: rencana implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merchant Studio memberi tiap staf foto, peran, perkenalan singkat, keahlian, dan klip bergerak pendek; pelanggan melihatnya di langkah "Dengan siapa?" bersama jam kosong terdekat tiap staf.

**Architecture:** Satu migration menambah enam kolom ke `staff` (grant per kolom, `motion_path` hanya bisa ditulis `service_role`) dan satu bucket privat `staff-clip-uploads` untuk berkas mentah. Foto dikecilkan di browser lalu diunggah langsung ke `merchant-media` seperti logo F6. Klip diunggah mentah dari browser ke bucket privat, lalu Route Handler `POST /api/staff/clip` (Vercel Function Node, Fluid Compute) mengunduhnya, mengubahnya ke MP4 bisu maksimal 5 detik dengan `ffmpeg-static`, menaruh MP4 dan poster JPG di `merchant-media`, dan menulis `motion_path`. Halaman publik membaca kolom baru lewat `loadPublicStaff`, mengambil jam kosong terdekat dari `GET /api/slots/nearest`, dan merender kartu staf baru lewat `resolveTheme()`.

**Tech Stack:** Next.js 16 App Router (Route Handler `runtime = "nodejs"`), Supabase Postgres + Storage, Zod, `ffmpeg-static` (dependensi baru), Storybook 10, `node:test` lewat `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-14-marky-redesign-design.md` bagian 1 (anti-goal gerakan), 2, 5 (F7), 6 (keputusan 5), 7. Aturan mengikat: `AGENTS.md`, `DESIGN.md` bagian 1, 2, dan Larangan. Artboard: M8 `StafProfil.dc.html`, 02 `Jadwal.dc.html` (bagian "Dengan siapa?"). Teks: `python3 .superpowers/design/extract.py .superpowers/design/app/<file>`.

## Prasyarat

F7 dimulai setelah F6 selesai dan di-commit di cabang yang sama. Dari F6 dipakai: `motionAllowed` (`src/lib/theme/motion.ts`), logika gerbang reduced motion dan hemat data di `src/components/booking-page/motion-background.tsx`, dan pola unggah logo di `appearance-editor.tsx`. Dari F1: langkah 2 `BookingFlow` (`src/app/[username]/booking-flow.tsx`) dengan `fieldset` "Dengan siapa?" dan `DateStrip` 14 hari. Bila salah satunya tidak ada, berhenti dan lapor.

## Keputusan (spec diam atau bentrok, diputuskan di sini)

1. **Pipeline klip: `ffmpeg-static` di Vercel Function (Route Handler Node), bukan transcode di browser dan bukan Supabase Edge Function.**
   - Biaya: Fluid Compute menagih CPU aktif. Klip maksimal 5 detik pada 480 px butuh sekitar 1 sampai 3 detik CPU, hanya untuk merchant Studio, maksimal 20 staf. Tidak ada vendor video berbayar (Mux, Cloudinary) dan tidak ada tagihan per menit.
   - Latensi: satu permintaan, sekitar 3 sampai 8 detik termasuk unduh dan unggah. Merchant menunggu dengan spinner "Mengubah klip ke MP4". Halaman publik tidak pernah menunggu.
   - Keandalan: binary ffmpeg dipatok versi npm, jalan di runtime yang sama dengan aplikasi (Vercel, `npm run dev`, image Docker Alpine karena build statis). Hasil server bisa dipercaya, sehingga durasi dan ukuran tervalidasi di server.
   - Ditolak: ffmpeg.wasm (inti sekitar 30 MB, lambat di HP Android kelas bawah, dan hasil dari browser tetap harus diperiksa ulang di server). WebCodecs (`ImageDecoder` untuk GIF tidak merata di Safari, butuh muxer MP4 sebagai dependensi, dan spec meminta konversi di server). Supabase Edge Function (Deno tidak bisa menjalankan binary, batas CPU 2 detik terlalu kecil untuk ffmpeg.wasm, dan menambah jalur deploy kedua).
2. **Berkas mentah tidak pernah publik.** Browser mengunggah langsung ke bucket privat `staff-clip-uploads` (melewati batas body 4,5 MB Vercel): `public = false`, `file_size_limit = 8388608`, tipe `image/gif`, `video/mp4`, `video/webm`, `video/quicktime`. Policy hanya INSERT ke folder `auth.uid()` sendiri, tanpa policy SELECT, UPDATE, DELETE. Path `{merchant_id}/{staff_id}/{acak}.{gif|mp4|webm|mov}`. Route membacanya dengan klien admin dan menghapusnya di `finally`, berhasil atau gagal. `merchant-media` tetap tidak menerima `image/gif` (diuji t57).
3. **`motion_path` hanya ditulis `service_role`.** `authenticated` tidak mendapat UPDATE maupun INSERT pada kolom itu (insert staf diubah jadi grant per kolom). Jadi setiap klip yang tampil pasti lewat pipeline, bukan berkas yang diunggah merchant langsung ke bucket publik.
4. **Validasi server.** Ukuran: byte hasil unduhan paling besar `MEDIA_LIMITS.clipMaxBytes` (8388608), di samping batas bucket. Durasi: dibaca dari baris `Duration:` stderr ffmpeg; lebih dari 5,1 detik ditolak (0,1 detik toleransi pembulatan jeda bingkai GIF). Bila durasi tidak tercatat (sebagian WebM dari MediaRecorder), klip diterima tetapi keluaran selalu dipotong `-t 5`. Keluaran selalu `-an`, H.264 `yuv420p`, `+faststart`, sisi terpanjang maksimal 480 px, 24 fps. Keluaran lebih dari 8 MB ditolak.
5. **ffmpeg diperkeras terhadap berkas jahat.** `-protocol_whitelist file`, `-format_whitelist gif,mov,mp4,m4a,3gp,3g2,mj2,matroska,webm` (menutup playlist HLS/concat yang menyamar sebagai `.gif` lalu membaca berkas lokal seperti `/proc/self/environ`), `-max_pixels 16777216`, `-nostdin`, batas waktu proses 45 detik, folder kerja `mkdtemp` per permintaan yang dihapus di `finally`.
6. **Poster tanpa kolom baru.** Poster JPG diambil dari bingkai pertama MP4 hasil dan disimpan dengan nama dasar yang sama (`clip-<acak>.mp4` dan `clip-<acak>.jpg`). `clipPosterPath(motionPath)` menurunkannya.
7. **Foto** dipotong persegi 512 px WebP di browser (`compressImage`, `MEDIA_LIMITS.avatarMaxSide`), batas berkas mentah 12 MB (`validateImageFile`). Artboard menyebut "maks 2 MB"; diganti, sama seperti F6 Keputusan 7. Path `{merchant_id}/staff/{staff_id}/photo-<acak>.webp`; klip `{merchant_id}/staff/{staff_id}/clip-<acak>.mp4`. Constraint mewajibkan awalan `{merchant_id}/staff/`, ekstensi `.webp` untuk foto dan `.mp4` untuk klip.
8. **Grant anon:** `role`, `bio`, `tags`, `photo_path`, `motion_path`, `show_motion`, karena halaman publik butuh `show_motion` untuk memutuskan. `loadPublicStaff` mengembalikan `motionPath: null` bila `show_motion` false. Berkasnya tetap di bucket publik; ini batas tampilan, bukan kerahasiaan.
9. **Batas isian:** peran 1 sampai 40 karakter atau kosong, perkenalan maksimal 140, keahlian maksimal 5 dengan masing-masing 1 sampai 24 karakter, tanpa duplikat (Zod, tanpa membedakan huruf besar). Constraint tanpa fungsi (pola F6 Keputusan 3), karena fungsi baru tertutup bagi `authenticated` sejak `20260730000300`.
10. **Jam kosong terdekat:** Route baru `GET /api/slots/nearest?username=&serviceId=` memanggil `get_booked_ranges` sekali untuk 14 hari dan fungsi murni `nearestStaffSlots`. Kuncinya id staf plus `"any"`. `BookingFlow` mengambilnya sekali per layanan saat masuk langkah 2. Teks: "Hari ini 14:00", "Besok 09:00", "Sab 10:00", atau "Belum ada jadwal". Saat memuat tampil "Mencari jam kosong". Bila gagal, baris jam disembunyikan; memilih staf tetap bisa.
11. **Gerak di halaman publik.** Server selalu merender poster `<img>`. Setelah mount, bila `useMotionAllowed()` true (bukan reduced motion, bukan hemat data), poster diganti `<video muted autoPlay playsInline preload="metadata">` TANPA `loop` (diputuskan ulang controller: klip yang berulang terus melanggar R-39 karena total geraknya lebih dari 5 detik). Klip diputar sekali (maks 5 detik) lalu berhenti di frame terakhir; ketuk kartu atau tombol kecil "Putar lagi" (44px) untuk mengulang. Pengunjung reduced motion atau hemat data tidak pernah mengunduh MP4. Klip `aria-hidden`; nama dan perkenalan sudah ada sebagai teks.
12. **"Menangani layanan" dari M8 tidak dibangun.** Spec F7 tidak memintanya, dan pemetaan staf ke layanan akan mengubah `create_booking`, `/api/slots`, dan booking manual F3.
13. **Editor di dialog, bukan master-detail.** Tombol "Profil" di tiap kartu staf membuka `StaffProfileDialog`: form dan pratinjau berdampingan mulai `md`, bertumpuk di HP. Pratinjau memakai `StaffPicker` dan `StaffProfileCard` publik di dalam `themeToCssVars(resolveTheme(...))` merchant, jadi identik dengan halaman publik.
14. **Paket:** tidak ada aturan baru. Staf sudah khusus Studio (trigger `BK010`, `loadPublicStaff` mengembalikan `[]` untuk paket lain). Route klip menolak non-Studio sebelum memakai CPU. Kolom profil tetap bisa disimpan setelah turun paket.
15. **Pembersihan berkas.** Foto atau klip lama dihapus hanya setelah path baru tersimpan. `deleteStaff` menghapus foto, klip, dan poster staf itu. `purgeMerchantMedia` ikut membersihkan `staff-clip-uploads`. Berkas mentah yang yatim karena merchant menutup halaman sebelum route dipanggil baru hilang saat akun dihapus (diterima; berkasnya privat dan maksimal 8 MB).
16. **Tidak ada env var baru** (route memakai `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY` yang sudah ada lewat `createAdminClient`). Dependensi baru: `ffmpeg-static` `^5.3.0`. Skrip install-nya mengunduh binary dari GitHub saat `npm ci` (Vercel dan Docker menjalankan skrip install). Binary-nya build GPL dan hanya dijalankan di server, tidak didistribusikan. `next.config.ts` mendapat `serverExternalPackages: ["ffmpeg-static"]` dan `outputFileTracingIncludes: { "/api/staff/clip": ["./node_modules/ffmpeg-static/ffmpeg"] }`.

## Konflik dengan spec atau desain

- M8 punya "Menangani layanan" (Keputusan 12) dan tata letak master-detail (Keputusan 13).
- M8 menulis "maks 2 MB" untuk foto (Keputusan 7).
- Artboard 02 menulis jam sebagai "Sab 10.00"; di sini jam memakai `label` yang sama dengan `TimeSlotPicker` ("10:00") supaya kartu dan daftar jam konsisten.
- Klip berulang tanpa tombol jeda (Keputusan 11). `DESIGN.md` mewajibkan jeda untuk gerakan lebih dari 5 detik; klip yang berulang bisa dibaca sebagai gerakan berkelanjutan. Controller sudah memutuskan tanpa jeda; reviewer perlu tahu tafsirannya.

## Global Constraints

- Migration baru saja: `supabase/migrations/20261119000100_staff_profile.sql`. Akhiri dengan `notify pgrst, 'reload schema';`. Jangan edit migration lama.
- Uji di `supabase/tests/99_verify.sql` bagian 55 sampai 57 (58 dan 59 dicadangkan), label `t55`..`t57`, ditambahkan setelah bagian 54. Lulus berarti tidak ada baris diawali `FAIL` di seluruh `npm run docker:test` (Docker harus jalan: `open -a Docker`).
- `src/types/database.ts` ikut diperbarui, `type` bukan `interface`.
- `src/components/booking-page/*` hanya memakai `var(--...)` dari `themeToCssVars()` dan kelas Tailwind yang dipetakan ke variabel itu (`bg-card`, `text-muted-foreground`, `border-border`); tanpa hex, `rgb(`, atau ukuran font tertulis.
- `createAdminClient()` selalu memfilter `merchant_id` (atau `id = user.id` untuk `merchants`). Route `/api/*` memverifikasi sesi sendiri dengan `getUser()`; matcher proxy tidak mencakup `/api/*`.
- Batas: klip maksimal 5 detik, 8 MB masuk, tanpa suara, MP4 keluar, GIF asli tidak pernah disajikan; ukuran dan durasi diperiksa di server.
- Larangan `DESIGN.md`: tanpa em dash, tanpa eyebrow, tanpa label kapital berjarak, tanpa `·`, tanpa panah di teks tombol. Target sentuh minimal 44 px, fokus terlihat, semua bisa dengan keyboard. Dashboard tetap monokrom. Setiap daftar data punya keadaan memuat, kosong, dan gagal.
- Komponen tampilan baru menerima data dan aksi lewat props dan punya story.
- UI dan komentar berbahasa Indonesia, nama variabel Inggris. Tidak ada langkah deploy.

## Review Focus

1. Berkas jahat yang diunggah sebagai klip (playlist HLS bernama `.gif`, berkas teks, GIF raksasa 10000 px): route menolak dengan "Klip tidak bisa dibaca. Coba berkas lain." tanpa membaca berkas lokal atau jaringan, dan berkas mentah tetap terhapus. Diuji `transcode-clip.test.ts` (playlist) di Task 3.
2. Klip 7 detik, klip 9 MB, atau WebM tanpa durasi tercatat: dua yang pertama ditolak dengan pesan terbaca di dashboard; yang ketiga diterima dan hasilnya tidak lebih dari 5 detik. Diuji `validateClipFile` (Task 2) dan tes integrasi `-t 5` (Task 3).
3. Merchant memanggil Storage atau PostgREST langsung dengan tokennya sendiri: tidak bisa menaruh GIF di bucket publik, tidak bisa membaca bucket privat, tidak bisa menulis `motion_path` lewat UPDATE maupun INSERT, dan tidak bisa menunjuk foto di folder merchant lain. Diuji t55, t56, t57.
4. Pengunjung dengan reduced motion atau hemat data: hanya poster yang tampil dan MP4 tidak diunduh. Pengunjung biasa melihat klip berputar tanpa suara. Diuji story `ReducedMotion` (Task 5) dan pemeriksaan jaringan di Task 7.
5. Staf yang tidak punya jam kosong 14 hari, atau `/api/slots/nearest` gagal: kartu menulis "Belum ada jadwal" atau menyembunyikan baris jam, dan memilih staf tetap bisa. Diuji `nearestStaffSlots` (Task 4) dan story `Gagal` (Task 5).

---

### Task 1: Skema profil staf dan bucket klip mentah

Model: sonnet.

**Files:**
- Create: `supabase/migrations/20261119000100_staff_profile.sql`
- Modify: `supabase/tests/99_verify.sql` (bagian `-- 55. Profil staf: kolom dan constraint (20261119000100)`, `-- 56. Profil staf: hak akses kolom (20261119000100)`, `-- 57. Bucket staff-clip-uploads (20261119000100)`), `src/types/database.ts`

**Interfaces:**
- Consumes: `public.staff`, grant dan policy dari `20261005180027_staff.sql`, `storage.buckets`/`storage.objects` (policy pola `20260820000200_storage_bucket.sql`).
- Produces (SQL):

```sql
alter table public.staff
  add column role text,
  add column bio text,
  add column tags text[] not null default '{}',
  add column photo_path text,
  add column motion_path text,
  add column show_motion boolean not null default true,
  add constraint staff_role_length check (role is null or char_length(btrim(role)) between 1 and 40),
  add constraint staff_bio_length check (bio is null or char_length(bio) <= 140),
  add constraint staff_tags_shape check (
    coalesce(array_ndims(tags), 1) = 1
    and cardinality(tags) <= 5
    and array_position(tags, null) is null
    and (cardinality(tags) = 0 or array_to_string(tags, E'\n') ~ '^[^\n]{1,24}(\n[^\n]{1,24})*$')
  ),
  add constraint staff_photo_path_scoped check (photo_path is null or (
    photo_path ~ ('^' || merchant_id::text || '/staff/[A-Za-z0-9._/-]+\.webp$') and photo_path !~ '\.\.')),
  add constraint staff_motion_path_scoped check (motion_path is null or (
    motion_path ~ ('^' || merchant_id::text || '/staff/[A-Za-z0-9._/-]+\.mp4$') and motion_path !~ '\.\.'));

grant select (role, bio, tags, photo_path, motion_path, show_motion) on public.staff to anon;
grant update (role, bio, tags, photo_path, show_motion) on public.staff to authenticated;
revoke insert on public.staff from authenticated;
grant insert (merchant_id, name, is_active, sort_order, role, bio, tags, photo_path, show_motion)
  on public.staff to authenticated;
-- motion_path: hanya service_role (route /api/staff/clip), Keputusan 3.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-clip-uploads', 'staff-clip-uploads', false, 8388608,
        array['image/gif', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;

create policy "staff_clip_uploads_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'staff-clip-uploads'
              and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Sengaja tanpa policy select/update/delete: berkas mentah tidak pernah dibaca klien (Keputusan 2).
```

- Produces (TS, `src/types/database.ts`): `Staff` bertambah `role: string | null; bio: string | null; tags: string[]; photo_path: string | null; motion_path: string | null; show_motion: boolean`. `Insert`/`Update` tabel `staff` mengikuti pola tabel lain di berkas itu (kolom baru opsional).

- [ ] **Step 1: Tulis kasus uji yang gagal.** Siapkan `auth.users` `55505550-0000-0000-0000-000000000001` (STUDIO, username `studio-55`) dan `...0002` (STUDIO, username `studio-55b`), staf `55505550-57af-0000-0000-000000000001` milik `...0001`. Label diawali `t55`, `t56`, `t57`, pakai `pg_temp.expect_ok`, `expect_fail`, `expect_fail_code`.
  - t55a staf baru: `tags = '{}'`, `show_motion = true`, kolom lain null.
  - t55b masing-masing `23514`: `role` 41 karakter; `role = '   '`; `bio` 141 karakter; `tags` enam elemen; tag 25 karakter; `tags = '{""}'`; `array['a', null]`; `'{{a,b}}'`; `photo_path` `'55505550-0000-0000-0000-000000000002/staff/x/photo-a.webp'` (folder merchant lain); `photo_path` `'<id>/avatar-a.webp'` (bukan `/staff/`); `photo_path` `'<id>/staff/x/photo-a.png'`; `photo_path` `'<id>/staff/../photo-a.webp'`; `motion_path` `'<id>/staff/x/clip-a.gif'` (GIF tidak pernah jadi klip).
  - t55c diterima: `role = 'Pemilik, MUA'`, `bio` 140 karakter, `tags = '{Wisuda,Pengantin}'`, `photo_path = '<id>/staff/<staf>/photo-ab12cd34.webp'`, lalu sebagai superuser `motion_path = '<id>/staff/<staf>/clip-ab12cd34.mp4'`.
  - t56a `has_column_privilege('anon', 'public.staff', c, 'SELECT')` true untuk keenam kolom; `has_table_privilege('anon', 'public.staff', 'UPDATE')` false; `has_column_privilege('authenticated', 'public.staff', 'motion_path', 'UPDATE')` false dan `'INSERT'` false; `'role'`, `'UPDATE'` true; `'name'`, `'INSERT'` true.
  - t56b sebagai `authenticated` dengan klaim `sub` `...0001` (`begin; set local role authenticated; set local request.jwt.claim.sub = ...;`): update `role` staf sendiri berhasil; `update public.staff set motion_path = ...` gagal `42501`; `insert into public.staff (merchant_id, name, motion_path) values (...)` gagal `42501`; `insert into public.staff (merchant_id, name, sort_order) values ('...0001', 'Nadia', 1)` berhasil (`createStaff` tetap jalan).
  - t57a bucket `staff-clip-uploads` ada, `public = false`, `file_size_limit = 8388608`, `'image/gif' = any(allowed_mime_types)`; bucket `merchant-media` tidak memuat `image/gif`.
  - t57b sebagai `authenticated` `...0001`: insert objek `staff-clip-uploads` di `'55505550-0000-0000-0000-000000000001/<staf>/a1.gif'` berhasil; di folder `...0002` gagal; lalu `select count(*) from storage.objects where bucket_id = 'staff-clip-uploads'` sama dengan 0 (tidak ada policy baca). Sebagai `anon`: insert gagal, dan hitungan yang sama 0.
- [ ] **Step 2: Jalankan** `npm run docker:test`. Expected: baris `FAIL` untuk t55..t57 (kolom dan bucket belum ada), atau galat kolom tidak dikenal.
- [ ] **Step 3: Tulis migration** sesuai Interfaces. Komentar kepala menyebut Keputusan 2, 3, 7, 8, 9.
- [ ] **Step 4: Perbarui** `src/types/database.ts`.
- [ ] **Step 5: Jalankan** `npm run docker:test` dan `npm run typecheck`. Expected: tidak ada baris diawali `FAIL`; typecheck lulus.
- [ ] **Step 6: Commit**: `git add supabase/migrations/20261119000100_staff_profile.sql supabase/tests/99_verify.sql src/types/database.ts` lalu `git commit -m "Tambah kolom profil staf dan bucket privat klip mentah"`.

---

### Task 2: Batas klip, path media staf, dan skema profil

Model: haiku.

**Files:**
- Modify: `src/lib/media/limits.ts`, `src/lib/media/limits.test.ts`, `src/lib/validations/staff.ts`
- Create: `src/lib/media/staff-paths.ts`, `src/lib/media/staff-paths.test.ts`, `src/lib/validations/staff.test.ts`

**Interfaces:**
- Consumes: `isScopedMediaPath` (`src/lib/media/path.ts`).
- Produces:

```ts
// src/lib/media/limits.ts (tambahan pada MEDIA_LIMITS)
clipTypes: ["image/gif", "video/mp4", "video/webm", "video/quicktime"],
/** = file_size_limit bucket staff-clip-uploads (20261119000100). */
clipMaxBytes: 8 * 1024 * 1024,
clipMaxSeconds: 5,
clipMaxSide: 480,
/** null = durasi tidak diketahui (diperiksa ulang di server; keluaran tetap dipotong 5 detik). */
export function validateClipFile(file: { type: string; size: number }, durationSeconds: number | null): string | null;

// src/lib/media/staff-paths.ts (murni)
export const CLIP_UPLOAD_BUCKET = "staff-clip-uploads";
export type ClipUploadExtension = "gif" | "mp4" | "webm" | "mov";
export function clipUploadExtension(type: string): ClipUploadExtension | null;
/** `${merchantId}/staff/${staffId}/` */
export function staffMediaPrefix(merchantId: string, staffId: string): string;
export function isStaffPhotoPath(path: string, merchantId: string, staffId: string): boolean;
export function isClipUploadPath(path: string, merchantId: string, staffId: string): boolean;
/** ".../clip-ab12.mp4" -> ".../clip-ab12.jpg" (Keputusan 6). */
export function clipPosterPath(motionPath: string): string;

// src/lib/validations/staff.ts (tambahan)
export const STAFF_PROFILE_LIMITS = { roleMax: 40, bioMax: 140, tagsMax: 5, tagMax: 24 } as const;
export const staffProfileSchema: z.ZodType<...>; // z.object({ role, bio, tags, photo_path, show_motion })
export type StaffProfileInput = z.input<typeof staffProfileSchema>;
export type StaffProfile = z.output<typeof staffProfileSchema>;
// keluaran: { role: string | null; bio: string | null; tags: string[]; photo_path: string | null; show_motion: boolean }
```

Ketentuan:
- `validateClipFile` urutan periksa: tipe, ukuran, durasi. Pesan persis: "Format klip harus GIF, MP4, WebM, atau MOV.", "Ukuran klip maksimal 8MB.", "Durasi klip maksimal 5 detik.". Durasi ditolak bila `> MEDIA_LIMITS.clipMaxSeconds + 0.1` (komentar satu baris: toleransi pembulatan jeda bingkai GIF).
- `isStaffPhotoPath`: `isScopedMediaPath(path, merchantId)` dan cocok `^<prefix>photo-[A-Za-z0-9-]+\.webp$`.
- `isClipUploadPath`: cocok `^<merchantId>/<staffId>/[A-Za-z0-9-]+\.(gif|mp4|webm|mov)$` dan tanpa `..`.
- `staffProfileSchema`: `role` dan `bio` di-trim, `""` jadi null, pesan "Peran maksimal 40 karakter" dan "Perkenalan maksimal 140 karakter". `tags`: tiap elemen di-trim, 1..24 ("Keahlian maksimal 24 karakter"), tanpa baris baru, maksimal 5 ("Maksimal 5 keahlian"), tanpa duplikat tanpa membedakan huruf besar ("Keahlian tidak boleh dobel"). `photo_path`: string atau null, `""` jadi null (cakupan folder diperiksa di aksi). `show_motion`: boolean.

- [ ] **Step 1: Tulis tes yang gagal.**
  - `limits.test.ts`: `validateClipFile({type:"image/gif",size:1_000_000}, null)` null; `{type:"image/png",...}` cocok `/GIF, MP4/`; ukuran `MEDIA_LIMITS.clipMaxBytes + 1` cocok `/8 ?MB/`; durasi `5.1` null; `5.2` cocok `/5 detik/`; `MEDIA_LIMITS.clipMaxBytes === 8388608`.
  - `staff-paths.test.ts` (`M = "11111111-1111-1111-1111-111111111111"`, `S = "22222222-2222-2222-2222-222222222222"`): `clipUploadExtension("video/quicktime") === "mov"`, `("image/png") === null`; `isStaffPhotoPath(`${M}/staff/${S}/photo-a1b2.webp`, M, S)` true; folder staf lain, folder merchant lain, `.png`, `photo-a"b.webp`, `${M}/staff/${S}/../photo-a.webp` semuanya false; `isClipUploadPath(`${M}/${S}/abc-123.gif`, M, S)` true; `${M}/${S}/a.exe`, `${M}/x/a.gif`, `${M}/${S}/../a.gif` false; `clipPosterPath("m/staff/s/clip-ab.mp4") === "m/staff/s/clip-ab.jpg"`.
  - `staff.test.ts`: masukan `{ role: "  MUA ", bio: "", tags: [" Wisuda "], photo_path: "", show_motion: true }` jadi `{ role: "MUA", bio: null, tags: ["Wisuda"], photo_path: null, show_motion: true }`; `role` 41 karakter ditolak; `bio` 141 ditolak, 140 diterima; enam tag ditolak; `["Wisuda","wisuda"]` ditolak; `["a\nb"]` ditolak; `[""]` ditolak.
- [ ] **Step 2: Jalankan** `npm run test:unit`. Expected: FAIL (ekspor belum ada).
- [ ] **Step 3: Implementasikan** sesuai Interfaces dan Ketentuan.
- [ ] **Step 4: Jalankan** `npm run test:unit && npm run typecheck`. Expected: lulus.
- [ ] **Step 5: Commit**: `git add src/lib/media src/lib/validations/staff.ts src/lib/validations/staff.test.ts` lalu `git commit -m "Tambah batas klip, path media staf, dan skema profil staf"`.

---

### Task 3: Transcode klip di server dan route `/api/staff/clip`

Model: opus.

**Files:**
- Create: `src/lib/media/transcode-clip.ts`, `src/lib/media/transcode-clip.test.ts`, `src/app/api/staff/clip/route.ts`
- Modify: `package.json`, `package-lock.json` (`npm install ffmpeg-static@^5.3.0`), `next.config.ts`, `src/lib/media/purge.ts`, `src/lib/routes.ts`

**Interfaces:**
- Consumes: Task 1 (`staff.motion_path`, bucket `staff-clip-uploads`), Task 2 (`MEDIA_LIMITS`, `validateClipFile`, `CLIP_UPLOAD_BUCKET`, `isClipUploadPath`, `staffMediaPrefix`, `clipPosterPath`), `MEDIA_BUCKET` (`src/lib/media/url.ts`), `createClient` (`src/lib/supabase/server.ts`), `createAdminClient` (`src/lib/supabase/admin.ts`).
- Produces:

```ts
// src/lib/media/transcode-clip.ts  (import "server-only")
/** Pesan galat yang aman ditampilkan ke merchant. */
export class ClipError extends Error {}
export function parseFfmpegDuration(stderr: string): number | null;
export function clipFfmpegArgs(inputPath: string, outputPath: string): string[];
export function posterFfmpegArgs(mp4Path: string, outputPath: string): string[];
export async function transcodeClip(input: Uint8Array): Promise<{
  mp4: Uint8Array; poster: Uint8Array; durationSeconds: number | null;
}>;

// src/app/api/staff/clip/route.ts
export const runtime = "nodejs";
export const maxDuration = 60;
// POST body: { staffId: string (uuid); uploadPath: string }
// 200 { motionPath: string } | 400/401/403/404/422/500 { error: string }
export async function POST(request: Request): Promise<Response>;

// src/lib/routes.ts
staffClipApi: "/api/staff/clip",
```

Ketentuan:
- `clipFfmpegArgs` persis (Keputusan 4, 5):
  `["-hide_banner", "-nostdin", "-protocol_whitelist", "file", "-format_whitelist", "gif,mov,mp4,m4a,3gp,3g2,mj2,matroska,webm", "-max_pixels", "16777216", "-i", inputPath, "-t", "5", "-map", "0:v:0", "-an", "-sn", "-dn", "-vf", "scale=480:480:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=24", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-f", "mp4", "-y", outputPath]`.
- `posterFfmpegArgs`: whitelist yang sama, `-i mp4Path -frames:v 1 -q:v 4 -f image2 -y outputPath`.
- `parseFfmpegDuration`: regex `Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)` pada kemunculan pertama; `N/A` atau tidak ada memberi null.
- `transcodeClip`: `ffmpegPath` dari `import ffmpegPath from "ffmpeg-static"`; null berarti `throw new Error(...)` biasa (galat konfigurasi, bukan `ClipError`). `mkdtemp(join(tmpdir(), "klip-"))`, tulis input, `spawn` dengan `timeout: 45_000`, kumpulkan stderr. Kode keluar bukan 0 atau sinyal: `ClipError("Klip tidak bisa dibaca. Coba berkas lain.")`. Durasi dari stderr transcode. Lalu poster. Keluaran lebih dari `MEDIA_LIMITS.clipMaxBytes`: `ClipError("Gagal memproses klip. Coba lagi.")`. `rm(dir, { recursive: true, force: true })` di `finally`.
- Route, urutan:
  1. Zod body (`staffId: z.uuid()`, `uploadPath: z.string().max(400)`); gagal 400 "Permintaan tidak valid.".
  2. `createClient()` lalu `auth.getUser()`; tanpa user 401 "Silakan masuk lagi.".
  3. Admin: `merchants` `subscription_tier` `.eq("id", user.id)`; bukan `STUDIO` 403 "Fitur staf khusus paket Studio.".
  4. Admin: `staff` `id, motion_path` `.eq("id", staffId).eq("merchant_id", user.id)`; tidak ada 404 "Staf tidak ditemukan.".
  5. `isClipUploadPath(uploadPath, user.id, staffId)` false: 400 "Berkas tidak dikenali. Coba unggah ulang klipnya.".
  6. Mulai `try`: unduh dari `CLIP_UPLOAD_BUCKET` (admin). `validateClipFile({ type: blob.type, size: bytes.length }, null)`; gagal 422 dengan pesannya. `transcodeClip`; lalu `validateClipFile(..., durationSeconds)`; gagal 422. `ClipError` jadi 422 dengan pesannya. Galat lain: `console.error("[staf/klip] ...", { userId, staffId, error })` lalu 500 "Gagal memproses klip. Coba lagi.". `finally`: hapus `uploadPath` dari bucket privat (admin), galatnya hanya dicatat.
  7. Unggah `${staffMediaPrefix(user.id, staffId)}clip-${8 hex acak}.mp4` (`video/mp4`) dan `.jpg` (`image/jpeg`) ke `MEDIA_BUCKET` dengan admin, `upsert: false`.
  8. Admin `update({ motion_path })` `.eq("id", staffId).eq("merchant_id", user.id)`. Gagal: hapus dua berkas baru, 500.
  9. Berhasil: bila `motion_path` lama diawali `staffMediaPrefix(...)`, hapus berkas lama dan `clipPosterPath`-nya. `revalidatePath(ROUTES.staff)`. Balas `{ motionPath }`.
- `next.config.ts`: tambah `serverExternalPackages: ["ffmpeg-static"]` dan `outputFileTracingIncludes: { "/api/staff/clip": ["./node_modules/ffmpeg-static/ffmpeg"] }`, masing-masing dengan komentar satu baris (binary tidak bisa dibundel; `output: "standalone"` harus membawanya).
- `purge.ts`: `purgeMerchantMedia` mengulang daftar dan hapus untuk `MEDIA_BUCKET` dan `CLIP_UPLOAD_BUCKET`, mengembalikan jumlah total. `listMerchantFiles` menerima nama bucket.

- [ ] **Step 1: Pasang dependensi**: `npm install ffmpeg-static@^5.3.0`. Expected: `node -e "console.log(require('ffmpeg-static'))"` mencetak path yang ada.
- [ ] **Step 2: Tulis tes yang gagal** di `transcode-clip.test.ts`:
  - `parseFfmpegDuration("  Duration: 00:00:04.20, start: 0.000000, bitrate: 1 kb/s") === 4.2`; `"Duration: 00:01:02.50,"` jadi `62.5`; `"Duration: N/A, start"` null; `""` null.
  - `clipFfmpegArgs("in", "out")`: indeks `"-format_whitelist"` dan `"-protocol_whitelist"` lebih kecil dari indeks `"-i"`; memuat `"-an"`; `args[args.indexOf("-t") + 1] === "5"`; elemen terakhir `"out"`.
  - Integrasi (fixture dibuat di `mkdtemp` dengan `spawnSync(ffmpegPath, ["-f","lavfi","-i","testsrc=size=320x240:rate=10","-t",N, berkas])`): GIF 2 detik memberi `mp4` dengan byte 4..8 `"ftyp"`, `poster` diawali `0xFF 0xD8`, `durationSeconds` antara 1,9 dan 2,1. GIF 7 detik memberi `durationSeconds > 5`, dan `parseFfmpegDuration` stderr `ffmpeg -i <mp4 hasil>` paling besar 5,05. MP4 dengan audio (`-f lavfi -i sine=duration=2` sebagai input kedua) memberi keluaran yang stderr probe-nya tidak memuat `"Audio:"`. Berkas teks `#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nfile:///etc/passwd\n#EXT-X-ENDLIST\n` yang diberikan sebagai input menolak dengan `ClipError`.
- [ ] **Step 3: Jalankan** `npm run test:unit`. Expected: FAIL (modul belum ada).
- [ ] **Step 4: Implementasikan** `transcode-clip.ts`, route, `next.config.ts`, `purge.ts`, `ROUTES.staffClipApi`.
- [ ] **Step 5: Jalankan** `npm run test:unit && npm run typecheck && npm run lint && npm run build`. Expected: lulus; `ls .next/standalone/node_modules/ffmpeg-static/ffmpeg` ada.
- [ ] **Step 6: Commit**: `git add package.json package-lock.json next.config.ts src/lib/media src/app/api/staff src/lib/routes.ts` lalu `git commit -m "Ubah klip staf ke MP4 bisu di server dengan ffmpeg"`.

---

### Task 4: Jam kosong terdekat per staf

Model: sonnet.

**Files:**
- Modify: `src/lib/booking/slots.ts`, `src/lib/booking/staff-slots.test.ts`, `src/lib/booking/schedule.ts`, `src/lib/booking/schedule.test.ts`
- Create: `src/app/api/slots/nearest/route.ts`

**Interfaces:**
- Consumes: `computeStaffSlots`, `jakartaWallClockToUtc`, `jakartaDateISO`, `StaffSchedule`, `StaffBookedRange`, `AvailabilityWindow`, `FreeSlot`, `loadPublicStaff`, RPC `get_booked_ranges`.
- Produces:

```ts
// src/lib/booking/slots.ts
export const ANY_STAFF_KEY = "any";
export const NEAREST_SLOT_DAYS = 14;
export type NearestSlot = FreeSlot & { dateISO: string };
/** Kunci: id tiap staf, plus ANY_STAFF_KEY. Tanpa staf: hanya ANY_STAFF_KEY. */
export function nearestStaffSlots(params: {
  fromDateISO: string; days: number; durationMinutes: number;
  merchantAvailability: AvailabilityWindow[]; staff: StaffSchedule[];
  bookedRanges: StaffBookedRange[]; now?: Date;
}): Record<string, NearestSlot | null>;

// src/lib/booking/schedule.ts
/** "Hari ini 14:00", "Besok 09:00", "Sab 10:00", null -> "Belum ada jadwal". */
export function nearestSlotText(slot: Pick<NearestSlot, "dateISO" | "label"> | null, todayISO: string): string;

// GET /api/slots/nearest?username=&serviceId=
// 200 { nearest: Record<string, NearestSlot | null> } | 400 | 404 | 500 { error: string }
```

Ketentuan:
- `nearestStaffSlots` memanggil `computeStaffSlots` per hari, per staf (`staffId`) dan sekali untuk "siapa saja" (`staffId: null`), berhenti mencari untuk kunci yang sudah ketemu.
- Route menyalin validasi `username`, `serviceId`, pemuatan merchant, layanan aktif, `availability`, dan `loadPublicStaff` dari `src/app/api/slots/route.ts` (anon, `createPublicClient`). Satu `get_booked_ranges` dari `jakartaWallClockToUtc(today, "00:00")` sampai hari ke-15 pukul 00:00. Tanpa query `date`/`staffId`.
- `nearestSlotText` memakai `Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" })` pada `${dateISO}T12:00:00Z` dan `label` apa adanya.

- [ ] **Step 1: Tulis tes yang gagal.**
  - `staff-slots.test.ts` (gaya yang ada, `now` disuntikkan Senin 2026-11-16 08:00 WIB): staf A jam Senin 09:00-12:00, staf B tanpa jam (ikut usaha Senin sampai Sabtu 09:00-17:00), layanan 60 menit. A punya booking 09:00-10:00 Senin: `nearest[A].label === "10:00"` dan `dateISO === "2026-11-16"`; `nearest.any.label === "09:00"` (B kosong). Staf C dengan jam hanya hari Minggu yang semuanya dibooking: `nearest[C] === null`. `staff: []`: hasil hanya punya kunci `"any"`. `now` 12:30 WIB: A pindah ke Senin berikutnya `"2026-11-23"`.
  - `schedule.test.ts`: `nearestSlotText({dateISO:"2026-11-16",label:"14:00"}, "2026-11-16") === "Hari ini 14:00"`; `"2026-11-17"` jadi `"Besok 09:00"`; `"2026-11-21"` (Sabtu) jadi `"Sab 10:00"`; `null` jadi `"Belum ada jadwal"`.
- [ ] **Step 2: Jalankan** `npm run test:unit`. Expected: FAIL.
- [ ] **Step 3: Implementasikan** fungsi dan route.
- [ ] **Step 4: Jalankan** `npm run test:unit && npm run typecheck && npm run lint`. Expected: lulus. Dengan `npm run dev`: `curl -s "localhost:3000/api/slots/nearest?username=<studio>&serviceId=<id>"` memberi objek dengan kunci `any`.
- [ ] **Step 5: Commit**: `git add src/lib/booking src/app/api/slots/nearest` lalu `git commit -m "Tambah jam kosong terdekat per staf"`.

---

### Task 5: Kartu "Dengan siapa?" di halaman publik

Model: opus.

**Files:**
- Modify: `src/lib/booking/staff.ts`, `src/app/[username]/booking-page-view.tsx`, `src/app/[username]/booking-flow.tsx`, `src/components/booking-page/motion-background.tsx` (pakai hook baru), `src/components/booking-page/fixtures.ts`, `src/app/[username]/booking-page-view.stories.tsx` (story `DenganStaf` memakai data baru)
- Create: `src/components/booking-page/use-motion-allowed.ts`, `src/components/booking-page/staff-picker.tsx`, `src/components/booking-page/staff-picker.stories.tsx`

**Interfaces:**
- Consumes: Task 1 kolom, Task 2 `clipPosterPath`, Task 4 (`NearestSlot`, `ANY_STAFF_KEY`, `nearestSlotText`, `GET /api/slots/nearest`), F6 `motionAllowed`, `publicMediaUrl`, `jakartaDateISO`.
- Produces:

```ts
// src/lib/booking/staff.ts
export type PublicStaff = StaffSchedule & {
  name: string; role: string | null; bio: string | null; tags: string[];
  photoPath: string | null;
  /** null bila show_motion false (Keputusan 8). */
  motionPath: string | null;
};

// src/components/booking-page/use-motion-allowed.ts ("use client")
/** false di server dan render pertama; true bila bukan reduced motion dan bukan hemat data. Mengikuti event change. */
export function useMotionAllowed(): boolean;

// src/components/booking-page/staff-picker.tsx ("use client")
export type StaffOption = {
  id: string; name: string; role: string | null; bio: string | null; tags: string[];
  photoUrl: string | null; motionUrl: string | null; posterUrl: string | null;
};
export type NearestState = "loading" | "error" | Record<string, NearestSlot | null>;
export function StaffPicker(props: {
  staff: StaffOption[]; selectedId: string | null; onSelect: (id: string | null) => void;
  nearest: NearestState; todayISO: string;
  /** Paksa poster; untuk story dan pratinjau, perilakunya sama dengan reduced motion. */
  forceStatic?: boolean;
}): JSX.Element;
export function StaffProfileCard(props: { member: StaffOption; forceStatic?: boolean }): JSX.Element | null;

// booking-flow.tsx
// BookingFlowProps.staff: (StaffOption & { days: DayOfWeek[] })[]
```

Ketentuan:
- `loadPublicStaff` memilih `id, name, role, bio, tags, photo_path, motion_path, show_motion`. `/api/slots` dan booking manual F3 tidak berubah perilakunya.
- `useMotionAllowed`: pindahkan pendeteksian `matchMedia("(prefers-reduced-motion: reduce)")`, `navigator.connection?.saveData === true`, dan `matchMedia("(prefers-reduced-data: reduce)")` dari `motion-background.tsx` ke hook ini, lalu `motion-background.tsx` memakainya (perilaku F6 tidak berubah). Kembalikan `motionAllowed({ reducedMotion, saveData })`.
- `BookingPageView` memetakan `PublicStaff` ke `StaffOption`: `photoUrl = publicMediaUrl(photoPath)`, `motionUrl = publicMediaUrl(motionPath)`, `posterUrl = publicMediaUrl(clipPosterPath(motionPath))`, null bila path null.
- `BookingFlow`: saat langkah 2 aktif, layanan terpilih, dan `staff.length > 0`, ambil `/api/slots/nearest` sekali per `serviceId` dengan `AbortController`; status awal `"loading"`, galat jadi `"error"`. `fieldset` lama diganti `StaffPicker`. `todayISO = jakartaDateISO(new Date())` sekali per render langkah.
- `StaffPicker`: judul `h2` "Dengan siapa?" dan baris kartu `role="radiogroup"` `aria-label="Dengan siapa?"`, gulir horizontal `-mx-4 px-4 overflow-x-auto snap-x`, dengan pola `label` + `input type="radio" name="staf" className="sr-only"` seperti `DateStrip`. Kartu pertama "Siapa saja" (ikon lucide `Users` `aria-hidden`, peran "Paling cepat", kunci `ANY_STAFF_KEY`). Tiap kartu: lebar `w-28`, minimal 44 px, avatar 48 px bulat (`img` `width/height 48`, `alt=""`, `loading="lazy"`, atau huruf awal di `bg-muted`), nama tebal, peran `text-muted-foreground text-xs`, lalu baris jam: `"loading"` "Mencari jam kosong", `"error"` atau kunci tidak ada disembunyikan, selain itu `nearestSlotText`. Terpilih: `border-primary border-2` dan ikon `Check`, sama dengan `DateStrip`. `aria-label` input: `${name}, ${role}, kosong paling cepat ${teks}` (bagian yang kosong dibuang). Fokus `has-[:focus-visible]:ring-3 ring-ring/50`. Sudut `var(--radius)`.
- `StaffProfileCard` (di bawah baris kartu, `aria-live="polite"`, untuk staf terpilih selain "Siapa saja"; null bila `bio`, `tags`, dan `motionUrl` semuanya kosong): `bg-card border-border border`, media 72 x 96 px `object-cover` (hanya bila `motionUrl`): `img` poster bila `!useMotionAllowed() || forceStatic`, selain itu `video` `src={motionUrl} poster={posterUrl} muted autoPlay playsInline preload="metadata" disablePictureInPicture aria-hidden width={72} height={96}`. Lalu `${name}, ${role}`, bio `text-sm text-muted-foreground`, keahlian sebagai chip `bg-muted text-xs`.
- Story `staff-picker.stories.tsx` dalam `BookingPageShell` dengan `sampleTheme("HANGAT")`: `Default` (tiga staf dari fixture, nearest terisi), `TanpaFoto` (huruf awal), `Memuat`, `Gagal`, `DenganProfil` (bio, tag, `posterUrl` dan `photoUrl` SVG data URI dari fixture, `motionUrl` contoh), `ReducedMotion` (`forceStatic`), `Malam` (preset gelap). Fixture staf diberi nama jelas sebagai contoh.

- [ ] **Step 1: Implementasikan** sesuai Interfaces dan Ketentuan.
- [ ] **Step 2: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`, lalu `npm run storybook`: tujuh story jalan tanpa pelanggaran addon a11y; panah kiri/kanan berpindah kartu; `ReducedMotion` tidak punya elemen `video`; `grep -nE "#[0-9a-fA-F]{3,6}|rgb\(" src/components/booking-page/staff-picker*` kosong (kecuali di data URI fixture).
- [ ] **Step 3: Commit**: `git add src/lib/booking/staff.ts "src/app/[username]" src/components/booking-page` lalu `git commit -m "Tampilkan profil, klip, dan jam terdekat di pilihan staf"`.

---

### Task 6: Editor profil staf di dashboard

Model: sonnet.

**Files:**
- Modify: `src/app/dashboard/staf/actions.ts`, `src/app/dashboard/staf/page.tsx`, `src/app/dashboard/staf/staff-manager.tsx`, `src/lib/plans.ts`
- Create: `src/app/dashboard/staf/staff-profile-dialog.tsx`, `src/app/dashboard/staf/staff-profile-dialog.stories.tsx`

**Interfaces:**
- Consumes: Task 2 (`staffProfileSchema`, `StaffProfileInput`, `STAFF_PROFILE_LIMITS`, `isStaffPhotoPath`, `staffMediaPrefix`, `clipPosterPath`, `CLIP_UPLOAD_BUCKET`, `clipUploadExtension`, `validateClipFile`, `MEDIA_LIMITS`), Task 3 (`ROUTES.staffClipApi`, balasan route), Task 5 (`StaffPicker`, `StaffProfileCard`, `StaffOption`), `compressImage`, `captureVideoPoster`, `uploadMedia`, `removeMedia`, `mediaFileName`, `validateImageFile`, `publicMediaUrl`, `resolveTheme`, `themeToCssVars`, `createAdminClient`.
- Produces:

```ts
// actions.ts
export async function updateStaffProfile(id: string, input: StaffProfileInput): Promise<StaffActionResult>;
/** Mengosongkan motion_path (admin, difilter merchant_id) lalu menghapus MP4 dan posternya. */
export async function removeStaffClip(id: string): Promise<StaffActionResult>;
// deleteStaff: setelah baris terhapus, hapus photo_path, motion_path, dan clipPosterPath(motion_path) dari MEDIA_BUCKET.

// staff-profile-dialog.tsx ("use client")
export type StaffProfileRow = {
  id: string; name: string; role: string | null; bio: string | null; tags: string[];
  photo_path: string | null; motion_path: string | null; show_motion: boolean;
};
export function StaffProfileDialog(props: {
  merchantId: string; member: StaffProfileRow; themeStyle: React.CSSProperties; onClose: () => void;
}): JSX.Element;
```

Ketentuan:
- `updateStaffProfile`: `staffProfileSchema`; `photo_path` terisi wajib `isStaffPhotoPath(path, userId, id)` (pesan `PESAN_PATH_TIDAK_VALID`); update dengan klien sesi `.eq("id", id).eq("merchant_id", userId)`; `23514` jadi "Profil tidak valid. Periksa isiannya."; berhasil `done()`.
- `page.tsx` memilih kolom baru, memuat baris `merchant_themes` merchant, dan meneruskan `themeStyle = themeToCssVars(resolveTheme(tier, themeRow))` ke `StaffManager`. `StaffCard` mendapat tombol "Profil" (outline, 44 px) yang membuka dialog. Deskripsi `PageHeader`: "Profil ini tampil di bagian \"Dengan siapa?\" saat pelanggan memilih jadwal."
- Dialog (judul "Profil {nama}", `max-w-3xl`, grid dua kolom mulai `md`):
  - "Foto profil", petunjuk "JPG, PNG, atau WebP. Dipotong persegi.": `validateImageFile`, `compressImage(file, { maxSide: MEDIA_LIMITS.avatarMaxSide, square: true })`, `uploadMedia(staffMediaPrefix(merchantId, id) + mediaFileName("photo", "webp"), blob, "image/webp")`. Draf yang diganti sebelum disimpan langsung dihapus; foto tersimpan lama dihapus setelah `updateStaffProfile` berhasil. Tombol "Hapus foto".
  - "Foto bergerak (opsional)", petunjuk persis "GIF atau video tanpa suara, maks 5 detik, 8 MB. Diubah ke MP4 agar ringan.": `validateClipFile(file, durasi)` dengan durasi dari `captureVideoPoster` untuk video dan null untuk GIF. Unggah dengan `createClient().storage.from(CLIP_UPLOAD_BUCKET).upload(`${merchantId}/${id}/${crypto.randomUUID()}.${ext}`, file, { contentType: file.type, upsert: false })`, lalu `fetch(ROUTES.staffClipApi, { method: "POST", body: JSON.stringify({ staffId, uploadPath }) })`. Selama proses: `Spinner` dan "Mengubah klip ke MP4", tombol lain nonaktif. Galat route tampil `role="alert"` (tidak merah). Klip tersimpan langsung (route menulis `motion_path`); "Hapus klip" memanggil `removeStaffClip`.
  - "Peran" (`maxLength` 40, placeholder "Contoh: Pemilik, MUA"), "Perkenalan singkat" textarea dengan penghitung `{n}/140`, "Keahlian" chip dengan tombol hapus `aria-label="Hapus keahlian {tag}"` dan input "+ Tambah" (Enter menambah, maksimal 5), centang "Tampilkan foto bergerak di halaman booking".
  - Pratinjau "Yang dilihat pelanggan" dalam `div style={themeStyle}`: `StaffPicker` dengan `[draf]`, `selectedId` draf, `nearest={{}}`, lalu `StaffProfileCard` dengan `forceStatic` bila centang mati.
  - Tombol "Simpan profil" (hitam, `Spinner` saat menyimpan) memanggil `updateStaffProfile`; galat per isian di bawah isiannya.
- `plans.ts` Studio: `"Staf dengan jadwal sendiri"` jadi `"Staf dengan jadwal, foto, dan klip sendiri"`.
- Story: `Kosong` (staf baru), `Lengkap` (foto, klip, tag), `MemprosesKlip`, `GagalKlip` (pesan durasi). Aksi diganti fungsi tiruan lewat props atau `fn()`.

- [ ] **Step 1: Implementasikan** sesuai Interfaces dan Ketentuan.
- [ ] **Step 2: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`, lalu `npm run storybook`: empat story jalan tanpa pelanggaran a11y; semua kontrol bisa dengan keyboard; dialog monokrom kecuali kotak pratinjau.
- [ ] **Step 3: Commit**: `git add src/app/dashboard/staf src/lib/plans.ts` lalu `git commit -m "Tambah editor profil staf dengan foto dan klip"`.

---

### Task 7: Verifikasi akhir dan dokumentasi (khusus controller)

Model: controller, tidak didelegasikan.

- [ ] **Step 1:** `npm run docker:test`. Expected: tidak ada baris diawali `FAIL`; t55..t57 `OK`.
- [ ] **Step 2:** `npm run check`. Expected: typecheck, lint, unit test (termasuk tes integrasi ffmpeg), dan build lulus; `.next/standalone/node_modules/ffmpeg-static/ffmpeg` ada.
- [ ] **Step 3:** `npm run storybook`. Expected: story `StaffPicker` (7) dan `StaffProfileDialog` (4) jalan, panel a11y bersih, story latar bergerak F6 tetap bergerak dan bisa dijeda.
- [ ] **Step 4:** Browser, `npm run dev`, merchant Studio uji dengan tiga staf, pada 390 px dan 1280 px:
  - Dashboard `/dashboard/staf`: unggah foto; unggah GIF 3 detik, klip muncul di pratinjau sebagai MP4; unggah video 7 detik ditolak dengan "Durasi klip maksimal 5 detik."; berkas teks berganti nama `.gif` ditolak "Klip tidak bisa dibaca. Coba berkas lain."; di Supabase Studio bucket `staff-clip-uploads` kosong setelah tiap percobaan.
  - Halaman publik, langkah 2: kartu menampilkan foto, peran, dan jam terdekat; memilih staf memunculkan profil dengan klip berputar tanpa suara; tab Network hanya memuat `.mp4` dan `.jpg`, tidak pernah `.gif`. DevTools Rendering "prefers-reduced-motion: reduce" lalu muat ulang: poster tampil dan tidak ada permintaan `.mp4`. Network "Save-Data" (atau `prefers-reduced-data`) sama. Pilihan "Siapa saja" lalu booking tetap berhasil.
- [ ] **Step 5:** Tambah `## 36. Profil staf: foto dan klip` di `docs/DECISIONS.md` (Keputusan 1 sampai 5, 11, 12 dengan alasannya; sesuaikan nomor bila fase lain memakai nomor itu). Perbarui Status di `AGENTS.md` dengan satu paragraf F7: kolom profil di `staff` (`motion_path` hanya ditulis `service_role`), bucket privat `staff-clip-uploads`, route `/api/staff/clip` dengan `ffmpeg-static` (MP4 bisu maksimal 5 detik, poster JPG, GIF tidak pernah disajikan), `/api/slots/nearest`, kartu "Dengan siapa?" di `staff-picker.tsx` yang menghormati reduced motion dan hemat data. Perbarui baris F7 di `docs/superpowers/plans/2026-11-14-marky-roadmap.md` (rencana `2026-11-15-marky-f7-profil-staf.md`, status selesai). Tambahkan `ffmpeg-static` ke catatan dependensi di `docs/SETUP.md` bila berkas itu mendaftar dependensi native.
- [ ] **Step 6:** `graphify update .`
- [ ] **Step 7: Commit**: `git add docs AGENTS.md graphify-out` lalu `git commit -m "Dokumentasikan profil staf F7"`.
