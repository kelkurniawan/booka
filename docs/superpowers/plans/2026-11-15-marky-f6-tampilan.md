# F6 Tampilan lanjutan: logo, sampul, gaya tombol, urutan bagian, latar bergerak: rencana implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merchant memberi merek halamannya dengan logo, foto sampul, gaya tombol, susunan bagian, dan latar bergerak yang bisa dijeda, semuanya lewat `resolveTheme()` sehingga halaman publik dan preview editor tetap identik.

**Architecture:** Dua migration: yang pertama hanya menambah nilai enum `MOTION`, yang kedua menambah kolom ke `merchant_themes`, constraint, dan memperluas trigger paket. Semua tampilan baru lahir di `resolveTheme()` (logo, sampul, warna tombol, daftar bagian, warna latar bergerak) lalu jadi CSS custom property di `themeToCssVars()`. Latar bergerak adalah pulau klien yang dimuat malas (`next/dynamic`, `ssr: false`) di belakang kepala profil saja; isi kepala duduk di kartu solid. Pola Bentuk memakai mesin `seek(t)` murni yang bisa diuji; tiga pola lain animasi CSS. Semuanya hanya `transform` dan `opacity`.

**Tech Stack:** Next.js 16 App Router, Tailwind v4, Supabase Postgres + Storage, Zod, Storybook 10, `node:test` lewat `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-14-marky-redesign-design.md` bagian 1 (anti-goal gerakan), 2, 5 (F6), 7. Aturan mengikat: `AGENTS.md` (tampilan publik hanya dari `resolveTheme()`/`themeToCssVars()`, `src/lib/theme/fonts.ts` tidak diimpor kode yang diuji unit), `DESIGN.md` bagian 2 dan larangan semua permukaan. Artboard: M2 `TemaEditor.dc.html`, M7 `LatarSetting.dc.html`, B1 `LatarGerak.dc.html`, 06 `Tema.dc.html`. Teks: `python3 .superpowers/design/extract.py .superpowers/design/app/<file>`; mesin gerak dan keyframe CSS ada di blok `<script type="text/x-dc">` dan `<style>` `LatarGerak.dc.html` (diadaptasi dari Barty-Bart/motion-graphics, MIT).

## Prasyarat

F6 dimulai setelah F5 selesai dan di-commit di cabang yang sama. F6 memakai dari F5: `PromoBanners` (`src/components/booking-page/promo-banners.tsx`), `PublicBanner`, `bannerStatus`, `MAX_LIVE_BANNERS` (`src/lib/promo/banner.ts`), opsi `aspect` di `compressImage`, dan letak banner di langkah 1 `BookingFlow`. Bila salah satunya belum ada, berhenti dan lapor.

## Keputusan (spec diam atau bentrok, diputuskan di sini)

1. **Bagian yang bisa disusun: `PROMO`, `SERVICES`, `FAQ`.** Itulah bagian yang benar-benar ada di halaman publik setelah F5. Kepala profil selalu paling atas dan watermark selalu paling bawah. Kontak F4 tidak tampil di `/[username]` (F4 Keputusan 8), jadi bukan bagian. Blok artboard Tautan, Galeri, dan Lokasi tidak dibangun: fiturnya tidak ada, dan galeri sudah melekat per layanan.
2. `SERVICES` tidak bisa disembunyikan (halaman tanpa layanan tidak bisa menerima pesanan). `PROMO` dan `FAQ` bisa. FAQ yang kosong tetap hilang sendiri seperti sekarang.
3. `section_order text[]` disimpan sebagai permutasi persis ketiga kunci, ditegakkan constraint tanpa fungsi (`cardinality = 3`, `<@` dan `@>` daftar kunci, satu dimensi). Pembaca `visibleSections()` tetap menormalkan (buang kunci asing dan duplikat, tambahkan kunci yang hilang di urutan bawaan), supaya fase berikutnya yang menambah bagian cukup memperbarui constraint.
4. **Urutan dirender di dalam `BookingFlow` pada langkah 1**, karena tombol banner (pasang voucher, pilih layanan) memegang state alur. `BookingFlow` menerima `sections` dan `faq` (slot). Di langkah 2 dan 3, FAQ (bila tampil) tetap di bawah alur seperti sekarang. Saat halaman belum menerima pesanan, `BookingPageView` memakai urutan yang sama untuk kartu kosong dan FAQ.
5. **Paket.** Logo dan susunan halaman untuk semua paket (logo menggantikan foto profil yang sudah gratis; urutan tidak bisa merusak keterbacaan). Foto sampul, gaya tombol selain `FILLED`, dan latar `MOTION` untuk Pro dan Studio. Pola penegakan sama dengan tema: trigger `enforce_theme_tier` menjaga tulis, `resolveTheme()` memangkas saat baca. `PLANS` Pro bertambah `{ label: "Foto sampul, gaya tombol, dan latar bergerak" }`.
6. **Trigger kolom baru menolak perubahan, bukan nilai lama.** Untuk `cover_path` dan `button_style`, Starter ditolak hanya bila `tg_op = 'INSERT'` atau nilainya berubah ke nilai premium. Merchant yang turun paket tetap bisa menyimpan bagian lain tanpa harus menghapus sampulnya, dan sampulnya kembali saat naik paket lagi. Mengosongkan sampul selalu boleh. `background_style <> 'SOLID'` tetap aturan lama (mencakup `MOTION`).
7. Logo menggantikan foto profil di kepala halaman bila diisi; `merchants.avatar_url` tetap jadi cadangan. Logo dipotong persegi 512 px WebP (`MEDIA_LIMITS.avatarMaxSide`), sampul dipotong 3:1 lalu 1200 x 400 WebP (`aspect: 3`, `MEDIA_LIMITS.backgroundMaxSide`). Path `{merchant_id}/logo-<acak>.webp` dan `{merchant_id}/cover-<acak>.webp`, constraint path sama dengan `merchant_themes_background_path_scoped`. Batas bucket yang ada (20 MB, tipe gambar) dan `validateImageFile` (12 MB mentah) dipakai ulang; tidak ada aturan bucket baru.
8. **Berkas tema lama dihapus hanya setelah penyimpanan berhasil.** Unggahan yang belum disimpan dan lalu diganti lagi langsung dihapus (belum pernah publik). Ini juga memperbaiki perilaku lama: background lama sekarang dihapus sebelum tema disimpan, sehingga halaman publik bisa menunjuk berkas yang sudah hilang.
9. **Gaya tombol hanya untuk satu aksi utama** (`StickyActionBar`, `DESIGN.md` "Satu aksi utama") dan stand-in "Pilih jadwal" di preview, lewat `--button-bg`, `--button-fg`, `--button-border`. `--primary` tidak diubah karena status terpilih (tanggal, jam, kartu layanan) bergantung padanya. Rumus: `FILLED` = isi `accentFill`, teks `accentForeground`, garis `accentFill`. `OUTLINE` = isi `background`, teks dan garis `accentText`. `SOFT` = isi `mixHex(background, accentFill, 0.14)`, teks `ensureContrast(accentFill, isi, 4.5)`, garis = isi.
10. Pemeriksa kontras di editor membaca hasil `resolveTheme()` lewat `buttonContrastMessage()`: teks netral `role="status"`, tanpa chip hijau/kuning (dashboard monokrom).
11. **Latar bergerak mengikuti artboard B1** (diputuskan ulang oleh controller, karena pengguna meminta halaman yang terasa hidup): lapisan gerak `position: fixed` di belakang seluruh halaman (bukan hanya kepala), setinggi layar, di bawah semua konten. Semua teks dan kontrol duduk di permukaan solid (`bg-card`/`bg-background`): kepala profil, kartu layanan, FAQ, bar aksi. Celah antarkartu boleh memperlihatkan gerak. Dengan begitu kontras tetap dihitung terhadap permukaan solid, sama seperti Keputusan awal, tetapi efeknya terlihat di seluruh halaman. Lapisan tetap satu, transform/opacity saja, berhenti saat reduced motion, save-data, tab tersembunyi, dan punya tombol jeda.
12. Warna latar dari tema, tanpa pilihan terpisah: `base = mixHex(background, accentFill, 0.10)`, `shapeA = mixHex(background, accentFill, 0.32)`, `shapeB = mixHex(background, foreground, 0.16)`, `shapeC = card`. Dipasang sebagai `--motion-base`, `--motion-a`, `--motion-b`, `--motion-c`.
13. **Bentuk memakai `seek(t)`**: loop 12 detik, keyframe `easeInOutCubic`, keyframe terakhir sama dengan pertama sehingga `seek(12) = seek(0)`. Morf `border-radius` dari kanvas dibuang karena bukan properti kompositor; yang dianimasikan hanya `translate`, `rotate`, `scale`. Spring tidak dipakai (kanvas pun tidak). Gelombang, Aurora, dan Partikel animasi CSS dari kanvas, `transform` dan `opacity` saja.
14. `SLOW` mengalikan durasi 1,5 (kanvas), `NORMAL` 1. Bawaan `SLOW`.
15. **Berhenti otomatis:** `prefers-reduced-motion: reduce` dan hemat data (`navigator.connection.saveData` atau `prefers-reduced-data: reduce`) menampilkan bingkai diam dan tanpa tombol jeda (tidak ada gerakan untuk dijeda); tab tersembunyi menjeda; tombol jeda 44 px di pojok kanan atas kepala, `aria-pressed`, label "Jeda animasi latar"/"Putar animasi latar", di luar elemen `aria-hidden`. Bentuk melanjutkan dari `t` saat dijeda, tidak melompat. Status jeda tidak disimpan antar kunjungan.
16. Dari M7 dibuang: deteksi baterai lemah (Battery API tidak ada di Safari dan Firefox), pilihan Area (selalu seluruh halaman, Keputusan 11), dan pilihan Warna (selalu dari tema, Keputusan 12). Pengaturan M7 dilipat ke bagian Background editor M2 sebagai pilihan keempat "Bergerak", dengan satu tombol Simpan dan satu preview, bukan halaman terpisah.
17. **Performa:** lapisan gerak dimuat lewat `next/dynamic(..., { ssr: false })` di komponen klien kecil, hanya bila tema `MOTION`. Warna dasar dirender server sebagai `div` absolut, jadi tidak ada pergeseran tata letak saat potongan JS tiba. Anggaran: potongan lapisan gerak paling besar 5 KB gzip, tanpa dependensi npm baru. Bentuk menulis `style.transform` lewat ref sekitar 30 fps, tanpa render ulang React. Sampul `<img>` eager dengan `fetchPriority="high"`, `width`/`height` tetap, dan `aspect-[3/1]`.
18. Susun ulang dengan tombol naik/turun saja; seret dibuang (tombol sudah bisa dengan keyboard dan sentuh).
19. "Ambil dari logo" dibuang: ekstraksi warna dari gambar adalah kode baru yang tidak diminta spec. Pilihan warna aksen tetap seperti editor sekarang.
20. Gambar OG (`opengraph-image.tsx`) dan halaman `/pesanan` tidak berubah, kecuali `StickyActionBar` yang ikut gaya tombol karena variabelnya selalu dipasang.

