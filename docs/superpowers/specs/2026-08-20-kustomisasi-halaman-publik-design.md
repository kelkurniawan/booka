# Kustomisasi Halaman Publik Merchant

**Tanggal:** 2026-08-20
**Status:** Disetujui, siap direncanakan
**Ruang lingkup:** Halaman `/[username]`, halaman dashboard baru `/dashboard/halaman`,
editor layanan `/dashboard/services`

## 1. Masalah

Halaman publik tiap merchant saat ini identik: token warna global shadcn, satu
susunan, satu font. Untuk platform link-in-bio, keseragaman itu masalah produk —
merchant memakai halaman ini sebagai etalase di bio Instagram mereka, dan halaman
yang tidak bisa dibedakan dari milik pesaing tidak layak dibagikan.

Halaman juga belum bisa menampilkan bukti visual pekerjaan merchant (foto hasil,
klip singkat) maupun menjawab pertanyaan berulang, sehingga percakapan yang
seharusnya selesai di halaman berpindah ke WhatsApp merchant.

## 2. Hasil yang diinginkan

Merchant dapat menyusun halaman publiknya sendiri — foto profil, tema, warna,
background, tipografi, galeri per layanan, dan FAQ — tanpa pernah bisa
menghasilkan halaman yang tidak terbaca, lambat, atau rusak. Kami tetap
menyediakan tema default yang baik untuk merchant yang tidak ingin mengatur
apa pun.

## 3. Keputusan yang mengikat

| Keputusan | Pilihan | Alasan |
| --- | --- | --- |
| Kedalaman kustomisasi | Preset + token terbatas | Personal tanpa bisa dirusak |
| Batas paket tema | STARTER dapat sebagian | Halaman Starter membawa watermark; halaman itu etalase platform |
| Penyimpanan berkas | Supabase Storage | Satu vendor, izin lewat RLS yang sudah dikuasai, teruji `docker:test` |
| Tipografi | 6 pasangan kurasi + skala teks | `next/font` build-time; nol request pihak ketiga, nol CLS |
| Editor | Preview hidup, komponen bersama | Preview tidak bisa berbeda dari hasil akhir |
| Video layanan | Storage, khusus PRO, dibatasi | Egress video ditanggung platform, bukan merchant |
| FAQ | Terbuka semua tier, maks 10 | Manfaat retensi lebih besar daripada tekanan upgrade |

Penyimpangan dari PRD: PRD bagian 1 menempatkan "Custom Theme" sepenuhnya di
paket Pro. Spesifikasi ini memberi STARTER tiga preset. Wajib dicatat di
`docs/DECISIONS.md` saat implementasi.

## 4. Skema database

Semua perubahan lewat migration baru di `supabase/migrations/`. Setiap tabel
baru `revoke all` dulu dari `anon` dan `authenticated`, lalu grant per kolom.
`src/types/database.ts` ikut diperbarui; semua tipe tabel berupa `type`, bukan
`interface`.

### 4.1 Enum baru

```
theme_preset     BERSIH | HANGAT | MALAM | PASTEL | BERANI | ELEGAN
background_style SOLID | GRADIENT | IMAGE
font_pair        NETRAL | KLASIK | MODERN | HANGAT | TEGAS | RAPI
text_scale       KECIL | SEDANG | BESAR
corner_style     TAJAM | LEMBUT | BULAT
color_mode       TERANG | GELAP
media_kind       IMAGE | VIDEO
```

### 4.2 `public.merchant_themes`

Satu baris per merchant, `merchant_id` sebagai PK sekaligus FK ke `merchants`
(`on delete cascade`). Baris boleh tidak ada — artinya tema default.

