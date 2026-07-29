# Booka

Platform booking dan invoicing untuk usaha jasa kecil di Indonesia — MUA,
fotografer, dan sejenisnya.

Merchant menyewa sistemnya bulanan dan menghubungkan akun payment gateway
miliknya sendiri. DP pelanggan masuk langsung ke akun merchant; platform tidak
pernah menahan dana.

## Cara jalan

Dengan Docker:

```bash
cp .env.example .env.local
npm run docker:dev
```

Tanpa Docker:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Keduanya melayani http://localhost:3000. Langkah lengkap termasuk migration dan
konfigurasi Supabase Auth ada di [docs/SETUP.md](docs/SETUP.md); detail Docker
di [docs/DOCKER.md](docs/DOCKER.md).

## Status

Mengikuti fase di PRD bagian 6.

| Fase | Isi | Status |
| --- | --- | --- |
| 1 | Scaffold, skema database, RLS, middleware | selesai |
| 2 | Auth, onboarding, shell dashboard | selesai |
| 3 | Billing, OAuth payment, CRUD layanan & jam kerja | belum |
| 4 | Halaman booking publik | belum |
| 5 | Booking engine & anti double-booking | belum |
| 6 | Webhook, polling, cron auto-cancel | belum |

## Dokumen

- [PRD](docs/PRD-Smart-Booking-Invoicing-SaaS-V3.md) — spesifikasi produk
- [SETUP.md](docs/SETUP.md) — menjalankan dari nol
- [DOCKER.md](docs/DOCKER.md) — dev, produksi, dan uji migration di Docker
- [DECISIONS.md](docs/DECISIONS.md) — penyimpangan dari PRD dan alasannya
- [AGENTS.md](AGENTS.md) — konvensi kode

## Stack

Next.js 16 (App Router) · Tailwind v4 · shadcn/ui · Supabase (Postgres, Auth,
RLS) · Zod

## Perintah

```bash
npm run dev
npm run check   # typecheck + lint + build
```
