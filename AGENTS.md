<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Marky: Smart Booking & Invoicing SaaS

Platform link-in-bio untuk usaha jasa kecil di Indonesia. Merchant berlangganan
bulanan; DP pelanggan masuk **langsung ke akun payment gateway merchant**, tidak
pernah ditahan platform.

Spesifikasi: `docs/PRD-Smart-Booking-Invoicing-SaaS-V3.md`
Setup: `docs/SETUP.md`
Penyimpangan dari PRD dan alasannya: `docs/DECISIONS.md`
Spesifikasi fungsional (use case, fitur, aturan bisnis): `docs/FSD.md`
Kode error dan pemetaannya per lapisan: `docs/ERROR-CODES.md`
Papan desain Claude Design (mengikat untuk teks, tata letak, keadaan UI): `docs/design/`

## Status

Phase 1–2 dari PRD bagian 6 sudah selesai (scaffold, skema + RLS, auth,
onboarding, shell dashboard), plus landing page dan penegakan kuota transaksi.
Phase 3–6 juga sudah selesai: semua halaman dashboard (booking masuk,
layanan, ketersediaan, pembayaran, pengaturan, billing) sudah jadi
implementasi sungguhan, bukan lagi `PhasePlaceholder`.

Kustomisasi halaman publik sudah selesai: tema preset plus penyetelan token,
foto profil dan background lewat Supabase Storage, tipografi kurasi, galeri
gambar/video per layanan (bisa dilampirkan sejak layanan pertama kali dibuat,
tidak harus lewat Ubah setelah tersimpan), dan FAQ yang hilang sepenuhnya saat
kosong. Editornya di `/dashboard/halaman`. Spek dan rencananya di
`docs/superpowers/`.

`/onboarding` kini wizard interaktif (bidang usaha, layanan pertama, jam
buka, identitas) yang langsung menyiapkan halaman booking siap pakai, diakhiri
layar sukses lalu tawaran kuesioner opsional dua langkah (ukuran tim +
provinsi, lalu kanal pemesanan + kendala utama + sumber tahu Marky) dengan
tombol "Lewati" yang sama menonjol dengan "Lanjut". Jawabannya masuk tabel
terpisah `merchant_profiles`, tidak pernah bisa diakses `anon`. Merchant lama
yang onboarding sebelum kuesioner ini ada ditawari pertanyaan yang sama lewat
kartu `ProfileNudge` di dashboard. Spek dan rencananya di `docs/superpowers/`.