| Kolom | Tipe | Constraint |
| --- | --- | --- |
| `merchant_id` | uuid PK FK | |
| `preset` | `theme_preset` not null default `BERSIH` | |
| `accent` | text null | `^#[0-9a-f]{6}$` |
| `background_style` | `background_style` not null default `SOLID` | |
| `background_color` | text null | `^#[0-9a-f]{6}$` |
| `background_image_path` | text null | wajib ada saat `background_style = IMAGE` |
| `background_overlay` | smallint not null default 45 | `between 0 and 80` |
| `font_pair` | `font_pair` not null default `NETRAL` | |
| `text_scale` | `text_scale` not null default `SEDANG` | |
| `corner_style` | `corner_style` not null default `LEMBUT` | |
| `color_mode` | `color_mode` not null default `TERANG` | |
| `created_at`, `updated_at` | timestamptz | trigger `set_updated_at` |

Foto profil tetap memakai `merchants.avatar_url` yang sudah ada dan sudah punya
grant `anon`. Tidak ada kolom baru untuk itu.

### 4.3 `public.service_media`

| Kolom | Tipe | Catatan |
| --- | --- | --- |
| `id` | uuid PK | |
| `service_id` | uuid not null | |
| `merchant_id` | uuid not null | diduplikasi, lihat di bawah |
| `kind` | `media_kind` not null | |
| `path` | text not null | path di bucket |
| `poster_path` | text null | wajib saat `kind = VIDEO` |
| `alt` | text null | maks 120 karakter |
| `width`, `height` | smallint not null | mencegah pergeseran tata letak |
| `sort_order` | integer not null default 0 | |
| `created_at` | timestamptz | |

`services` mendapat `unique (id, merchant_id)`, dan `service_media` mem-FK
`(service_id, merchant_id)` ke pasangan itu dengan `on delete cascade`. Postgres
sendiri yang menjamin media tidak bisa menempel pada layanan milik merchant lain
— tanpa trigger, dan policy RLS cukup membandingkan `merchant_id = auth.uid()`
tanpa join.

### 4.4 `public.merchant_faqs`

| Kolom | Tipe | Constraint |
| --- | --- | --- |
| `id` | uuid PK | |
| `merchant_id` | uuid not null FK cascade | |
| `question` | text not null | 3–200 karakter setelah `trim` |
| `answer` | text not null | 1–1000 karakter setelah `trim` |
| `sort_order` | integer not null default 0 | |
| `created_at`, `updated_at` | timestamptz | trigger `set_updated_at` |

### 4.5 Trigger penegak aturan

Semua `security definer` dengan `set search_path = ''`, mengikuti pola
`enforce_service_limit` yang sudah ada.

1. `enforce_theme_tier` pada insert/update `merchant_themes` — untuk merchant
   `STARTER`, tolak `preset` di luar `BERSIH|HANGAT|MALAM`, `background_style`
   selain `SOLID`, `accent` non-null, `font_pair` selain `NETRAL`, dan
   `text_scale` selain `SEDANG`.
2. `enforce_service_media_limit` pada insert `service_media` — maks 5 baris
   `IMAGE` per `service_id`, maks 1 baris `VIDEO` per `service_id`, dan
   `kind = VIDEO` ditolak untuk merchant `STARTER`.
3. `enforce_faq_limit` pada insert `merchant_faqs` — maks 10 baris per merchant.

### 4.6 Grant dan RLS

```
revoke all on public.merchant_themes, public.service_media, public.merchant_faqs
  from anon, authenticated;

grant select on <ketiganya> to anon;
grant select, insert, update, delete on <ketiganya> to authenticated;
```

Policy: satu policy baca publik per tabel untuk `anon` (tanpa syarat, karena
seluruh isinya memang publik), dan policy owner-only untuk
`insert`/`update`/`delete` oleh `authenticated` dengan `merchant_id = auth.uid()`
pada `using` maupun `with check`.

Fungsi baru tertutup secara default sejak migration
`20260730000300_lock_down_function_execute.sql`. Tidak ada fungsi di spesifikasi
ini yang dipanggil dari klien, jadi tidak ada `grant execute` yang perlu
ditambahkan. Kalau nanti ada, `revoke from public` saja tidak cukup.

## 5. Supabase Storage

Bucket publik `merchant-media`, dibuat lewat migration:

