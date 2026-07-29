# Setup

Panduan menjalankan project dari nol. Butuh Node.js 20+ dan satu project
Supabase (cloud atau lokal).

Kalau ingin menjalankan lewat Docker dan melewati instalasi Node lokal, lihat
[DOCKER.md](DOCKER.md) — langkah 2 sampai 5 di bawah tetap berlaku.

## 1. Dependensi

```bash
npm install
```

## 2. Environment

```bash
cp .env.example .env.local
```

Isi nilainya:

| Variabel | Dari mana | Wajib sejak |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Phase 1 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys | Phase 1 |
| `NEXT_PUBLIC_APP_URL` | default `http://localhost:3000` | opsional |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys | Phase 4 |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` | Phase 3 |
| `MIDTRANS_*` / `XENDIT_*` | akun platform/partner gateway | Phase 3 |
| `CRON_SECRET` | `openssl rand -hex 32` | Phase 6 |

### Format API key

Supabase mengganti pasangan anon/service-role JWT dengan **publishable key**
(`sb_publishable_…`) dan **secret key** (`sb_secret_…`). Project ini menerima
keduanya: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` didahulukan, dan
`NEXT_PUBLIC_SUPABASE_ANON_KEY` tetap dipakai kalau yang baru kosong. Begitu
pula `SUPABASE_SECRET_KEY` dengan `SUPABASE_SERVICE_ROLE_KEY`.

Publishable key aman berada di bundle browser — hak aksesnya ditentukan RLS.
Secret key sebaliknya: **melewati seluruh RLS**. Simpan hanya di `.env.local`
dan di environment variable hosting, jangan pernah jadi build arg Docker
(nilainya akan tersimpan permanen di layer image).

## 3. Migration database

Jalankan berurutan di **Supabase Dashboard → SQL Editor**:

1. `supabase/migrations/20260729000100_init_schema.sql`
2. `supabase/migrations/20260729000200_rls_policies.sql`

Atau lewat Supabase CLI kalau project sudah di-link:

```bash
npx supabase db push
```

## 4. Kunci schema `private`

Buka **Project Settings → API → Exposed schemas**. Pastikan isinya hanya
`public` (dan `graphql_public` kalau dipakai). Schema `private` **tidak boleh**
ada di daftar itu — di sanalah token payment gateway merchant disimpan.

## 5. Konfigurasi Auth

**Authentication → URL Configuration**

- Site URL: `http://localhost:3000`
- Redirect URLs: tambahkan `http://localhost:3000/auth/callback`
  (dan URL produksi nanti, misal `https://booka.app/auth/callback`)

**Authentication → Providers → Email**: aktifkan, dan pastikan
"Confirm email" menyala agar Magic Link berfungsi.

**Authentication → Providers → Google**: aktifkan, lalu isi Client ID dan
Client Secret dari Google Cloud Console. Di Google Cloud, daftarkan
`https://<project-ref>.supabase.co/auth/v1/callback` sebagai Authorized
redirect URI.

## 6. Jalankan

```bash
npm run dev
```

Buka http://localhost:3000, klik **Mulai gratis**, masuk lewat email, lalu isi
halaman onboarding.

## Perintah lain

```bash
npm run check
```

Menjalankan typecheck, lint, dan build sekaligus.

## Verifikasi migration secara lokal

Migration diuji terhadap Postgres asli, bukan sekadar dibaca:

```bash
npm run docker:test
```

Jalankan ini setiap kali skema berubah. Rinciannya di [DOCKER.md](DOCKER.md).