Kesiapan rilis: halaman `/syarat` dan `/privasi` (identitas penyelenggara di
`src/lib/legal.ts`), unduh data + hapus akun di Pengaturan, robots/sitemap/
gambar OG, dan Sentry (mati tanpa DSN). Notifikasi email (Resend) dan
WhatsApp (gateway self-host WAHA/Evolution atau Fonnte) saat DP dibayar plus
reminder H-1, idempoten lewat `notification_log` — panduan di
`docs/NOTIFIKASI.md`. Fitur Studio: Analitik, multi-staf (kalender per staf,
DECISIONS #28), dan domain sendiri (verifikasi TXT di `_marky.<domain>`, routing
di `src/proxy.ts`, DECISIONS #29). Daftar paket satu sumber di `src/lib/plans.ts`.
Masa awal gratis: merchant baru dan lama bertier STUDIO, flag `EARLY_ACCESS_FREE` (DECISIONS #40).

Redesign mengikuti `DESIGN.md` dan spec `docs/superpowers/specs/2026-11-14-marky-redesign-design.md`.
F1 selesai: `/[username]` kini alur tiga langkah (`BookingFlow` di
`src/app/[username]/booking-flow.tsx`, komponen murni di
`src/components/booking-page/`), dan `/pesanan/[token]` memakai tema merchant.
F2 selesai: cara bayar per layanan (`FULL`, `DEPOSIT`, `ON_SITE`, `REQUEST`),
status `CONFIRMED`/`REQUESTED`, `merchant_settings`, minimum QRIS Rp1.500
(`src/lib/booking/payment-mode.ts` mencerminkan `create_booking`), aksi merchant
di detail booking, dan rute bayar `/api/pesanan/[token]/bayar`.
F3 selesai: dashboard dimulai dari Hari ini, halaman Booking bertab dengan panel
detail (`?b=`), booking manual `/dashboard/bookings/baru`, jadwal ulang oleh
merchant, sidebar berkelompok dan nav bawah HP. Batas anti-spam: 50 booking
manual per 24 jam, 3 jadwal ulang merchant per booking (DECISIONS #31).
F4 selesai: pelanggan bisa ubah jadwal, batal, hubungi merchant, dan atur
pengingat dari `/pesanan/[token]` (rute token di `src/app/api/pesanan/[token]/*`),
pengingat H-1 dan pagi hari H lewat WhatsApp, email, dan web push (VAPID,
`public/sw.js`), kebijakan merchant di Pengaturan (DECISIONS #33).
F5 selesai: voucher publik dan rahasia (`vouchers`, divalidasi `evaluate_voucher`
di dalam `create_booking`, DP dari harga setelah diskon, anon hanya lewat
`public_vouchers`, cek kode lewat `/api/vouchers/check` dengan rate limit) dan
banner promosi (`merchant_banners`, maksimal 3 tayang ditegakkan trigger, gambar
di `{merchant_id}/banner/`), keduanya Pro dan Studio, editor di
`/dashboard/promosi` (DECISIONS #34).
F6 selesai: logo (semua paket), foto sampul, gaya tombol, dan latar bergerak
(Pro dan Studio) di `merchant_themes`, susunan bagian `PROMO`/`SERVICES`/`FAQ`
lewat `section_order` dan `hidden_sections`, latar bergerak penuh di belakang
halaman (`motion-background.tsx`, dimuat malas, mesin `seek(t)` di
`src/lib/theme/motion.ts`, berhenti saat reduced motion, hemat data, tab
tersembunyi, dan punya tombol jeda), editor di `/dashboard/halaman`
(DECISIONS #35).
F7 selesai: profil staf (peran, perkenalan, keahlian, foto, klip) di kolom
`staff` (`motion_path` hanya ditulis `service_role`), bucket privat
`staff-clip-uploads` untuk klip mentah, route `/api/staff/clip` dengan
`ffmpeg-static` (MP4 bisu maksimal 5 detik, poster JPG, GIF tidak pernah
disajikan), `/api/slots/nearest`, dan kartu "Dengan siapa?" di
`staff-picker.tsx` yang menghormati reduced motion dan hemat data
(DECISIONS #36).
F8 selesai: reservasi restoran. `table_mode` di `merchant_settings` (bawaan
`NONE`), layanan reservasi lewat `seat_duration_minutes` dan rentang tamu,
kursi per slot atau per meja dihitung di `create_booking`/`move_booking_slot`
di bawah kunci merchant, `bookings_no_overlap` hanya untuk
`capacity_mode = 'NONE'` plus eksklusi per meja, denah ditulis hanya lewat
`save_dining_layout`, `anon` membaca lewat `get_seat_availability`/
`get_table_status`, editor di `/dashboard/denah` (DECISIONS #37).
F9 selesai: checklist "Panduan memulai" di Hari ini dihitung dari data lewat
`onboarding_state()` (aturan di `src/lib/guide/guide.ts`), progres di
`merchant_onboarding_progress` yang hanya ditulis `save_onboarding_progress`,
tur coachmark Radix `Dialog` dengan target `data-tour`, panel "Panduan halaman
ini" di setiap halaman dashboard. Semua teks di `src/lib/guide/content.ts`
wajib diperbarui saat halaman berubah; `content.test.ts` memeriksa target
(DECISIONS #38).
F10 selesai: landing di route group `(marketing)` dengan token Coral di
`src/components/landing/marketing.css` dan General Sans self-host di
`src/assets/fonts/general-sans/`; teks di `src/lib/marketing/*`, paket dan
perbandingan di `src/lib/plans.ts`; halaman `/untuk/<slug>` dari
`industries.ts` (segmen `untuk` dicadangkan); cek klaim lewat
`/api/username-check` dan RPC `check_username_claim` dengan rate limit; OG,
JSON-LD, dan sitemap dari data yang sama (DECISIONS #39). Semua host di landing
berasal dari `NEXT_PUBLIC_APP_URL`, jadi env itu wajib benar di produksi.

F11 selesai: funnel iklan dan link-in-bio. Tautan pendek `?t=slug` dan halaman
bio di `/dashboard/tautan`, tautan iklan dan pixel (Meta, TikTok, GA4) di
`/dashboard/iklan`, atribusi sentuhan terakhir per sesi tab tanpa cookie,
kejadian `VIEW`/`SERVICE`/`CHECKOUT`/`LINK_CLICK` lewat `/api/events` dengan
batas laju sedangkan `BOOKED` dan `PAID` ditulis server (`create_booking`,
webhook), analitik funnel per kanal, dan ikon WhatsApp opt-in lewat
`merchant_themes.public_whatsapp` (bawaan `false`). Pixel tidak pernah dimuat di
`/pesanan` (DECISIONS #42).
F12 selesai: booking lapangan (padel, futsal, mini soccer, badminton, tenis).
Tabel `courts`, `service_courts`, `court_price_rules`, `court_media`,
`venue_areas`, `venue_markers`; layanan sewa lewat `court_unit_minutes` dengan
lama main pilihan dan harga jam ramai (`court_price` di SQL, `courtPrice()` di
`src/lib/booking/court.ts` mencerminkannya), bentrok dicegah
`bookings_court_no_overlap` per lapangan di bawah kunci merchant. Pelanggan
memilih tanggal, lama main, jam, lalu lapangan di `BookingFlow`; `anon` membaca
lewat RPC `get_court_availability`/`get_court_profiles`, tanpa data pelanggan.
Dashboard di `/dashboard/lapangan` (Jadwal, Lapangan dan denah), `save_court_service`
atomik, onboarding kategori Olahraga, dan landing `/untuk/lapangan`. Pelanggan
tidak bisa pindah ke slot lebih mahal (BK073). Kode BK070 sampai BK073 dan semua
pemetaan error ada di `docs/ERROR-CODES.md` (DECISIONS #43).

Rute auth berbahasa Indonesia: `/masuk`, `/daftar`, `/lupa-password`,
`/reset-password`. Email+password adalah jalur utama; Google dan Magic Link
tetap tersedia.

## Stack

Next.js 16 (App Router) · Tailwind v4 · shadcn/ui (preset radix-nova) ·
Supabase (Postgres + Auth + RLS) · Zod

## Aturan yang mengikat

**Empat klien Supabase, pilih sesuai konteks:**

| Modul | Peran | Untuk |
| --- | --- | --- |
| `lib/supabase/client.ts` | anon/authenticated | komponen client |
| `lib/supabase/server.ts` → `createClient` | authenticated | Server Component, Server Action, Route Handler bersesi |
| `lib/supabase/server.ts` → `createPublicClient` | anon, tanpa sesi | halaman publik `/[username]` |
| `lib/supabase/admin.ts` | service role, **melewati RLS** | `/api/bookings`, webhook, cron, OAuth callback |

`createAdminClient()` tidak punya jaring pengaman. Setiap query dengannya wajib
memfilter `merchant_id` secara eksplisit.

**`getSession()` terlarang, `getUser()` dan `getClaims()` boleh.**
`getSession()` hanya membaca cookie mentah TANPA verifikasi apa pun —
payload-nya bisa dipalsukan siapa pun yang bisa menulis cookie. `getUser()`
dan `getClaims()` sama-sama MEMVERIFIKASI tanda tangan JWT sebelum
mengembalikan identitas user, cuma jalurnya beda: `getUser()` selalu
memanggil server Auth (round-trip jaringan tiap kali), sedangkan
`getClaims()` memverifikasi lokal lewat JWKS project kalau signing key
asimetris aktif (tanpa round-trip), jatuh ke server Auth kalau tidak.
Bedanya bukan cuma jalur jaringan: verifikasi lokal `getClaims()` tidak
tahu kalau sesi sudah dicabut (sign-out, banned, akun dihapus) sampai
token itu `exp`, sedangkan `getUser()` selalu bertanya ke server Auth
sehingga pencabutan langsung ketahuan. Di dashboard ini aman dipakai
karena `getUser()` di `src/lib/supabase/proxy.ts` tetap jalan di setiap
request yang cocok matcher-nya; jangan salin pola `getClaims()` ini ke
Route Handler `/api/*` -- matcher proxy TIDAK mencakup `/api/*`, jadi di
sana wajib verifikasi sendiri. Di Server Component, pakai helper
ber-`cache()` di `src/lib/auth/session.ts` (`getSessionUser()` /
`requireMerchant()`) alih-alih memanggil `getUser()`/`getClaims()`
langsung — supaya layout dan page dalam satu render pass berbagi satu
hasil, bukan masing-masing melakukan round-trip sendiri.

**Perubahan skema butuh migration baru** di `supabase/migrations/`, bukan edit
file lama. Setiap tabel baru di `public` harus di-`REVOKE ALL` dulu dari `anon`
dan `authenticated` — Supabase memberi ALL secara default lewat
`ALTER DEFAULT PRIVILEGES`. Grant per kolom, bukan grant tabel lalu revoke
kolom: di Postgres hak tingkat tabel tidak bisa dipreteli per kolom.

**Fungsi baru tertutup secara default** sejak migration
`20260730000300_lock_down_function_execute.sql` memasang
`alter default privileges ... revoke execute on functions from anon,
authenticated`. Fungsi yang memang harus dipanggil dari klien wajib di-`GRANT
EXECUTE` eksplisit ke peran yang tepat. `REVOKE ... FROM PUBLIC` saja tidak
cukup — itu tidak mencabut grant langsung ke `anon`/`authenticated`.

`src/types/database.ts` harus ikut diperbarui setiap skema berubah. Semua tipe
tabel wajib berupa `type`, **bukan** `interface` — postgrest-js menuntut
`Record<string, unknown>`, dan interface tidak punya index signature implisit
sehingga tipe hasil query diam-diam jadi `never`.

**Setiap segmen tingkat atas baru** (misal `/pricing`) harus ditambahkan ke
`ROUTES` di `src/lib/routes.ts` **dan** ke tabel `reserved_usernames`, karena
berbagi ruang nama dengan `/[username]`.

**Tampilan halaman publik hanya boleh datang dari `resolveTheme()`.** Jangan
menulis warna, ukuran, atau font langsung di komponen
`src/components/booking-page/*` — semuanya lewat CSS custom property dari
`themeToCssVars()`. Komponen di sana dipakai halaman publik DAN preview di
`/dashboard/halaman`; nilai yang ditulis langsung akan membuat keduanya
diam-diam berbeda. `src/lib/theme/fonts.ts` juga tidak boleh diimpor dari kode
murni — `next/font/google` hanya berfungsi di dalam pipeline build Next dan
membuat modul pengimpornya gagal di `npm run test:unit`; data pasangan fontnya
ada di `font-pairs.ts`.

**Bahasa UI: Indonesia.** Komentar kode juga Indonesia. Nama variabel, tabel,
dan kolom tetap Inggris.

**Setiap perubahan skema wajib diuji** dengan `npm run docker:test` sebelum
dianggap selesai. Harness-nya menerapkan seluruh migration ke Postgres asli dan
menguji constraint, trigger, serta hak akses peran `anon`. Tambahkan kasus uji
baru ke `supabase/tests/99_verify.sql` — perhatikan agar constraint lain tidak
menangkap baris uji lebih dulu sehingga labelnya jadi menyesatkan. Bagian uji
bernomor: pakai nomor berikutnya setelah bagian terakhir, jangan pakai ulang label.

**Migration yang sudah di-commit tidak diedit**, walau belum rilis. Saat
membuat ulang fungsi, salin badannya dari definisi terakhir:
`grep -l "function public.<nama>" supabase/migrations/* | sort | tail -1`.
Parameter RPC baru wajib ber-default null, dan migration diterapkan ke
produksi SEBELUM deploy (app baru di skema lama gagal `PGRST202`).

**Setiap error wajib dipetakan**: status HTTP, kode `error` stabil, dan pesan
Indonesia; teks Postgres mentah tidak pernah sampai ke klien. Setiap jalur
error butuh tes positif dan negatif, dan kodenya dicatat di
`docs/ERROR-CODES.md`.

**Tes fake client tidak melihat CHECK/constraint database.** Kolom ber-CHECK
yang ditulis app (misal path Storage) butuh kasus di `99_verify.sql`. Route
Handler diuji lewat seam `handleX(deps)` yang diekspor (pola
`src/app/api/events/route.ts`), klien palsu di `src/lib/testing/fake-supabase.ts`.

**Harga sewa lapangan punya dua sumber yang wajib identik**: `court_price`
(SQL) dan `courtPrice()` (`src/lib/booking/court.ts`), dibulatkan sekali di
akhir. Ubah keduanya bersama tabel kasus yang sama.

## Perintah

```bash
npm run dev            # dev server di host
npm run check          # typecheck + lint + build
npm run docker:dev     # dev server di container, hot reload
npm run docker:test    # terapkan migration ke Postgres asli lalu uji
npm run docker:prod    # build & jalankan image produksi di :3001
npm run docker:down    # hentikan semua container dan hapus volume
npm run storybook      # Storybook di :6006 untuk debug komponen frontend
npm run build-storybook # build statis Storybook
```

- `npm run docker:test` tidak berhenti sendiri dan hanya menjalankan
  `supabase/tests/99_verify.sql`. Tunggu baris "Selesai. Baris diawali FAIL",
  hitung `grep -cE '\|[[:space:]]+FAIL' <log>`, lalu `npm run docker:down`.
  Dua run paralel saling mematikan container.
- Jangan jalankan dua `npm run check`/`next build` bersamaan (bentrok di
  `.next`). Baseline lint: 0 error, sekitar 28 warning lama.