```
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merchant-media', 'merchant-media', true, 20971520,
        array['image/webp','image/jpeg','image/png','video/mp4','video/webm'])
on conflict (id) do nothing;
```

Pola path:

```
{merchant_id}/avatar-{hash}.webp
{merchant_id}/bg-{hash}.webp
{merchant_id}/svc/{service_id}/{hash}.webp
{merchant_id}/svc/{service_id}/{hash}.mp4
{merchant_id}/svc/{service_id}/{hash}-poster.webp
```

Policy `storage.objects`: `insert`, `update`, `delete` hanya bila
`bucket_id = 'merchant-media'` dan `(storage.foldername(name))[1] = auth.uid()::text`;
`select` publik. Satu aturan itu menutup seluruh pola path di atas.

Batas ukuran dan tipe berkas ditegakkan di setelan bucket, bukan hanya di
browser — pemeriksaan browser bisa dilewati siapa pun yang menembak Storage
langsung. Durasi video (maks ~30 detik) hanya diperiksa di browser; menegakkannya
di server butuh transcoding. Ini celah yang diterima sadar, bukan diabaikan.

### 5.1 Dampak pada harness uji

`supabase/tests/00_supabase_stub.sql` hanya menyediakan schema `auth`,
`extensions`, dan peran Supabase. Tidak ada schema `storage`, sehingga migration
yang menyentuh `storage.objects` akan menggagalkan `npm run docker:test`.

Stub diperluas dengan tiruan minimal: schema `storage`, tabel `storage.buckets`
dan `storage.objects` (kolom seperlunya), dan fungsi `storage.foldername(text)`
yang mengembalikan `text[]`. Alternatifnya — menaruh policy Storage di luar
`supabase/migrations/` dan menerapkannya manual — melanggar aturan AGENTS.md dan
menjadikan policy keamanan satu-satunya bagian sistem yang tidak pernah diuji.

## 6. Resolusi tema

`src/lib/theme/` berisi modul murni tanpa dependensi React, diuji dengan
`node:test` lewat `npm run test:unit`.

### 6.1 `presets.ts`

Enam preset, masing-masing mendefinisikan nilai lengkap: `color_mode`,
`background_color`, `foreground`, `accent`, `border`, `corner_style`, dan
`font_pair`. Tiga preset gratis dipilih agar menutup tiga kutub berbeda —
terang-netral (`BERSIH`), terang-hangat (`HANGAT`), dan gelap (`MALAM`) —
sehingga merchant Starter mana pun menemukan yang cocok, sementara batasnya tetap
terasa jelas.

| Preset | Paket | Sasaran |
| --- | --- | --- |
| `BERSIH` | gratis | default, netral |
| `HANGAT` | gratis | MUA, katering, florist |
| `MALAM` | gratis | fotografer, barber, tato |
| `PASTEL` | PRO | nail art, spa, kelas anak |
| `BERANI` | PRO | studio kreatif, coach |
| `ELEGAN` | PRO | wedding, salon premium |

### 6.2 `resolve.ts`

```
resolveTheme(tier: SubscriptionTier, row: MerchantTheme | null): ResolvedTheme
```

Fungsi murni. Menggabungkan preset dengan penimpaan milik merchant, lalu
**memangkas nilai premium untuk merchant STARTER**. Pemangkasan ini bukan
duplikasi trigger `enforce_theme_tier`: trigger tidak pernah menyala saat
merchant PRO **turun** ke STARTER, karena tidak ada UPDATE pada
`merchant_themes` yang terjadi. Trigger menjaga data tetap bersih saat ditulis;
resolver menjaga tampilan tetap benar saat dibaca.

### 6.3 Penjaga kontras

`accent` menghasilkan dua token berbeda:

- `--accent-fill` — warna mentah pilihan merchant, untuk latar tombol dan blok.
- `--accent-text` — versi yang sudah digelapkan atau dicerahkan sampai rasio
  kontras terhadap latar mencapai minimal 4.5:1.