## Konflik dengan spec atau desain

- Spec F6 menyebut F6 hanya bergantung pada F1, tetapi `section_order` harus memuat banner F5. F6 dijalankan setelah F5 (Prasyarat).
- Artboard B1 menaruh pita gerak 360 px di belakang profil dan layanan; di sini lapisan gerak penuh di belakang halaman dengan konten di permukaan solid (Keputusan 11).
- Kanvas Bentuk memorf `border-radius`; dibuang (Keputusan 13).
- M7 menawarkan baterai lemah, Area, Warna, dan halaman sendiri (Keputusan 16). M2 menawarkan seret, "Ambil dari logo", serta blok Tautan, Galeri, Lokasi (Keputusan 1, 18, 19).
- Teks artboard dengan `·` ditulis ulang tanpa pemisah itu ("Ganti · PNG/JPG, persegi" jadi "PNG, JPG, atau WebP. Dipotong persegi."). Batas "maks 3 MB" diganti batas mentah 12 MB yang ada karena gambar dikecilkan di browser.

## Global Constraints

- Migration baru saja, berurutan: `20261118000100_background_motion_value.sql`, `20261118000200_theme_brand_layout_motion.sql`. Akhiri tiap migration dengan `notify pgrst, 'reload schema';`. Jangan edit migration lama.
- Uji di `supabase/tests/99_verify.sql` bagian 50 sampai 52 (53 dan 54 dicadangkan), label `t50`..`t52`. Lulus berarti tidak ada baris diawali `FAIL` di seluruh `npm run docker:test` (Docker harus jalan: `open -a Docker`).
- `src/types/database.ts` ikut diperbarui, `type` bukan `interface`.
- Tampilan halaman publik dan `src/components/booking-page/*` hanya lewat `var(--...)` dari `themeToCssVars()`; tanpa hex, `rgb(`, atau ukuran font tertulis. Satu-satunya kata warna yang boleh adalah `black` di dalam `mask-image` (topeng alfa, tidak terlihat), dengan komentar satu baris.
- `src/lib/theme/fonts.ts` tidak diimpor modul yang diuji `npm run test:unit`.
- Gerakan hanya `transform` dan `opacity`. Setiap gerakan berjalan lebih dari 5 detik, jadi tombol jeda wajib ada setiap kali gerakan bisa berjalan.
- Larangan `DESIGN.md`: tanpa em dash, tanpa eyebrow, tanpa label kapital berjarak, tanpa `·`, tanpa panah di teks tombol. Target sentuh minimal 44 px, fokus terlihat, semua bisa dengan keyboard. Dashboard tetap monokrom.
- Komponen tampilan baru menerima data dan aksi lewat props dan punya story.
- UI dan komentar berbahasa Indonesia, nama variabel Inggris. Tidak ada langkah deploy.

## Review Focus

1. Merchant Pro dengan sampul, tombol `OUTLINE`, dan latar `MOTION` turun ke Starter: halaman publik tampil polos dengan tombol penuh dan tanpa sampul, logo tetap, dan merchant masih bisa menyimpan perubahan lain (selain background) tanpa galat. Diuji t51d, t51e, dan tes `resolveTheme` di Task 3.
2. Pengunjung dengan "kurangi gerakan", hemat data, atau tab di latar belakang: tidak ada gerakan berjalan; pengunjung biasa bisa menjeda dengan keyboard, dan Bentuk melanjutkan dari posisi jeda. Diuji `motionAllowed` (Task 2), story ReducedMotion (Task 4), dan pemeriksaan browser Task 8.
3. Form yang dimanipulasi mengirim urutan dengan duplikat, kunci asing, kunci hilang, atau menyembunyikan `SERVICES`: aksi menolak dengan pesan terbaca, database menolak `23514`, dan baris lama dengan kunci asing tetap dirender benar. Diuji t50b, tes `themeSchema` (Task 6), dan `visibleSections` (Task 3).
4. Merchant mengganti logo atau sampul lalu tidak menyimpan, atau menyimpan: halaman publik tidak pernah menunjuk berkas yang sudah dihapus, dan unggahan yang tidak dipakai tidak menumpuk. Diuji `replacedMediaPaths` dan `discardableDraftPath` (Task 6).
5. Warna aksen pucat (`#ffe600`) dengan gaya `OUTLINE` atau `SOFT`: teks tombol tetap minimal 4,5:1 dan editor menyebut warna teks disesuaikan. Diuji tes kontras di Task 3.

---

### Task 1: Skema merek, susunan halaman, dan latar bergerak

Model: sonnet.

**Files:**
- Create: `supabase/migrations/20261118000100_background_motion_value.sql`, `supabase/migrations/20261118000200_theme_brand_layout_motion.sql`
- Modify: `supabase/tests/99_verify.sql` (bagian `-- 50. Tema: kolom merek, susunan, gerak (20261118000200)`, `-- 51. Tema: paket untuk kolom baru (20261118000200)`, `-- 52. Tema: hak akses kolom baru (20261118000200)`), `src/types/database.ts`

**Interfaces:**
- Consumes: `public.merchant_themes`, `public.enforce_theme_tier()` (definisi terakhir di `20260820000100_theme_schema.sql`).
- Produces (SQL):

