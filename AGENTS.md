<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Booka — Smart Booking & Invoicing SaaS

Platform link-in-bio untuk usaha jasa kecil di Indonesia. Merchant berlangganan
bulanan; DP pelanggan masuk **langsung ke akun payment gateway merchant**, tidak
pernah ditahan platform.

Spesifikasi: `docs/PRD-Smart-Booking-Invoicing-SaaS-V3.md`
Setup: `docs/SETUP.md`
Penyimpangan dari PRD dan alasannya: `docs/DECISIONS.md`

## Status

Phase 1–2 dari PRD bagian 6 sudah selesai (scaffold, skema + RLS, auth,
onboarding, shell dashboard), plus landing page dan penegakan kuota transaksi.
Phase 3–6 belum: halaman dashboard di luar Ringkasan masih berupa
`PhasePlaceholder`.

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

**Bahasa UI: Indonesia.** Komentar kode juga Indonesia. Nama variabel, tabel,
dan kolom tetap Inggris.

**Setiap perubahan skema wajib diuji** dengan `npm run docker:test` sebelum
dianggap selesai. Harness-nya menerapkan seluruh migration ke Postgres asli dan
menguji constraint, trigger, serta hak akses peran `anon`. Tambahkan kasus uji
baru ke `supabase/tests/99_verify.sql` — perhatikan agar constraint lain tidak
menangkap baris uji lebih dulu sehingga labelnya jadi menyesatkan.

## Perintah

```bash
npm run dev            # dev server di host
npm run check          # typecheck + lint + build
npm run docker:dev     # dev server di container, hot reload
npm run docker:test    # terapkan migration ke Postgres asli lalu uji
npm run docker:prod    # build & jalankan image produksi di :3001
npm run docker:down    # hentikan semua container dan hapus volume
```