Merchant tetap mendapat kuning terang yang dia inginkan untuk tombol, tanpa
pernah menghasilkan tulisan yang hilang. Saat `background_style = IMAGE`,
`background_overlay` dipaksa minimal 40 dan warna teks diambil dari preset.

Uji unit wajib mencakup: pemangkasan STARTER, `accent` gelap di atas latar
gelap, `accent` terang di atas latar terang, dan pemaksaan overlay minimum.

### 6.4 `css.ts`

```
themeToCssVars(theme: ResolvedTheme): React.CSSProperties
```

Menghasilkan custom property yang dipasang inline pada satu elemen pembungkus,
di-SSR bersama halaman sehingga tidak ada kedipan:

- Token shadcn: `--background`, `--foreground`, `--card`, `--muted`,
  `--muted-foreground`, `--primary`, `--primary-foreground`, `--border`,
  `--radius`.
- Token tema: `--accent-fill`, `--accent-text`, `--page-overlay`.
- Token font: `--font-sans`, `--font-heading`.
- Token skala teks: `--text-sm`, `--text-base`, `--text-lg`, `--text-xl`,
  `--text-2xl`.

Komponen shadcn membaca token itu lewat `var(--…)`, sehingga ikut berubah tanpa
satu baris pun diubah. Skala teks memakai celah yang sama: di Tailwind v4,
`text-sm` mengompilasi menjadi `font-size: var(--text-sm)`, jadi menimpa
variabel itu di pembungkus menskalakan seluruh utilitas teks di dalamnya. Klaim
ini wajib diverifikasi di implementasi sebelum dijadikan sandaran; kalau tidak
berlaku, jatuh ke rencana cadangan berupa token eksplisit `--fs-*` yang dipakai
komponen `booking-page` lewat `text-[length:var(--fs-body)]`.

Mode gelap: pembungkus mendapat kelas `dark` berdampingan dengan style inline,
karena `@custom-variant dark (&:is(.dark *))` di `globals.css` menyasar
keturunan, bukan elemen itu sendiri.

### 6.5 `fonts.ts`

Enam keluarga lewat `next/font/google`, semuanya `preload: false` dan
`display: "swap"`:

| Pasangan | Judul | Isi |
| --- | --- | --- |
| `NETRAL` | Plus Jakarta Sans 700 | Plus Jakarta Sans 400 |
| `KLASIK` | Playfair Display 600 | Inter 400 |
| `MODERN` | Space Grotesk 700 | DM Sans 400 |
| `HANGAT` | Fraunces 600 | DM Sans 400 |
| `TEGAS` | Space Grotesk 700 | Space Grotesk 400 |
| `RAPI` | Inter 500 | Inter 400 |

Enam pasangan dari enam keluarga; tiap keluarga dipakai ulang sehingga CSS
`@font-face` tetap kecil. `preload: false` berarti tidak ada `<link rel=preload>`;
aturan `@font-face` ikut di CSS rute (murah, teks saja) dan berkas woff2 baru
diunduh untuk keluarga yang benar-benar dirujuk tema itu.

Kelas variabel dipasang di layout rute `[username]` saja, bukan di root layout,
supaya dashboard dan landing tidak ikut menanggungnya. Geist yang sekarang tetap
melayani dashboard dan landing.

Berat huruf mengikuti pasangan dan tidak diekspos terpisah. Ukuran diatur lewat
`text_scale`: `KECIL` 0.9375×, `SEDANG` 1×, `BESAR` 1.125×. Merchant tetap
mendapat kendali ukuran tanpa bisa memproduksi judul 11px.

## 7. Komponen bersama

Tampilan halaman publik dipindahkan ke `src/components/booking-page/`:

- `page-shell.tsx` — pembungkus bertema; menerima `ResolvedTheme`, memasang
  kelas `dark`, style inline, kelas variabel font, dan overlay background.