```sql
-- 20261118000100 (berkas sendiri: nilai enum baru tidak bisa dipakai di transaksi yang menambahkannya)
alter type public.background_style add value if not exists 'MOTION';

-- 20261118000200
create type public.button_style as enum ('FILLED', 'OUTLINE', 'SOFT');
create type public.background_motion as enum ('BENTUK', 'GELOMBANG', 'AURORA', 'PARTIKEL');
create type public.motion_speed as enum ('SLOW', 'NORMAL');

alter table public.merchant_themes
  add column logo_path text,
  add column cover_path text,
  add column button_style public.button_style not null default 'FILLED',
  add column section_order text[] not null default array['PROMO', 'SERVICES', 'FAQ'],
  add column hidden_sections text[] not null default '{}',
  add column background_motion public.background_motion not null default 'BENTUK',
  add column background_motion_speed public.motion_speed not null default 'SLOW';
-- constraint (semua bernama, dicek t50b):
--   merchant_themes_logo_path_scoped, merchant_themes_cover_path_scoped:
--     null atau (~ ('^' || merchant_id::text || '/[A-Za-z0-9._/-]+$') and !~ '\.\.')
--   merchant_themes_section_order_valid:
--     array_ndims(section_order) = 1 and cardinality(section_order) = 3
--     and section_order <@ array['PROMO','SERVICES','FAQ'] and section_order @> array['PROMO','SERVICES','FAQ']
--   merchant_themes_hidden_sections_valid:
--     coalesce(array_ndims(hidden_sections), 1) = 1 and hidden_sections <@ array['PROMO','FAQ']
```

- Produces (TS, `src/types/database.ts`): `BackgroundStyle = "SOLID" | "GRADIENT" | "IMAGE" | "MOTION"`, `ButtonStyle = "FILLED" | "OUTLINE" | "SOFT"`, `BackgroundMotion = "BENTUK" | "GELOMBANG" | "AURORA" | "PARTIKEL"`, `MotionSpeed = "SLOW" | "NORMAL"`, `MerchantTheme` + `logo_path: string | null; cover_path: string | null; button_style: ButtonStyle; section_order: string[]; hidden_sections: string[]; background_motion: BackgroundMotion; background_motion_speed: MotionSpeed`. `Insert`/`Update` tabel mengikuti `MerchantTheme` seperti sekarang.

Isi migration kedua:
- Komentar kepala menyebut Keputusan 3, 5, 6, 7.
- `create or replace function public.enforce_theme_tier()` menyalin badan lama utuh, lalu menambah sebelum `return new`:
  - `if new.cover_path is not null and (tg_op = 'INSERT' or new.cover_path is distinct from old.cover_path) then raise exception 'Foto sampul hanya tersedia untuk paket Pro.' using errcode = 'P0001';`
  - `if new.button_style <> 'FILLED' and (tg_op = 'INSERT' or new.button_style is distinct from old.button_style) then raise exception 'Gaya tombol hanya tersedia untuk paket Pro.' using errcode = 'P0001';`
  - Komentar satu baris: kenapa hanya perubahan yang ditolak (Keputusan 6).
- `revoke execute on function public.enforce_theme_tier() from public, anon, authenticated;`
- Tidak ada grant baru: tabel ini memakai grant tingkat tabel (`select` ke `anon`, `select, insert, update, delete` ke `authenticated`) karena seluruh isinya memang publik; kolom baru ikut grant itu. Komentar satu baris menyebut ini.

- [ ] **Step 1: Tulis uji yang gagal** di `99_verify.sql`, memakai `pg_temp.expect_ok`, `expect_fail_code`, dan pola merchant baru seperti bagian 20 (merchant baru `50505050-0000-0000-0000-000000000001` PRO dan `...0002` STARTER, dengan uji pra yang memastikan tier-nya):
  - Bagian 50: t50a insert baris PRO hanya `merchant_id` dan `preset`: `button_style = 'FILLED'`, `section_order = '{PROMO,SERVICES,FAQ}'`, `hidden_sections = '{}'`, `background_motion = 'BENTUK'`, `background_motion_speed = 'SLOW'`, `logo_path` dan `cover_path` null. t50b masing-masing `23514`: `section_order` `'{PROMO,SERVICES}'`, `'{PROMO,PROMO,FAQ}'`, `'{PROMO,SERVICES,KONTAK}'`, `'{PROMO,SERVICES,FAQ,FAQ}'`, `array['PROMO',null,'FAQ']`, `'{{PROMO,SERVICES,FAQ}}'`; `hidden_sections` `'{SERVICES}'` dan `'{GALERI}'`; `logo_path` di folder merchant `...0002`; `cover_path` `'<id>/../x.webp'`; `logo_path` `'<id>/a".webp'`. t50c diterima: `section_order = '{FAQ,PROMO,SERVICES}'`, `hidden_sections = '{PROMO,FAQ}'`, `logo_path = '<id>/logo-ab12cd34.webp'`, `cover_path = '<id>/cover-ab12cd34.webp'`, `background_style = 'MOTION', background_motion = 'GELOMBANG', background_motion_speed = 'NORMAL'`.
  - Bagian 51 (STARTER `...0002`): t51a insert dengan `logo_path` scoped, `section_order = '{FAQ,SERVICES,PROMO}'`, `hidden_sections = '{PROMO}'` diterima. t51b `P0001` untuk masing-masing: `cover_path` scoped, `button_style = 'OUTLINE'`, `background_style = 'MOTION'`. t51c `cover_path = null` dan `button_style = 'FILLED'` diterima. t51d turun paket: merchant PRO `...0001` dengan `cover_path` dan `button_style = 'SOFT'` diubah ke STARTER, lalu `update ... set corner_style = 'BULAT'` diterima dan `cover_path` tetap. t51e masih STARTER: `cover_path` ke path lain `P0001`, `button_style = 'OUTLINE'` `P0001`, `cover_path = null` diterima. Kembalikan `...0001` ke PRO di akhir.
  - Bagian 52: t52a `has_column_privilege('anon', 'public.merchant_themes', c, 'SELECT')` true untuk `logo_path`, `cover_path`, `button_style`, `section_order`, `hidden_sections`, `background_motion`, `background_motion_speed`; `'UPDATE'` false untuk `anon` pada `cover_path`. t52b sebagai `authenticated` dengan klaim `sub` `...0001` (pola bagian 34): update `button_style` miliknya berhasil satu baris; update baris `...0002` mengubah 0 baris.
- [ ] **Step 2: Jalankan** `npm run docker:test`. Expected: migration lama lulus, t50 sampai t52 `FAIL` atau galat kolom tidak ada.
- [ ] **Step 3: Tulis kedua migration** sesuai Interfaces, lalu perbarui `src/types/database.ts`.
- [ ] **Step 4: Jalankan** `npm run docker:test` dan `npm run typecheck`. Expected: tidak ada baris diawali `FAIL`. Typecheck boleh gagal hanya di objek literal `MerchantTheme` yang belum punya kolom baru (`src/components/booking-page/fixtures.ts`, `src/lib/theme/resolve.test.ts`, `src/app/dashboard/halaman/appearance-editor.tsx`); tambahkan nilai bawaan Interfaces di tiga tempat itu supaya typecheck lulus.
- [ ] **Step 5: Commit**: `git add supabase/migrations/20261118000100_background_motion_value.sql supabase/migrations/20261118000200_theme_brand_layout_motion.sql supabase/tests/99_verify.sql src/types/database.ts src/components/booking-page/fixtures.ts src/lib/theme/resolve.test.ts src/app/dashboard/halaman/appearance-editor.tsx` lalu `git commit -m "Tambah kolom logo, sampul, gaya tombol, susunan halaman, dan latar bergerak"`.

---

### Task 2: Mesin gerak murni

Model: opus.

**Files:**
- Create: `src/lib/theme/motion.ts`, `src/lib/theme/motion.test.ts`

**Interfaces:**
- Consumes: `BackgroundMotion`, `MotionSpeed` (Task 1).
- Produces:

```ts
// src/lib/theme/motion.ts  (murni: tanpa DOM, tanpa React; komentar kepala menyebut Barty-Bart/motion-graphics MIT dan Keputusan 13)
export const BENTUK_LOOP_SECONDS = 12;
export const MOTION_SPEED_FACTOR: Record<MotionSpeed, number> = { SLOW: 1.5, NORMAL: 1 };
export const MOTION_LABELS: Record<BackgroundMotion, { label: string; hint: string }>;
export function easeInOutCubic(x: number): number;               // x dijepit ke [0, 1]
export type Keyframe = readonly [seconds: number, value: number];
export function keyframes(keys: readonly Keyframe[]): (t: number) => number;
export type BentukShape = { size: number; rounded: "full" | "soft"; tone: "a" | "b" | "c" };
export const BENTUK_SHAPES: readonly BentukShape[];               // 3 bentuk
export function seekBentuk(t: number): string[];                  // satu string transform per bentuk
export type PartikelDot = { leftPercent: number; size: number; durationSeconds: number; delaySeconds: number; tone: "a" | "c" };
export const PARTIKEL_DOTS: readonly PartikelDot[];                // 14 titik
export function motionAllowed(env: { reducedMotion: boolean; saveData: boolean }): boolean;
```

Data yang mengikat (dari kanvas `LatarGerak.dc.html`, radius dibuang):
- `MOTION_LABELS`: `BENTUK` "Bentuk" / "Bentuk melayang dan berputar pelan"; `GELOMBANG` "Gelombang" / "Ombak pelan di bagian atas"; `AURORA` "Aurora" / "Cahaya lembut bergeser"; `PARTIKEL` "Partikel" / "Titik kecil melayang naik".
- Bentuk 0: `size 150, rounded "full", tone "a"`, x `[[0,40],[4,220],[8,120],[12,40]]`, y `[[0,60],[4,30],[8,150],[12,60]]`, s `[[0,1],[6,1.25],[12,1]]`. Bentuk 1: `120, "soft", "b"`, x `[[0,230],[4,90],[8,260],[12,230]]`, y `[[0,140],[4,190],[8,40],[12,140]]`, s `[[0,1.1],[6,0.85],[12,1.1]]`. Bentuk 2: `90, "full", "c"`, x `[[0,150],[6,10],[12,150]]`, y `[[0,210],[6,100],[12,210]]`, s `[[0,0.8],[3,1.2],[6,0.8],[9,1.2],[12,0.8]]`.
- `seekBentuk(t)`: `t` dibungkus `((t % 12) + 12) % 12`; rotasi `t / 12 * 360`, dikali `-1` untuk bentuk berindeks ganjil; hasil `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${deg.toFixed(1)}deg) scale(${s.toFixed(3)})`.
- `keyframes`: sebelum kunci pertama = nilai pertama, sesudah kunci terakhir = nilai terakhir, di antara dua kunci `lerp(va, vb, easeInOutCubic((t - a) / (b - a)))`.
- Titik ke-`i` (0..13): `size = 6 + (i * 7) % 12`, `leftPercent = ((i * 53) % 370) / 370 * 100`, `durationSeconds = 7 + (i % 5) * 2`, `delaySeconds = -(i * 0.9)`, `tone = i % 3 ? "a" : "c"`.
- `motionAllowed` = `!reducedMotion && !saveData`.

- [ ] **Step 1: Tulis tes yang gagal** di `motion.test.ts`:

```ts
test("easeInOutCubic", () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(0.5), 0.5);
  assert.equal(easeInOutCubic(1), 1);
  assert.equal(easeInOutCubic(0.25), 0.0625);
  assert.equal(easeInOutCubic(-1), 0);
  assert.equal(easeInOutCubic(2), 1);
});

test("keyframes menjepit di luar rentang dan memakai easing di dalamnya", () => {
  const f = keyframes([[0, 0], [4, 100]]);
  assert.equal(f(-1), 0);
  assert.equal(f(2), 50);
  assert.equal(f(1), 6.25);
  assert.equal(f(9), 100);
});

test("seekBentuk loop mulus: seek(12) dan seek(-3) sama dengan seek(0) dan seek(9)", () => {
  assert.deepEqual(seekBentuk(12), seekBentuk(0));
  assert.deepEqual(seekBentuk(24), seekBentuk(0));
  assert.deepEqual(seekBentuk(-3), seekBentuk(9));
  assert.equal(seekBentuk(0)[0], "translate(40.0px, 60.0px) rotate(0.0deg) scale(1.000)");
});

test("seekBentuk hanya transform", () => {
  const pola = /^translate\(-?\d+\.\dpx, -?\d+\.\dpx\) rotate\(-?\d+\.\ddeg\) scale\(\d+\.\d{3}\)$/;
  for (const t of [0, 1.5, 6, 11.9]) {
    const hasil = seekBentuk(t);
    assert.equal(hasil.length, BENTUK_SHAPES.length);
    for (const s of hasil) assert.match(s, pola);
  }
  assert.match(seekBentuk(3)[1], /rotate\(-90\.0deg\)/);
});

test("PARTIKEL_DOTS", () => {
  assert.equal(PARTIKEL_DOTS.length, 14);
  for (const d of PARTIKEL_DOTS) {
    assert.ok(d.leftPercent >= 0 && d.leftPercent < 100);
    assert.ok(d.durationSeconds >= 7);
  }
  assert.deepEqual(PARTIKEL_DOTS[1], { leftPercent: (53 / 370) * 100, size: 13, durationSeconds: 9, delaySeconds: -0.9, tone: "a" });
});

test("motionAllowed", () => {
  assert.equal(motionAllowed({ reducedMotion: false, saveData: false }), true);
  assert.equal(motionAllowed({ reducedMotion: true, saveData: false }), false);
  assert.equal(motionAllowed({ reducedMotion: false, saveData: true }), false);
});
```

- [ ] **Step 2: Jalankan** `npx tsx --conditions=react-server --test src/lib/theme/motion.test.ts`. Expected: FAIL, modul tidak ada.
- [ ] **Step 3: Implementasikan** `motion.ts` sesuai Interfaces dan data mengikat.
- [ ] **Step 4: Jalankan** perintah Step 2. Expected: PASS.
- [ ] **Step 5: Commit**: `git add src/lib/theme/motion.ts src/lib/theme/motion.test.ts` lalu `git commit -m "Tambah mesin gerak seek(t) untuk latar Bentuk"`.

---

### Task 3: `resolveTheme()`, CSS, susunan bagian, dan kontras tombol

Model: sonnet.

**Files:**
- Create: `src/lib/theme/sections.ts`, `src/lib/theme/sections.test.ts`, `src/lib/theme/contrast.ts`, `src/lib/theme/contrast.test.ts`
- Modify: `src/lib/theme/types.ts`, `src/lib/theme/resolve.ts`, `src/lib/theme/resolve.test.ts`, `src/lib/theme/css.ts`, `src/lib/theme/css.test.ts`, `src/components/booking-page/fixtures.ts`

**Interfaces:**
- Consumes: Task 1 tipe, Task 2 `MOTION_SPEED_FACTOR`, `color.ts` (`mixHex`, `ensureContrast`, `contrastRatio`, `relativeLuminance`).
- Produces:

```ts
// src/lib/theme/sections.ts  (harus sama dengan constraint merchant_themes_section_order_valid dan _hidden_sections_valid di 20261118000200)
export const PAGE_SECTIONS = ["PROMO", "SERVICES", "FAQ"] as const;
export type PageSection = (typeof PAGE_SECTIONS)[number];
export const HIDEABLE_SECTIONS = ["PROMO", "FAQ"] as const;
export const SECTION_LABELS: Record<PageSection, string>;   // PROMO "Banner promo", SERVICES "Layanan", FAQ "Pertanyaan umum"
/** Urutan tampil: kunci asing dan duplikat dibuang, yang hilang ditambahkan di urutan bawaan, yang disembunyikan (hanya PROMO/FAQ) dibuang. */
export function visibleSections(order: readonly string[] | null | undefined, hidden: readonly string[] | null | undefined): PageSection[];
/** Urutan lengkap (tanpa memperhatikan hidden), dipakai editor. */
export function normalizeSectionOrder(order: readonly string[] | null | undefined): PageSection[];
export function moveSection(order: readonly PageSection[], section: PageSection, direction: "up" | "down"): PageSection[];

// src/lib/theme/types.ts: ResolvedTheme bertambah
export type ResolvedMotion = {
  preset: BackgroundMotion;
  speed: MotionSpeed;
  base: string; shapeA: string; shapeB: string; shapeC: string;   // Keputusan 12
};
//   logoPath: string | null;        // semua paket
//   coverPath: string | null;       // null untuk STARTER
//   buttonStyle: ButtonStyle;       // FILLED untuk STARTER
//   buttonFill: string; buttonText: string; buttonBorder: string;   // Keputusan 9
//   sections: PageSection[];        // visibleSections(row.section_order, row.hidden_sections)
//   motion: ResolvedMotion | null;  // terisi hanya bila backgroundStyle === "MOTION"

// src/lib/theme/contrast.ts
export function buttonContrastMessage(theme: ResolvedTheme): { adjusted: boolean; message: string };
```