- `profile-header.tsx` — avatar, nama, bio.
- `service-card.tsx` — nama, harga, durasi, deskripsi, dan galeri.
- `service-gallery.tsx` — strip gulir horizontal `scroll-snap`, rasio 4:3.
- `faq-section.tsx` — accordion; **mengembalikan `null` bila daftar kosong**.

Halaman publik merakit komponen ini di server dengan `BookingSeam` yang asli.
Preview di dashboard merakit komponen yang sama persis di klien, dengan
stand-in mati menggantikan pemilih jadwal — preview tidak boleh menyentuh logika
booking sungguhan. Karena keduanya memakai komponen yang sama dan hanya diberi
CSS variable berbeda, preview tidak bisa berbeda dari hasil akhir.

### 7.1 Galeri

Video, kalau ada, selalu slide pertama, dirender `preload="none"` dengan poster —
nol byte video terunduh sampai pelanggan menekan play. Semua gambar
`loading="lazy"` kecuali gambar pertama pada layanan pertama. Tidak ada lightbox
di versi ini.

Gambar dirender dengan `<img>` biasa, bukan `next/image`: berkasnya sudah
dikompres ke WebP berukuran tetap di browser sebelum diunggah, sehingga
optimisasi gambar Vercel tidak menambah apa pun selain tagihan transformasi.
`width` dan `height` dari database dipasang eksplisit untuk mencegah pergeseran
tata letak.

### 7.2 FAQ

Bila merchant belum mengisi satu pun FAQ, **seluruh bagiannya tidak dirender** —
tidak ada judul, tidak ada ikon, tidak ada accordion kosong, tidak ada tautan
di mana pun. Bukan disembunyikan lewat CSS; memang tidak ada di HTML.

Bila terisi, halaman ikut memancarkan JSON-LD `FAQPage` sehingga pertanyaan dan
jawaban merchant berpeluang tampil langsung di hasil pencarian Google.

## 8. Unggah berkas

Unggahan berjalan **dari browser langsung ke Storage** memakai klien bersesi
(`lib/supabase/client.ts`), sehingga RLS yang menjaga, bukan kode route handler.
Server Action hanya menyimpan path ke database setelah berkas mendarat.

Sebelum diunggah, berkas diproses di browser:

- **Gambar** — dikecilkan ke maks 800px sisi terpanjang, diekspor WebP, target
  ≤400KB untuk avatar/background dan ≤150KB untuk media layanan. Avatar
  di-center-crop otomatis menjadi persegi. `width` dan `height` diambil dari
  canvas.
- **Video** — diperiksa ukuran (≤20MB) dan durasi (≤30 detik). Poster dibuat
  otomatis: klip dimuat ke elemen `<video>` tersembunyi, di-seek ke detik ke-1,
  digambar ke canvas, diekspor WebP. Merchant tidak perlu mengunggah thumbnail
  terpisah.

Tidak ada UI crop interaktif di versi ini. Menambahnya berarti dependensi baru
atau penanganan pointer yang panjang, dengan nilai kecil dibanding sisa fitur.

Berkas lama dihapus saat diganti. Bila penyimpanan baris database gagal setelah
berkas terlanjur terunggah — misalnya trigger menolak video milik merchant
STARTER — berkasnya dihapus di blok catch, supaya tidak ada sampah di bucket.

## 9. Halaman dashboard

### 9.1 `/dashboard/halaman` — "Halaman saya"

Halaman baru yang memiliki segala hal tentang halaman publik. Ditambahkan ke
`ROUTES` di `src/lib/routes.ts` dan ke navigasi dashboard. Bukan segmen tingkat
atas, jadi `reserved_usernames` tidak berubah.

Layar terbagi dua. Kiri panel kontrol berurutan sesuai dampak visualnya:
**Foto profil → Tema → Warna aksen → Background → Font → Ukuran teks → Sudut →
FAQ**. Kanan bingkai ponsel berisi halaman booking yang ikut berubah seketika.
Di layar sempit, preview menjadi tab kedua, bukan dijejalkan ke bawah panel.