Ketentuan:
- `resolveTheme`: `background_style` `MOTION` untuk STARTER jadi `SOLID` lewat aturan `gayaDiminta` yang ada; untuk PRO, `permukaan` kontras = `background` (kepala duduk di kartu, Keputusan 11). `cover_path` dan `button_style` dipangkas untuk STARTER (komentar menunjuk Keputusan 6: baris lama boleh tetap premium). `logo_path` tidak dipangkas.
- `themeToCssVars`: selalu `--button-bg`, `--button-fg`, `--button-border`. Bila `theme.motion`: `--motion-base`, `--motion-a`, `--motion-b`, `--motion-c`, dan `--motion-factor` (`String(MOTION_SPEED_FACTOR[speed])`).
- `buttonContrastMessage`: rasio = `contrastRatio(buttonText, buttonFill)`, ditulis satu desimal dengan koma. `adjusted` true bila gaya `OUTLINE`/`SOFT` dan `buttonText !== accentFill`. Pesan tidak disesuaikan: `Teks tombol terbaca jelas (kontras 7,2:1). Lolos standar WCAG AA.` Pesan disesuaikan: `Warna aksen kurang kontras untuk teks tombol. Marky otomatis memakai warna teks yang lebih gelap (kontras 7,2:1).` dengan "gelap" atau "terang" menurut luminansi `buttonText` dibanding `accentFill`.
- `fixtures.ts`: `sampleTheme(preset: ThemePreset, ubah: Partial<MerchantTheme> = {}): ResolvedTheme` (baris lama + `...ubah`), supaya story bisa membuat varian gerak, sampul, dan gaya tombol.

- [ ] **Step 1: Tulis tes yang gagal.**
  - `sections.test.ts`: `visibleSections(null, null)` = `["PROMO","SERVICES","FAQ"]`; `visibleSections(["FAQ","X","FAQ"], ["SERVICES","FAQ"])` = `["PROMO","SERVICES"]`; `visibleSections(["SERVICES","FAQ","PROMO"], ["PROMO"])` = `["SERVICES","FAQ"]`; `normalizeSectionOrder(["FAQ"])` = `["FAQ","PROMO","SERVICES"]`; `moveSection(["PROMO","SERVICES","FAQ"], "FAQ", "up")` = `["PROMO","FAQ","SERVICES"]`; memindah yang pertama ke atas dan yang terakhir ke bawah mengembalikan urutan sama.
  - `resolve.test.ts` (tambahkan kolom baru ke `baris()`): baris null memberi `buttonStyle "FILLED"`, `sections` bawaan, `motion null`, `logoPath null`, `coverPath null`. STARTER dengan `cover_path`, `button_style: "OUTLINE"`, `background_style: "MOTION"`, `logo_path: "m/logo-a.webp"`, `section_order: ["FAQ","SERVICES","PROMO"]`, `hidden_sections: ["PROMO"]` memberi `coverPath null`, `buttonStyle "FILLED"`, `backgroundStyle "SOLID"`, `motion null`, `logoPath "m/logo-a.webp"`, `sections ["FAQ","SERVICES"]`. PRO `HANGAT` dengan `MOTION`, `GELOMBANG`, `NORMAL`: `motion.preset "GELOMBANG"`, `motion.speed "NORMAL"`, `motion.base === mixHex(tema.background, tema.accentFill, 0.1)`, `motion.shapeC === tema.card`. Untuk setiap preset x `["FILLED","OUTLINE","SOFT"]` x aksen `[null, "#ffe600", "#808080", "#1f5c45"]`: `contrastRatio(buttonText, buttonFill) >= 4.5`, dan untuk `OUTLINE` juga `contrastRatio(buttonBorder, background) >= 3`.
  - `css.test.ts`: tema `SOLID` punya `--button-bg` dan tidak punya `--motion-base`; tema `MOTION` `SLOW` punya `--motion-factor` `"1.5"` dan `--motion-a`; `NORMAL` `"1"`.
  - `contrast.test.ts`: `BERSIH` `FILLED` → `adjusted false`, pesan diawali `"Teks tombol terbaca jelas (kontras "` dan memuat `":1). Lolos standar WCAG AA."`; `BERSIH` `OUTLINE` aksen `#ffe600` → `adjusted true`, pesan memuat `"lebih gelap"`; `MALAM` `OUTLINE` aksen `#1f5c45` → pesan memuat `"lebih terang"`.
- [ ] **Step 2: Jalankan** `npm run test:unit`. Expected: FAIL pada tes baru.
- [ ] **Step 3: Implementasikan** sesuai Interfaces dan Ketentuan.
- [ ] **Step 4: Jalankan** `npm run test:unit && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**: `git add src/lib/theme src/components/booking-page/fixtures.ts` lalu `git commit -m "Turunkan logo, sampul, gaya tombol, susunan, dan warna gerak dari resolveTheme"`.

---

### Task 4: Komponen latar bergerak

Model: opus.

**Files:**
- Create: `src/components/booking-page/motion-background.tsx`, `src/components/booking-page/motion-background.module.css`, `src/components/booking-page/motion-background-slot.tsx`, `src/components/booking-page/motion-background.stories.tsx`

**Interfaces:**
- Consumes: Task 2 (`seekBentuk`, `BENTUK_SHAPES`, `BENTUK_LOOP_SECONDS`, `PARTIKEL_DOTS`, `MOTION_SPEED_FACTOR`, `motionAllowed`), Task 3 (`ResolvedMotion`, variabel `--motion-*`), `sampleTheme`.
- Produces:

```ts
// motion-background.tsx ("use client")
export type MotionBackgroundProps = {
  preset: BackgroundMotion;
  speed: MotionSpeed;
  /** Paksa bingkai diam; untuk story dan sama perilakunya dengan reduced motion. */
  forceStatic?: boolean;
};
export function MotionBackground(props: MotionBackgroundProps): JSX.Element;
// Merender fragmen: lapisan aria-hidden (absolute inset-0 -z-10 overflow-hidden, mask yang sama dengan warna dasar)
// dan, hanya bila gerakan boleh jalan, tombol jeda (sibling, di luar aria-hidden).

// motion-background-slot.tsx ("use client")
export function MotionBackgroundSlot(props: MotionBackgroundProps): JSX.Element;
// = dynamic(() => import("./motion-background").then((m) => m.MotionBackground), { ssr: false, loading: () => null })
```

Ketentuan:
- Gerbang: `reducedMotion` dari `matchMedia("(prefers-reduced-motion: reduce)")`, `saveData` dari `navigator.connection?.saveData === true` atau `matchMedia("(prefers-reduced-data: reduce)")`, keduanya mengikuti event `change`; `hidden` dari `document.hidden` dan `visibilitychange`. `berjalan = motionAllowed(...) && !forceStatic && !paused && !hidden`. Tombol tampil bila `motionAllowed(...) && !forceStatic`.
- Bentuk: tiga `span` absolut `left-0 top-0` berukuran `size` px, `rounded-full` atau radius 28 px (`soft`), latar `var(--motion-a|b|c)`, `will-change: transform`, transform awal `seekBentuk(0)`. Saat `berjalan`, satu `requestAnimationFrame` menulis `el.style.transform = seekBentuk(t)[i]` lewat ref paling cepat tiap 33 ms; `t = waktuBerjalan / 1000 / MOTION_SPEED_FACTOR[speed]` dengan waktu jeda dan tab tersembunyi tidak dihitung (melanjutkan, tidak melompat). Hentikan frame saat tidak berjalan dan saat unmount.
- Gelombang, Aurora, Partikel: markup dan keyframe dari kanvas `LatarGerak.dc.html` (`waveA`, `drift1`, `drift2`, `rise`, path SVG `viewBox="0 0 1560 200"` tiga gelombang). Isi warna: gelombang 1 `var(--motion-a)`, gelombang 2 `var(--motion-b)`, gelombang 3 `var(--background)`; blob aurora `radial-gradient(circle, var(--motion-a|b|c), transparent 65%)`; titik `var(--motion-a)` atau `var(--motion-c)`, posisi dan durasi dari `PARTIKEL_DOTS` lewat variabel `--d` dan `--l`. Durasi CSS `calc(<detik kanvas>s * var(--motion-factor))`.
- `motion-background.module.css`: keyframe hanya `transform`/`opacity`; kelas animasi hanya di dalam `@media (prefers-reduced-motion: no-preference)`; `.paused * { animation-play-state: paused }`; `.static * { animation: none }`. Kelas `.paused` dipasang bila tidak berjalan, `.static` bila gerakan tidak boleh atau `forceStatic`.
- Tombol jeda: `button type="button"`, `absolute right-2 top-2 z-10 size-11 rounded-full`, `bg-card/85 text-foreground border border-border`, fokus terlihat (`focus-visible:ring-3 ring-ring/50`), ikon lucide `Pause`/`Play` `aria-hidden`, `aria-pressed={paused}`, `aria-label` "Jeda animasi latar" atau "Putar animasi latar".
- Story (dibungkus `BookingPageShell` dan `BookingProfileHeader` dengan `sampleTheme("HANGAT", { background_style: "MOTION", background_motion: X })`; header Task 5 belum ada, jadi story di sini merender `MotionBackground` di kotak `relative h-64` dengan gaya dari `themeToCssVars`): `Bentuk`, `Gelombang`, `Aurora`, `Partikel`, `Malam` (Bentuk di preset gelap), `Normal` (kecepatan `NORMAL`), `ReducedMotion` (`forceStatic`, tanpa tombol). Story header Task 5 menggantikan pembungkus ini.

- [ ] **Step 1: Implementasikan** keempat berkas sesuai Interfaces dan Ketentuan.
- [ ] **Step 2: Verifikasi** `npm run typecheck && npm run lint`, lalu `npm run storybook`: tujuh story jalan; tombol jeda menghentikan dan melanjutkan Bentuk dari posisi yang sama; `ReducedMotion` diam tanpa tombol; di DevTools Rendering "Emulate prefers-reduced-motion: reduce" keempat pola diam dan tombol hilang; `grep -nE "#[0-9a-fA-F]{3,6}|rgb\(" src/components/booking-page/motion-background*` kosong.
- [ ] **Step 3: Commit**: `git add src/components/booking-page/motion-background*` lalu `git commit -m "Tambah lapisan latar bergerak yang bisa dijeda dan dimuat malas"`.

---

### Task 5: Halaman publik: kepala bermerek, gaya tombol, dan susunan bagian

Model: sonnet.

**Files:**
- Modify: `src/components/booking-page/profile-header.tsx`, `src/components/booking-page/sticky-action-bar.tsx`, `src/app/[username]/booking-page-view.tsx`, `src/app/[username]/booking-flow.tsx`, `src/app/[username]/booking-page-view.stories.tsx`, `src/components/booking-page/booking-steps.stories.tsx`, `src/components/booking-page/motion-background.stories.tsx`
- Create: `src/components/booking-page/profile-header.stories.tsx`

**Interfaces:**
- Consumes: Task 3 (`ResolvedTheme.logoPath|coverPath|motion|sections`, `PageSection`, `--button-*`), Task 4 (`MotionBackgroundSlot`), `publicMediaUrl`, F5 `PromoBanners`.
- Produces:

```ts
export function BookingProfileHeader(props: {
  name: string; bio: string | null; avatarUrl: string | null; theme: ResolvedTheme;
}): JSX.Element;

/** Kelas aksi utama; warnanya dari gaya tombol tema (Keputusan 9). */
export const CTA_BUTTON_CLASS: string;
// = "min-h-11 shrink-0 px-5 border-2 border-[var(--button-border)] bg-[var(--button-bg)] text-[var(--button-fg)] hover:bg-[var(--button-bg)] hover:opacity-90"

// BookingFlowProps bertambah:
//   sections: PageSection[];   // theme.sections
//   faq: ReactNode;            // <BookingFaqSection faqs={faqs} />
```

Ketentuan:
- Kepala tanpa gerak: bila `coverPath`, `<img src={publicMediaUrl(coverPath)} alt="" width={1200} height={400} fetchPriority="high" decoding="async" className="aspect-[3/1] w-full object-cover" style={{ borderRadius: "var(--radius)" }}>` lalu avatar `-mt-10` dengan cincin `var(--background)`. Avatar memakai `publicMediaUrl(logoPath)` bila ada, selain itu `avatarUrl`. Teks nama dan bio seperti sekarang.
- (Diganti controller, Keputusan 11) Lapisan gerak dipasang sekali di `BookingPageShell`, bukan di kepala: saat `theme.motion`, shell merender `div` `aria-hidden` `fixed inset-0 -z-10` berwarna `var(--motion-base)` plus `<MotionBackgroundSlot preset speed />` di dalamnya, di bawah semua konten. Kepala profil, kartu layanan, FAQ, dan bar aksi wajib duduk di permukaan solid (`bg-card border-border border`, sudut `var(--radius)`); tidak ada teks langsung di atas lapisan gerak. Tombol jeda melayang di pojok (44px, fokus terlihat) dan tidak menutupi bar aksi. Preview `/dashboard/halaman` memakai shell yang sama sehingga `fixed` dibatasi ke bingkai preview (bungkus preview dengan `transform: translateZ(0)` atau `contain: paint` supaya `fixed` relatif ke bingkai).
- `StickyActionBar` memakai `CTA_BUTTON_CLASS` pada `Button`-nya.
- `BookingFlow` langkah 1 merender `sections` berurutan: `PROMO` = `PromoBanners` F5 (props tetap), `SERVICES` = indikator langkah, judul `#langkah-judul` dengan `headingRef`, strip voucher F5, dan daftar layanan; `FAQ` = slot `faq`. `StickyActionBar` tetap terakhir. Langkah 2 dan 3: indikator, judul, isi langkah, lalu `faq` bila `sections` memuat `FAQ`. Fokus judul saat pindah langkah tetap jalan.
- `BookingPageView`: `BookingProfileHeader` diberi `theme`. Bila menerima pesanan, `BookingFaqSection` tidak lagi dirender di luar alur, melainkan dikirim sebagai `faq` dan `sections={theme.sections}`; `DesktopHandoff` tetap sesudah alur. Bila tidak menerima pesanan, kartu kosong dan FAQ dirender menurut urutan `SERVICES`/`FAQ` di `theme.sections` (`PROMO` dilewati). JSON-LD FAQ dan watermark tidak berubah.
- Story: `profile-header.stories.tsx` (logo, sampul, logo + sampul, `MOTION` tiap pola dengan sampul di Hangat, Malam di preset gelap, `ReducedMotion` lewat story Task 4); `booking-page-view.stories.tsx` tambah `FaqDiAtas` (`section_order: ["FAQ","SERVICES","PROMO"]`), `TanpaPromo` (`hidden_sections: ["PROMO"]`), `TombolGaris` dan `TombolLembut` (`button_style`), `LatarBergerak`. Gambar contoh memakai cara yang sama dengan media layanan di `fixtures.ts`. `motion-background.stories.tsx` diganti merender `BookingProfileHeader` di `BookingPageShell` dengan pola yang sama, termasuk story `ReducedMotion` (`MotionBackground forceStatic` di dalam kepala yang sama).