Kontrol premium tetap **terlihat** oleh merchant STARTER dalam keadaan terkunci,
dengan lencana "Pro" dan tautan ke `/dashboard/billing`. Menyembunyikannya
berarti merchant tidak pernah tahu ada yang bisa dibeli.

Tombol **Simpan** eksplisit, bukan auto-save: halaman ini etalase yang sedang
dilihat pelanggan, dan merchant harus bisa mencoba-coba tanpa takut pengunjung
melihat percobaannya. Tombol "Lihat halaman saya" membuka `/{username}` di tab
baru.

### 9.2 `/dashboard/services`

Editor layanan yang sudah ada mendapat bagian media: unggah gambar (maks 5),
unggah video (maks 1, terkunci untuk STARTER), pengurutan, dan teks `alt`.
Deskripsi layanan sudah ada dan tidak berubah.

Media diedit di sini, bukan di `/dashboard/halaman`, karena ini tempat merchant
memikirkan "apa yang saya jual" — memisahkannya akan memecah satu pekerjaan
menjadi dua layar.

## 10. Query halaman publik

Tetap tiga round-trip seperti sekarang:

1. `merchants` dengan `merchant_themes` menempel lewat embedding PostgREST.
2. `services` dengan `service_media` menempel lewat embedding.
3. `availability` dan `merchant_faqs` berjalan paralel.

Seluruhnya lewat `createPublicClient()` — bukan `createClient()` — sesuai
`docs/DECISIONS.md` bagian 5. Fungsi pengambil data tetap dibungkus `cache()`
supaya `generateMetadata` dan komponen halaman berbagi satu hasil.

Kegagalan query tetap dibedakan dari "data memang tidak ada", mengikuti pola
yang sudah berlaku di `src/app/[username]/page.tsx`: error dilempar ke error
boundary, bukan ditelan menjadi `notFound()` atau keadaan kosong.

## 11. Pengujian

### 11.1 `supabase/tests/99_verify.sql`

Tambahkan kasus, dengan memastikan tidak ada constraint lain yang menangkap
baris uji lebih dulu sehingga labelnya menyesatkan:

- `anon` boleh `select` ketiga tabel baru; `anon` tidak boleh `insert`/`update`.
- Merchant STARTER ditolak saat menyetel preset premium, `accent`,
  `background_style` selain `SOLID`, `font_pair` selain `NETRAL`, dan
  `text_scale` selain `SEDANG`.
- Merchant PRO diterima untuk nilai yang sama.
- `background_overlay` di luar 0–80 ditolak.
- `service_media` yang menunjuk layanan milik merchant lain ditolak oleh FK
  gabungan.
- Gambar keenam pada satu layanan ditolak; video kedua ditolak; video milik
  merchant STARTER ditolak.
- `kind = VIDEO` tanpa `poster_path` ditolak.
- FAQ ke-11 ditolak; `question`/`answer` di luar rentang panjang ditolak.

### 11.2 Uji unit `npm run test:unit`

`src/lib/theme/resolve.test.ts` — pemangkasan STARTER (termasuk kasus turun
paket), penjaga kontras di kedua arah, pemaksaan overlay minimum, dan penggabungan
preset dengan penimpaan.

### 11.3 Gerbang akhir

`npm run docker:test` lalu `npm run check` wajib hijau sebelum pekerjaan
dianggap selesai.

## 12. Yang sengaja tidak masuk

Tata letak alternatif (grid vs daftar), gaya tombol terpisah, ikon media sosial,
domain sendiri, lightbox galeri, UI crop interaktif, tema untuk halaman invoice
`/pesanan/[token]`, dan slider ukuran/berat huruf bebas. Tidak ada satu pun yang
terhalang untuk ditambahkan nanti.

Slider ukuran dan berat huruf bebas ditolak secara sadar: kombinasi seperti judul
weight 400 di 14px atau isi weight 800 akan muncul di halaman nyata, dan tidak
ada cara memperbaikinya selain menghubungi merchantnya satu per satu.