- [ ] **Step 1: Implementasikan** sesuai Ketentuan. Cari semua pemanggil dengan `grep -rn "BookingProfileHeader\|BookingFlow " src` dan perbarui semuanya (preview editor diubah di Task 7; untuk sementara teruskan `theme` di `preview-frame.tsx`).
- [ ] **Step 2: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`, lalu `npm run storybook`: story baru di 390 px dan 1280 px; urutan `FaqDiAtas` benar di langkah 1 dan FAQ pindah ke bawah di langkah 2; tombol aksi ketiga gaya terbaca di Bersih, Malam, Elegan; kepala bergerak tidak menggeser tata letak saat lapisan tiba (bandingkan posisi nama sebelum dan sesudah muat); `grep -nE "#[0-9a-fA-F]{3,6}|rgb\(" src/components/booking-page/profile-header.tsx src/components/booking-page/sticky-action-bar.tsx` kosong.
- [ ] **Step 3: Commit**: `git add src/components/booking-page "src/app/[username]" src/app/dashboard/halaman/preview-frame.tsx` lalu `git commit -m "Tampilkan logo, sampul, gaya tombol, dan susunan bagian di halaman booking"`.

---

### Task 6: Validasi, aksi simpan, dan pembersihan berkas tema

Model: haiku.

**Files:**
- Create: `src/app/dashboard/halaman/theme-media.ts`, `src/app/dashboard/halaman/theme-media.test.ts`
- Modify: `src/lib/validations/theme.ts`, `src/lib/validations/theme.test.ts`, `src/app/dashboard/halaman/actions.ts`, `src/app/dashboard/halaman/appearance-state.ts`

**Interfaces:**
- Consumes: Task 1 tipe, Task 3 `PAGE_SECTIONS`, `HIDEABLE_SECTIONS`, `isScopedMediaPath`, `PESAN_PATH_TIDAK_VALID`.
- Produces:

```ts
// src/lib/validations/theme.ts: themeSchema bertambah
//   background_style: z.enum(["SOLID", "GRADIENT", "IMAGE", "MOTION"])
//   logo_path: teksOpsional, cover_path: teksOpsional
//   button_style: z.enum(["FILLED", "OUTLINE", "SOFT"])
//   background_motion: z.enum(["BENTUK", "GELOMBANG", "AURORA", "PARTIKEL"])
//   background_motion_speed: z.enum(["SLOW", "NORMAL"])
//   section_order: string berkoma -> permutasi persis PAGE_SECTIONS, pesan "Susunan halaman tidak lengkap. Muat ulang halaman lalu coba lagi."
//   hidden_sections: string berkoma (boleh kosong) -> subset unik HIDEABLE_SECTIONS, pesan "Bagian Layanan selalu tampil."

// src/app/dashboard/halaman/appearance-state.ts
//   fieldErrors kunci bertambah: "logo_path" | "cover_path" | "section_order"

// src/app/dashboard/halaman/theme-media.ts
export type ThemeMediaKey = "background_image_path" | "logo_path" | "cover_path";
export const THEME_MEDIA_KEYS: readonly ThemeMediaKey[];
type ThemeMedia = Pick<MerchantTheme, ThemeMediaKey>;
/** Path tersimpan yang tidak lagi dipakai setelah penyimpanan berhasil; aman dihapus (Keputusan 8). */
export function replacedMediaPaths(saved: ThemeMedia, next: ThemeMedia): string[];
/** Path draf yang belum pernah tersimpan dan akan ditimpa unggahan baru; aman dihapus sekarang. */
export function discardableDraftPath(saved: ThemeMedia, draft: ThemeMedia, key: ThemeMediaKey): string | null;
```

Ketentuan `updateTheme`:
- Ambil tujuh field baru dari `formData` (`logo_path`, `cover_path` dengan `?? ""`; `section_order`, `hidden_sections` dengan `?? ""`).
- Path `logo_path` dan `cover_path` yang terisi diperiksa `isScopedMediaPath(path, user.id)` seperti `background_image_path`, dengan `fieldErrors` kunci masing-masing.
- Upsert seluruh `parsed.data`. Pesan `P0001` dari trigger diteruskan apa adanya lewat `pesanDariError` yang ada.

- [ ] **Step 1: Tulis tes yang gagal.**
  - `theme.test.ts` (pakai objek masukan lengkap yang sudah lulus, ubah satu field): `section_order: "FAQ,PROMO,SERVICES"` jadi array tiga; `"PROMO,SERVICES"`, `"PROMO,PROMO,FAQ"`, `"PROMO,SERVICES,KONTAK"` ditolak dengan pesan Susunan; `hidden_sections: ""` jadi `[]`; `"SERVICES"` ditolak dengan pesan "Bagian Layanan selalu tampil."; `"FAQ,FAQ"` ditolak; `background_style: "MOTION"` diterima; `button_style: "GARIS"` ditolak; `logo_path: ""` jadi null.
  - `theme-media.test.ts`: `replacedMediaPaths({background_image_path:"m/bg-1.webp", logo_path:"m/logo-1.webp", cover_path:null}, {background_image_path:"m/bg-1.webp", logo_path:"m/logo-2.webp", cover_path:"m/cover-1.webp"})` = `["m/logo-1.webp"]`; menghapus sampul (`cover_path` tersimpan ke null) mengembalikan path sampul lama; nilai sama mengembalikan `[]`. `discardableDraftPath` mengembalikan path draf bila berbeda dari yang tersimpan dan tidak null, null bila draf sama dengan yang tersimpan atau null.
- [ ] **Step 2: Jalankan** `npm run test:unit`. Expected: FAIL pada tes baru.
- [ ] **Step 3: Implementasikan** sesuai Interfaces dan Ketentuan.
- [ ] **Step 4: Jalankan** `npm run test:unit && npm run typecheck`. Expected: PASS (editor belum mengirim field baru; typecheck tetap lulus karena aksi membaca `formData`).
- [ ] **Step 5: Commit**: `git add src/lib/validations src/app/dashboard/halaman/theme-media.ts src/app/dashboard/halaman/theme-media.test.ts src/app/dashboard/halaman/actions.ts src/app/dashboard/halaman/appearance-state.ts` lalu `git commit -m "Validasi dan simpan logo, sampul, gaya tombol, susunan, dan latar bergerak"`.

---

### Task 7: Editor tampilan dan preview

Model: sonnet.

**Files:**
- Create: `src/app/dashboard/halaman/brand-fields.tsx`, `src/app/dashboard/halaman/button-style-field.tsx`, `src/app/dashboard/halaman/motion-fields.tsx`, `src/app/dashboard/halaman/section-order-field.tsx`, `src/app/dashboard/halaman/appearance-fields.stories.tsx`
- Modify: `src/app/dashboard/halaman/appearance-editor.tsx`, `src/app/dashboard/halaman/preview-frame.tsx`, `src/app/dashboard/halaman/page.tsx`, `src/lib/plans.ts`

**Interfaces:**
- Consumes: Task 2 `MOTION_LABELS`, Task 3 (`resolveTheme`, `buttonContrastMessage`, `SECTION_LABELS`, `normalizeSectionOrder`, `moveSection`, `HIDEABLE_SECTIONS`), Task 5 (`BookingProfileHeader` dengan `theme`, `CTA_BUTTON_CLASS`), Task 6 (`updateTheme`, `replacedMediaPaths`, `discardableDraftPath`), F5 (`PromoBanners`, `PublicBanner`, `bannerStatus`, `MAX_LIVE_BANNERS`), `compressImage` dengan `aspect`.
- Produces:

```ts
export function BrandFields(props: {
  logoUrl: string | null; coverUrl: string | null;
  busy: "logo" | "cover" | null;
  coverLocked: boolean;            // STARTER: unggah sampul dikunci, Hapus tetap boleh
  onUpload: (kind: "logo" | "cover", file: File) => void;
  onRemove: (kind: "logo" | "cover") => void;
}): JSX.Element;

export function ButtonStyleField(props: {
  value: ButtonStyle; locked: boolean; theme: ResolvedTheme; onChange: (value: ButtonStyle) => void;
}): JSX.Element;

export function MotionFields(props: {
  motion: BackgroundMotion; speed: MotionSpeed;
  onMotionChange: (value: BackgroundMotion) => void; onSpeedChange: (value: MotionSpeed) => void;
}): JSX.Element;

export function SectionOrderField(props: {
  order: PageSection[]; hidden: PageSection[];
  hints: Record<PageSection, string>;
  onChange: (next: { order: PageSection[]; hidden: PageSection[] }) => void;
}): JSX.Element;

// AppearancePreview props bertambah: banners: PublicBanner[]
// AppearanceEditor props bertambah: banners: PublicBanner[]
```

Ketentuan:
- `page.tsx`: bila tier bukan `STARTER`, ambil `merchant_banners` (kolom `PublicBanner` + `published`) milik merchant, urut `sort_order` lalu `created_at`, saring `bannerStatus(b, Date.now()) === "Tayang"`, ambil `MAX_LIVE_BANNERS`. Gagal baca: `console.error` dan `[]`.
- `appearance-editor.tsx`: `TEMA_KOSONG` dan inisialisasi draf memuat tujuh kolom baru (bawaan Task 1). Hidden input: `logo_path`, `cover_path`, `button_style`, `background_motion`, `background_motion_speed`, `section_order` (`order.join(",")`), `hidden_sections` (`hidden.join(",")`). `unggahGambar` menerima `"logo" | "cover"`: logo `compressImage(file, { maxSide: MEDIA_LIMITS.avatarMaxSide, square: true })` prefiks `logo`, sampul `{ maxSide: MEDIA_LIMITS.backgroundMaxSide, square: false, aspect: 3 }` prefiks `cover`; path draf diganti, dan `discardableDraftPath` untuk kunci itu dihapus segera. Untuk background, penghapusan langsung berkas lama diganti aturan yang sama. `kirimTema` menangkap `temaTersimpan` sebelum berangkat; setelah sukses `removeMedia(replacedMediaPaths(tersimpanLama, snapshot))`.
- Bagian baru di panel, berurutan setelah "Foto profil": "Merek" (`BrandFields`; teks Logo "PNG, JPG, atau WebP. Dipotong persegi.", Foto sampul "Dipotong ke rasio 3:1, 1200 x 400 px."; tombol "Unggah", "Ganti", "Hapus"; `GemboksPro` di Foto sampul untuk Starter). "Gaya tombol" setelah "Sudut": segmen Penuh, Garis, Lembut (`FILLED`, `OUTLINE`, `SOFT`), `GemboksPro` untuk Starter, di bawahnya `buttonContrastMessage(temaJadi).message` sebagai teks kecil `text-muted-foreground` `role="status"`. "Background": `GAYA_LATAR` bertambah `{ nilai: "MOTION", label: "Bergerak" }`; saat terpilih tampil `MotionFields`: kartu Pola (radiogroup, label dan hint `MOTION_LABELS`), segmen Kecepatan Pelan/Normal, dan teks `Pelanggan melihat tombol jeda di pojok kepala halaman. Gerakan berhenti sendiri saat "kurangi gerakan" atau hemat data aktif, dan saat tab tidak dilihat.` "Susunan halaman" sebelum tombol Simpan: deskripsi `Atur urutan bagian di bawah profil. Tombol pesan selalu tampil di bawah layar.`; tiap baris label, hint, tombol ikon `ChevronUp`/`ChevronDown` `size-11` (`aria-label` "Naikkan <label>"/"Turunkan <label>", dinonaktifkan di ujung), dan `Switch` "Tampil" (`aria-label` "Tampilkan <label>"; untuk `SERVICES` dinonaktifkan). Hint: `PROMO` Starter "Banner promo tersedia di paket Pro", selain itu "<n> banner tayang" atau "Belum ada banner tayang"; `SERVICES` "Selalu tampil"; `FAQ` "<n> pertanyaan" atau "Kosong, otomatis tersembunyi".
- `preview-frame.tsx` merender `theme.sections` berurutan: `PROMO` = `PromoBanners` dengan `voucherCodeById={{}}`, `activeServiceIds` dari layanan, aksi kosong; `SERVICES` = blok layanan yang ada dengan stand-in "Pilih jadwal" memakai `CTA_BUTTON_CLASS`; `FAQ` = `BookingFaqSection`. `BookingProfileHeader` diberi `theme`.
- `plans.ts`: fitur Pro bertambah `{ label: "Foto sampul, gaya tombol, dan latar bergerak" }` (Keputusan 5).
- `appearance-fields.stories.tsx`: `BrandFields` (kosong, terisi, sedang mengunggah, sampul terkunci), `ButtonStyleField` (tiga gaya, aksen pucat disesuaikan), `MotionFields`, `SectionOrderField` (bawaan, FAQ di atas, promo disembunyikan).

- [ ] **Step 1: Implementasikan** sesuai Ketentuan.
- [ ] **Step 2: Verifikasi** `npm run typecheck && npm run lint && npm run test:unit`, lalu `npm run storybook` untuk story baru di 390 px dan 1280 px (target 44 px, fokus terlihat, semua bisa dengan keyboard). Lalu `npm run dev`, masuk sebagai merchant Pro: unggah logo dan sampul, pilih Garis dan Bergerak/Gelombang, pindahkan FAQ ke atas, simpan; preview dan `/<username>` identik; ganti sampul tanpa menyimpan lalu ganti lagi, lalu simpan: hanya satu berkas sampul tersisa di folder merchant (cek Storage). Merchant Starter: sampul, gaya tombol, dan Bergerak terkunci, logo dan susunan bisa disimpan.
- [ ] **Step 3: Commit**: `git add src/app/dashboard/halaman src/lib/plans.ts` lalu `git commit -m "Tambah editor merek, gaya tombol, latar bergerak, dan susunan halaman"`.

---

### Task 8: Verifikasi akhir dan dokumentasi (khusus controller)

Model: controller (tidak didelegasikan).

- [ ] **Step 1:** `open -a Docker` lalu `npm run docker:test`. Expected: tidak ada baris diawali `FAIL`, termasuk t50 sampai t52 dan bagian 20 lama.
- [ ] **Step 2:** `npm run check`. Expected: typecheck, lint, unit test, dan build lulus. Lalu periksa anggaran (Keputusan 17): `f=$(grep -rl "Jeda animasi latar" .next/static/chunks); echo "$f"; gzip -c $f | wc -c`. Expected: tepat satu berkas, paling besar 5120 byte. Jalankan `npm run start`, lalu `curl -s localhost:3000/<username-tema-solid> | grep -c "$(basename "$f")"`. Expected: `0` (potongan gerak tidak ikut halaman tanpa latar bergerak).
- [ ] **Step 3:** `npm run build-storybook`. Expected: lulus; story tiap pola (Bentuk, Gelombang, Aurora, Partikel), Malam, Normal, dan ReducedMotion ada.
- [ ] **Step 4: Browser** pada 390 px dan 1280 px, halaman publik merchant Pro dengan sampul dan latar bergerak untuk keempat pola: tombol jeda bisa dijangkau Tab, menghentikan dan melanjutkan gerakan, `aria-pressed` berubah; emulasi `prefers-reduced-motion: reduce` membuat latar diam dan tombol hilang; berpindah tab lalu kembali tidak membuat Bentuk melompat; tidak ada pergeseran tata letak saat lapisan tiba (Performance panel: CLS 0 dari lapisan); LCP tetap sampul atau judul, bukan lapisan gerak; semua teks kepala duduk di kartu solid. Editor `/dashboard/halaman` di kedua lebar: preview sama dengan halaman publik setelah simpan, susunan dan gaya tombol ikut berubah.
- [ ] **Step 5:** Tambah `## 35. Tampilan lanjutan: merek, susunan, latar bergerak` di `docs/DECISIONS.md` (Keputusan 1, 4, 5, 6, 8, 11, 13, 15, 17 dengan alasannya; sesuaikan nomor bila F4/F5 memakai nomor lain). Perbarui bagian Status di `AGENTS.md` dengan satu paragraf F6: logo (semua paket), foto sampul, gaya tombol, dan latar bergerak (Pro dan Studio) di `merchant_themes`, susunan bagian `PROMO`/`SERVICES`/`FAQ` lewat `section_order` dan `hidden_sections`, latar bergerak di belakang kepala profil (`motion-background.tsx`, dimuat malas, mesin `seek(t)` di `src/lib/theme/motion.ts`, berhenti saat reduced motion, hemat data, tab tersembunyi, dan punya tombol jeda), editor di `/dashboard/halaman`. Perbarui baris F6 di `docs/superpowers/plans/2026-11-14-marky-roadmap.md` (rencana `2026-11-15-marky-f6-tampilan.md`, status selesai di cabang F6).
- [ ] **Step 6:** `graphify update .`, lalu commit dokumentasi: `git add docs/DECISIONS.md AGENTS.md docs/superpowers/plans/2026-11-14-marky-roadmap.md graphify-out` dan `git commit -m "Catat F6 selesai di status, keputusan, dan roadmap"`.
