# Kustomisasi Halaman Publik — Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merchant bisa menyusun sendiri halaman publik `/[username]` — foto profil, tema, warna, background, tipografi, galeri gambar/video per layanan, dan FAQ — tanpa bisa menghasilkan halaman yang tidak terbaca atau lambat.

**Architecture:** Tema disimpan sebagai kolom bertipe di `merchant_themes`, diresolusi oleh fungsi murni `resolveTheme()`, lalu dipancarkan sebagai CSS custom property inline pada satu elemen pembungkus yang di-SSR. Komponen shadcn membaca token itu lewat `var(--…)` sehingga ikut berubah tanpa diubah. Tampilan halaman publik diekstrak ke komponen bersama yang dipakai halaman publik (server) maupun preview dashboard (klien), sehingga preview tidak bisa berbeda dari hasil akhir.

**Tech Stack:** Next.js 16 App Router · Tailwind v4 · shadcn/ui · Supabase (Postgres + RLS + Storage) · Zod · `node:test`

**Spek:** `docs/superpowers/specs/2026-08-20-kustomisasi-halaman-publik-design.md`

## Global Constraints

Berlaku untuk SEMUA task di bawah. Tidak diulang per task.

- **Baca dulu** `node_modules/next/dist/docs/` sebelum menulis kode Next.js. Versi ini punya breaking change dari Next.js yang Anda kenal.
- **Bahasa UI dan komentar kode: Indonesia.** Nama variabel, tabel, dan kolom tetap Inggris.
- **`getSession()` terlarang.** Pakai `getUser()` / `getClaims()`. Di Server Component pakai helper ber-`cache()` di `src/lib/auth/session.ts` (`getSessionUser()` / `requireMerchant()`).
- **Empat klien Supabase, pilih sesuai konteks:** `lib/supabase/client.ts` (komponen klien) · `server.ts` → `createClient` (Server Component/Action bersesi) · `server.ts` → `createPublicClient` (halaman publik `/[username]`) · `admin.ts` (service role). Halaman publik WAJIB `createPublicClient()`.
- **Perubahan skema = migration BARU** di `supabase/migrations/`, jangan edit file lama. Penamaan mengikuti stempel waktu yang sudah ada.
- **Setiap tabel baru di `public` wajib `revoke all` dari `anon` dan `authenticated` lebih dulu** — Supabase memberi ALL lewat `ALTER DEFAULT PRIVILEGES`. Grant per kolom, bukan grant tabel lalu revoke kolom.
- **Fungsi baru tertutup default** sejak `20260730000300_lock_down_function_execute.sql`. Fungsi trigger tidak perlu grant. Fungsi yang dipanggil klien wajib `grant execute` eksplisit; `revoke from public` saja tidak cukup.
- **`src/types/database.ts` wajib ikut diperbarui.** Semua tipe tabel berupa `type`, **bukan** `interface` — postgrest-js menuntut `Record<string, unknown>`, dan interface tanpa index signature implisit membuat hasil query diam-diam jadi `never`.
- **Setiap perubahan skema wajib lolos `npm run docker:test`** sebelum dianggap selesai. Tambahkan kasus uji ke `supabase/tests/99_verify.sql`, dan pastikan tidak ada constraint lain yang menangkap baris uji lebih dulu sehingga label uji jadi menyesatkan.
- **Gerbang akhir tiap task:** `npm run docker:test` (bila menyentuh SQL) lalu `npm run check` (typecheck + lint + uji unit + build). Jangan menyatakan selesai sebelum keduanya hijau.
- Commit sering, satu commit per task minimal, pesan commit berbahasa Indonesia.

## Peta File

**Baru — SQL**
| File | Tanggung jawab |
| --- | --- |
| `supabase/migrations/20260820000100_theme_schema.sql` | Enum tema, `merchant_themes`, trigger tier, grant, RLS |
| `supabase/migrations/20260820000200_storage_bucket.sql` | Bucket `merchant-media` + policy `storage.objects` |
| `supabase/migrations/20260820000300_service_media.sql` | `service_media`, unique gabungan di `services`, trigger batas |
| `supabase/migrations/20260820000400_merchant_faqs.sql` | `merchant_faqs`, trigger batas, grant, RLS |

**Baru — logika tema (murni, tanpa React)**
| File | Tanggung jawab |
| --- | --- |
| `src/lib/theme/types.ts` | Tipe `ResolvedTheme` |
| `src/lib/theme/color.ts` | Konversi hex↔RGB, luminansi, rasio kontras, penyesuai warna |
| `src/lib/theme/presets.ts` | Enam preset lengkap + daftar preset gratis |
| `src/lib/theme/resolve.ts` | `resolveTheme(tier, row)` — gabung preset, pangkas premium, jaga kontras |
| `src/lib/theme/css.ts` | `themeToCssVars(theme)` — CSS custom property |
| `src/lib/theme/fonts.ts` | Enam keluarga `next/font/google`, pemetaan pasangan |

**Baru — komponen halaman publik bersama**
| File | Tanggung jawab |
| --- | --- |
| `src/components/booking-page/page-shell.tsx` | Pembungkus bertema: kelas `dark`, style inline, font, overlay |
| `src/components/booking-page/profile-header.tsx` | Avatar, nama, bio |
| `src/components/booking-page/service-card.tsx` | Nama, harga, durasi, deskripsi, galeri |
| `src/components/booking-page/service-gallery.tsx` | Strip gulir `scroll-snap`, video poster |
| `src/components/booking-page/faq-section.tsx` | Accordion `<details>`; `null` bila kosong |

**Baru — media di browser**
| File | Tanggung jawab |
| --- | --- |
| `src/lib/media/limits.ts` | Konstanta batas + validator murni (diuji unit) |
| `src/lib/media/compress.ts` | Kompresi gambar dan pembuatan poster video lewat canvas |
| `src/lib/media/upload.ts` | Unggah ke Storage, hapus berkas lama, bersihkan saat gagal |

**Baru — dashboard**
| File | Tanggung jawab |
| --- | --- |
| `src/app/dashboard/halaman/page.tsx` | Muat tema, profil, FAQ, layanan; rakit editor |
| `src/app/dashboard/halaman/appearance-editor.tsx` | Panel kontrol + preview, state klien |
| `src/app/dashboard/halaman/preview-frame.tsx` | Bingkai ponsel yang merakit komponen `booking-page` |
| `src/app/dashboard/halaman/faq-editor.tsx` | Daftar FAQ yang bisa ditambah/ubah/hapus/urut |
| `src/app/dashboard/halaman/actions.ts` | Server Action: simpan tema, simpan FAQ, simpan avatar/background |
| `src/app/dashboard/halaman/appearance-state.ts` | Tipe state form + nilai awal |
| `src/app/dashboard/services/service-media-field.tsx` | Petak media per layanan di dialog layanan |
| `src/lib/validations/theme.ts` | Skema Zod tema dan FAQ |
| `src/lib/validations/service-media.ts` | Skema Zod media layanan |

**Diubah**
| File | Perubahan |
| --- | --- |
| `supabase/tests/00_supabase_stub.sql` | Tambah tiruan schema `storage` |
| `supabase/tests/99_verify.sql` | Tambah blok uji 19–23 |
| `src/types/database.ts` | Tipe tabel dan enum baru |
| `src/app/[username]/page.tsx` | Query embedding, rakit komponen bersama, JSON-LD |
| `src/app/[username]/layout.tsx` | **Baru** — kelas variabel font |
| `src/lib/routes.ts` | `ROUTES.appearance` |
| `src/components/layout/app-sidebar.tsx` | Menu "Halaman saya" |
| `src/app/dashboard/services/*` | Bagian media per layanan |
| `docs/DECISIONS.md` | Catat penyimpangan PRD |

---

### Task 1: Tiruan schema `storage` di harness uji

Migration berikutnya menyentuh `storage.objects`. Harness `docker:test` hanya Postgres polos dengan stub `auth` — tanpa tiruan ini, seluruh uji skema mati di migration Storage.

**Files:**
- Modify: `supabase/tests/00_supabase_stub.sql`

**Interfaces:**
- Consumes: —
- Produces: schema `storage` dengan tabel `storage.buckets` (`id`, `name`, `public`, `file_size_limit`, `allowed_mime_types`), tabel `storage.objects` (`id`, `bucket_id`, `name`, `owner`, `created_at`) ber-RLS, dan fungsi `storage.foldername(text) returns text[]`.

- [ ] **Step 1: Tambahkan tiruan storage ke stub**

Tambahkan di akhir `supabase/tests/00_supabase_stub.sql`:

```sql
-- --- Tiruan Storage ---------------------------------------------------------
-- Supabase menyediakan schema `storage` di luar migration kita. Harness ini
-- Postgres polos, jadi bentuk minimalnya dibuat di sini supaya migration yang
-- memasang policy pada storage.objects bisa ikut diuji, bukan jadi satu-satunya
-- bagian keamanan yang tidak pernah dijalankan.
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

grant select on storage.objects to anon;
grant select, insert, update, delete on storage.objects to authenticated;

-- Mengembalikan segmen folder tanpa nama berkas, sama seperti milik Supabase:
-- 'uuid/svc/id/x.webp' -> {uuid,svc,id}
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[
    1 : array_length(string_to_array(name, '/'), 1) - 1
  ];
$$;
```

- [ ] **Step 2: Jalankan harness untuk memastikan masih hijau**

```bash
npm run docker:test
```

Expected: semua migration lama jalan, tidak ada baris diawali `FAIL`.

- [ ] **Step 3: Verifikasi fungsi tiruan berperilaku benar**

Tambahkan di akhir `supabase/tests/99_verify.sql`:

```sql
-- 19. Tiruan storage.foldername (lihat 00_supabase_stub.sql)
select case
         when storage.foldername('abc/svc/def/x.webp') = array['abc','svc','def']
              and storage.foldername('abc/avatar.webp') = array['abc']
           then 'OK   t19 storage.foldername memisahkan folder dari nama berkas'
         else 'FAIL t19 storage.foldername: '
              || array_to_string(storage.foldername('abc/svc/def/x.webp'), ',')
       end as t19;
```

- [ ] **Step 4: Jalankan ulang harness**

```bash
npm run docker:test
```

Expected: baris `OK   t19 …` muncul.

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/00_supabase_stub.sql supabase/tests/99_verify.sql
git commit -m "Tambah tiruan schema storage di harness uji migration"
```

---

### Task 2: Skema tema — `merchant_themes`

**Files:**
- Create: `supabase/migrations/20260820000100_theme_schema.sql`
- Modify: `supabase/tests/99_verify.sql`, `src/types/database.ts`

**Interfaces:**
- Consumes: `public.merchants`, `public.subscription_tier`, `public.set_updated_at()`
- Produces: enum `theme_preset`, `background_style`, `font_pair`, `text_scale`, `corner_style`; tabel `public.merchant_themes`; tipe TS `MerchantTheme`, `ThemePreset`, `BackgroundStyle`, `FontPair`, `TextScale`, `CornerStyle`. `ColorMode` ada sebagai tipe TS tapi BUKAN kolom — diturunkan resolveTheme().

- [ ] **Step 1: Tulis migration**

Buat `supabase/migrations/20260820000100_theme_schema.sql`:

```sql
-- ===========================================================================
-- Tema halaman publik merchant.
-- Spek: docs/superpowers/specs/2026-08-20-kustomisasi-halaman-publik-design.md
--
-- Baris di tabel ini OPSIONAL. Merchant tanpa baris memakai tema default,
-- jadi tidak ada backfill dan tidak ada kolom NOT NULL yang perlu diisi
-- untuk merchant lama.
-- ===========================================================================

create type public.theme_preset as enum
  ('BERSIH', 'HANGAT', 'MALAM', 'PASTEL', 'BERANI', 'ELEGAN');
create type public.background_style as enum ('SOLID', 'GRADIENT', 'IMAGE');
create type public.font_pair as enum
  ('NETRAL', 'KLASIK', 'MODERN', 'HANGAT', 'TEGAS', 'RAPI');
create type public.text_scale as enum ('KECIL', 'SEDANG', 'BESAR');
create type public.corner_style as enum ('TAJAM', 'LEMBUT', 'BULAT');

-- Tidak ada enum color_mode. Terang/gelap TIDAK boleh jadi pilihan terpisah:
-- menyetel GELAP di atas preset berlatar putih menghasilkan kelas `dark` di
-- atas background terang, dan halaman jadi tidak terbaca. resolveTheme()
-- menurunkannya dari luminansi background yang sudah jadi.

create table public.merchant_themes (
  merchant_id uuid primary key references public.merchants (id) on delete cascade,
  preset public.theme_preset not null default 'BERSIH',
  accent text,
  background_style public.background_style not null default 'SOLID',
  background_color text,
  background_image_path text,
  background_overlay smallint not null default 45,
  -- font_pair dan corner_style sengaja NULLABLE, dan null berarti "ikut
  -- preset". Kalau keduanya not null dengan nilai default, memilih preset
  -- ELEGAN tidak akan pernah memakai sudut tajam dan font Playfair miliknya --
  -- nilai default kolom selalu menang atas nilai preset.
  font_pair public.font_pair,
  text_scale public.text_scale not null default 'SEDANG',
  corner_style public.corner_style,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint merchant_themes_accent_format check (
    accent is null or accent ~ '^#[0-9a-f]{6}$'
  ),
  constraint merchant_themes_background_color_format check (
    background_color is null or background_color ~ '^#[0-9a-f]{6}$'
  ),
  -- Overlay dibatasi 80: di atas itu foto backgroundnya praktis tidak terlihat
  -- lagi, jadi merchant lebih baik memilih background SOLID.
  constraint merchant_themes_overlay_range check (
    background_overlay between 0 and 80
  ),
  -- Background bergambar tanpa gambar akan merender kotak kosong di halaman
  -- publik. Ditolak di sini, bukan dibiarkan lolos lalu ditambal di UI.
  constraint merchant_themes_image_requires_path check (
    background_style <> 'IMAGE' or background_image_path is not null
  )
);

create trigger merchant_themes_set_updated_at
  before update on public.merchant_themes
  for each row execute function public.set_updated_at();

-- --- Penegakan paket --------------------------------------------------------
-- Paket STARTER hanya boleh memilih salah satu dari tiga preset gratis, tanpa
-- penyetelan token apa pun. Perhatikan: trigger ini TIDAK menyala saat merchant
-- PRO turun ke STARTER, karena tidak ada UPDATE pada tabel ini yang terjadi.
-- Kasus itu ditangani resolveTheme() di src/lib/theme/resolve.ts, yang
-- memangkas nilai premium saat dibaca.
create or replace function public.enforce_theme_tier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tier public.subscription_tier;
begin
  select m.subscription_tier into tier
  from public.merchants m
  where m.id = new.merchant_id;

  if tier is distinct from 'STARTER' then
    return new;
  end if;

  if new.preset not in ('BERSIH', 'HANGAT', 'MALAM') then
    raise exception 'Tema % hanya tersedia untuk paket Pro.', new.preset
      using errcode = 'P0001';
  end if;
  if new.background_style <> 'SOLID' then
    raise exception 'Background khusus hanya tersedia untuk paket Pro.'
      using errcode = 'P0001';
  end if;
  if new.accent is not null then
    raise exception 'Warna aksen sendiri hanya tersedia untuk paket Pro.'
      using errcode = 'P0001';
  end if;
  if new.font_pair is not null then
    raise exception 'Pilihan font hanya tersedia untuk paket Pro.'
      using errcode = 'P0001';
  end if;
  if new.text_scale <> 'SEDANG' then
    raise exception 'Ukuran teks hanya bisa diatur pada paket Pro.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger merchant_themes_enforce_tier
  before insert or update on public.merchant_themes
  for each row execute function public.enforce_theme_tier();

-- --- Hak akses --------------------------------------------------------------
revoke all on public.merchant_themes from anon, authenticated;

-- Seluruh isi tabel ini memang tampil di halaman publik, jadi tidak ada kolom
-- yang perlu disembunyikan dari anon.
grant select on public.merchant_themes to anon;
grant select, insert, update, delete on public.merchant_themes to authenticated;

alter table public.merchant_themes enable row level security;

create policy "merchant_themes_public_read"
  on public.merchant_themes
  for select
  to anon
  using (
    exists (
      select 1
      from public.merchants m
      where m.id = merchant_themes.merchant_id
        and m.username is not null
    )
  );

create policy "merchant_themes_read_own"
  on public.merchant_themes
  for select
  to authenticated
  using ((select auth.uid()) = merchant_id);

create policy "merchant_themes_insert_own"
  on public.merchant_themes
  for insert
  to authenticated
  with check ((select auth.uid()) = merchant_id);

create policy "merchant_themes_update_own"
  on public.merchant_themes
  for update
  to authenticated
  using ((select auth.uid()) = merchant_id)
  with check ((select auth.uid()) = merchant_id);

create policy "merchant_themes_delete_own"
  on public.merchant_themes
  for delete
  to authenticated
  using ((select auth.uid()) = merchant_id);

revoke execute on function public.enforce_theme_tier() from public;
```

- [ ] **Step 2: Tulis kasus uji SQL**

Tambahkan di akhir `supabase/tests/99_verify.sql`. Merchant `1111…` sudah ada dari blok 1 dan bertier `STARTER`; buat satu merchant PRO baru untuk sisi positifnya.

```sql
-- 20. merchant_themes
insert into auth.users (id, email) values
  ('66666666-6666-6666-6666-666666666666', 'tema-pro@example.com');
update public.merchants set subscription_tier = 'PRO'
where id = '66666666-6666-6666-6666-666666666666';

-- STARTER: tiga preset gratis diterima, sisanya ditolak.
select pg_temp.expect_ok(
  $q$insert into public.merchant_themes (merchant_id, preset)
     values ('11111111-1111-1111-1111-111111111111', 'MALAM')$q$,
  't20a STARTER memakai preset gratis MALAM');
select pg_temp.expect_fail(
  $q$update public.merchant_themes set preset = 'ELEGAN'
     where merchant_id = '11111111-1111-1111-1111-111111111111'$q$,
  't20b STARTER memakai preset premium ELEGAN');
select pg_temp.expect_fail(
  $q$update public.merchant_themes set accent = '#ff8800'
     where merchant_id = '11111111-1111-1111-1111-111111111111'$q$,
  't20c STARTER menyetel warna aksen');
select pg_temp.expect_fail(
  $q$update public.merchant_themes set font_pair = 'KLASIK'
     where merchant_id = '11111111-1111-1111-1111-111111111111'$q$,
  't20d STARTER memilih font');
select pg_temp.expect_fail(
  $q$update public.merchant_themes set text_scale = 'BESAR'
     where merchant_id = '11111111-1111-1111-1111-111111111111'$q$,
  't20e STARTER mengatur ukuran teks');

-- PRO: nilai yang sama diterima.
select pg_temp.expect_ok(
  $q$insert into public.merchant_themes
       (merchant_id, preset, accent, font_pair, text_scale)
     values ('66666666-6666-6666-6666-666666666666', 'ELEGAN', '#c9a961',
             'KLASIK', 'BESAR')$q$,
  't20f PRO memakai preset premium, aksen, font, dan ukuran teks');

-- Null pada font_pair dan corner_style berarti "ikut preset", dan harus tetap
-- diterima untuk paket STARTER.
select case
         when (select font_pair is null and corner_style is null
               from public.merchant_themes
               where merchant_id = '11111111-1111-1111-1111-111111111111')
           then 'OK   t20f2 baris STARTER menyimpan font_pair dan corner_style sebagai null (ikut preset)'
         else 'FAIL t20f2 font_pair/corner_style STARTER tidak null'
       end as t20f2;

-- Constraint yang tidak bergantung pada paket. Dipakai merchant PRO supaya
-- yang menangkap baris ini benar-benar constraint yang dimaksud, bukan trigger
-- paket yang kebetulan menyala lebih dulu.
select pg_temp.expect_fail(
  $q$update public.merchant_themes set background_overlay = 90
     where merchant_id = '66666666-6666-6666-6666-666666666666'$q$,
  't20g overlay di luar 0-80');
select pg_temp.expect_fail(
  $q$update public.merchant_themes set accent = 'merah'
     where merchant_id = '66666666-6666-6666-6666-666666666666'$q$,
  't20h accent bukan hex enam digit');
select pg_temp.expect_fail(
  $q$update public.merchant_themes set background_style = 'IMAGE'
     where merchant_id = '66666666-6666-6666-6666-666666666666'$q$,
  't20i background IMAGE tanpa background_image_path');

-- Hak akses peran anon.
begin;
set local role anon;
select pg_temp.expect_fail(
  $q$insert into public.merchant_themes (merchant_id, preset)
     values ('66666666-6666-6666-6666-666666666666', 'BERSIH')$q$,
  't20j anon menulis merchant_themes');
rollback;
```

- [ ] **Step 3: Jalankan harness dan periksa tiap label**

```bash
npm run docker:test
```

Expected: `t19` sampai `t20j` semuanya diawali `OK`. Baca pesan `sqlerrm` pada baris `t20b`–`t20e` — harus menyebut paket Pro, bukan pelanggaran constraint lain. Kalau bukan, berarti ada constraint yang menangkap lebih dulu dan labelnya menyesatkan.

- [ ] **Step 4: Perbarui tipe TypeScript**

Di `src/types/database.ts`, tambahkan setelah `PaymentEnvironment`:

```ts
export type ThemePreset =
  | "BERSIH"
  | "HANGAT"
  | "MALAM"
  | "PASTEL"
  | "BERANI"
  | "ELEGAN";
export type BackgroundStyle = "SOLID" | "GRADIENT" | "IMAGE";
export type FontPair = "NETRAL" | "KLASIK" | "MODERN" | "HANGAT" | "TEGAS" | "RAPI";
export type TextScale = "KECIL" | "SEDANG" | "BESAR";
export type CornerStyle = "TAJAM" | "LEMBUT" | "BULAT";

/** Diturunkan dari luminansi background oleh resolveTheme(), bukan kolom. */
export type ColorMode = "TERANG" | "GELAP";
```

Dan tipe barisnya, di dekat `Service`:

```ts
export type MerchantTheme = {
  merchant_id: string;
  preset: ThemePreset;
  accent: string | null;
  background_style: BackgroundStyle;
  background_color: string | null;
  background_image_path: string | null;
  background_overlay: number;
  font_pair: FontPair | null;
  text_scale: TextScale;
  corner_style: CornerStyle | null;
  created_at: string;
  updated_at: string;
};
```

Lalu daftarkan di `Database["public"]["Tables"]`:

```ts
      merchant_themes: {
        Row: MerchantTheme;
        Insert: Partial<Omit<MerchantTheme, "merchant_id" | Timestamps>> & {
          merchant_id: string;
        };
        Update: Partial<Omit<MerchantTheme, "merchant_id" | Timestamps>>;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
```

- [ ] **Step 5: Verifikasi tipe dan commit**

```bash
npm run typecheck
```

Expected: tanpa error.

```bash
git add supabase/migrations/20260820000100_theme_schema.sql supabase/tests/99_verify.sql src/types/database.ts
git commit -m "Tambah skema merchant_themes beserta penegakan paket dan RLS"
```

---

### Task 3: Bucket Storage dan policy `storage.objects`

**Files:**
- Create: `supabase/migrations/20260820000200_storage_bucket.sql`
- Modify: `supabase/tests/99_verify.sql`

**Interfaces:**
- Consumes: `storage.buckets`, `storage.objects`, `storage.foldername()` dari Task 1
- Produces: bucket `merchant-media` (publik, batas 20MB, MIME terbatas) dan empat policy pada `storage.objects`.

- [ ] **Step 1: Tulis migration**

Buat `supabase/migrations/20260820000200_storage_bucket.sql`:

```sql
-- ===========================================================================
-- Bucket media merchant: foto profil, background, dan media layanan.
--
-- Batas ukuran dan tipe berkas ditegakkan DI SINI, bukan hanya di browser.
-- Pemeriksaan di browser bisa dilewati siapa pun yang menembak Storage
-- langsung dengan token sesinya sendiri.
--
-- Durasi video (maks ~30 detik) hanya diperiksa di browser; menegakkannya di
-- server butuh transcoding. Celah ini diterima sadar, bukan terlewat.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'merchant-media',
  'merchant-media',
  true,
  20971520,
  array['image/webp', 'image/jpeg', 'image/png', 'video/mp4', 'video/webm']
)
on conflict (id) do nothing;

-- Seluruh pola path diawali id merchant:
--   {merchant_id}/avatar-{hash}.webp
--   {merchant_id}/bg-{hash}.webp
--   {merchant_id}/svc/{service_id}/{hash}.webp
-- Satu aturan "folder pertama harus sama dengan auth.uid()" menutup semuanya.
create policy "merchant_media_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'merchant-media');

create policy "merchant_media_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'merchant-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "merchant_media_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'merchant-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'merchant-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "merchant_media_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'merchant-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
```

- [ ] **Step 2: Tulis kasus uji SQL**

Tambahkan di akhir `supabase/tests/99_verify.sql`:

```sql
-- 21. Policy storage.objects
select case when exists (
         select 1 from storage.buckets
         where id = 'merchant-media' and public and file_size_limit = 20971520
       ) then 'OK   t21a bucket merchant-media terpasang dengan batas 20MB'
         else 'FAIL t21a bucket merchant-media' end as t21a;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select pg_temp.expect_ok(
  $q$insert into storage.objects (bucket_id, name)
     values ('merchant-media',
             '66666666-6666-6666-6666-666666666666/avatar-a1.webp')$q$,
  't21b merchant menulis ke foldernya sendiri');
select pg_temp.expect_fail(
  $q$insert into storage.objects (bucket_id, name)
     values ('merchant-media',
             '11111111-1111-1111-1111-111111111111/avatar-a2.webp')$q$,
  't21c merchant menulis ke folder merchant lain');
select pg_temp.expect_fail(
  $q$insert into storage.objects (bucket_id, name)
     values ('merchant-media', 'avatar-tanpa-folder.webp')$q$,
  't21d berkas di akar bucket tanpa folder merchant');
rollback;

begin;
set local role anon;
select pg_temp.expect_fail(
  $q$insert into storage.objects (bucket_id, name)
     values ('merchant-media', 'anon/x.webp')$q$,
  't21e anon mengunggah berkas');
rollback;
```

- [ ] **Step 3: Jalankan harness**

```bash
npm run docker:test
```

Expected: `t21a` sampai `t21e` diawali `OK`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260820000200_storage_bucket.sql supabase/tests/99_verify.sql
git commit -m "Tambah bucket merchant-media dan policy storage berbasis folder merchant"
```

---
### Task 4: Skema media layanan — `service_media`

**Files:**
- Create: `supabase/migrations/20260820000300_service_media.sql`
- Modify: `supabase/tests/99_verify.sql`, `src/types/database.ts`

**Interfaces:**
- Consumes: `public.services`, `public.merchants`, `public.subscription_tier`
- Produces: enum `media_kind`; tabel `public.service_media`; constraint `services_id_merchant_key` pada `public.services`; tipe TS `MediaKind`, `ServiceMedia`.

- [ ] **Step 1: Tulis migration**

Buat `supabase/migrations/20260820000300_service_media.sql`:

```sql
-- ===========================================================================
-- Galeri gambar dan video per layanan.
-- ===========================================================================

create type public.media_kind as enum ('IMAGE', 'VIDEO');

-- Target foreign key gabungan di bawah. `id` sudah primary key, jadi
-- constraint ini tidak menambah jaminan keunikan apa pun -- ia ada semata
-- supaya (service_id, merchant_id) di service_media punya sesuatu untuk
-- direferensikan.
alter table public.services
  add constraint services_id_merchant_key unique (id, merchant_id);

create table public.service_media (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null,
  merchant_id uuid not null,
  kind public.media_kind not null,
  path text not null,
  poster_path text,
  alt text,
  width smallint not null,
  height smallint not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  -- merchant_id sengaja diduplikasi dari services, lalu dikunci lewat foreign
  -- key gabungan: Postgres sendiri yang menjamin media tidak bisa menempel
  -- pada layanan milik merchant lain. Efek sampingnya, policy RLS cukup
  -- membandingkan merchant_id = auth.uid() tanpa join, dan query dengan
  -- createAdminClient() bisa memfilter merchant_id langsung sesuai AGENTS.md.
  constraint service_media_service_fk
    foreign key (service_id, merchant_id)
    references public.services (id, merchant_id)
    on delete cascade,

  -- Video tanpa poster akan merender kotak hitam sampai pelanggan menekan
  -- play. Poster dibuat otomatis di browser, jadi tidak ada alasan kosong.
  constraint service_media_video_needs_poster check (
    kind <> 'VIDEO' or poster_path is not null
  ),
  constraint service_media_alt_length check (
    alt is null or char_length(alt) <= 120
  ),
  -- Dipakai halaman publik sebagai atribut width/height agar tata letak tidak
  -- melompat saat gambar datang. Nol atau negatif akan merusak perhitungan itu.
  constraint service_media_dimensions check (
    width between 1 and 4096 and height between 1 and 4096
  ),
  constraint service_media_path_length check (
    char_length(path) between 1 and 400
  )
);

create index service_media_service_idx
  on public.service_media (service_id, sort_order);

-- --- Batas jumlah dan paket --------------------------------------------------
create or replace function public.enforce_service_media_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tier public.subscription_tier;
  current_count integer;
begin
  select m.subscription_tier into tier
  from public.merchants m
  where m.id = new.merchant_id;

  if new.kind = 'VIDEO' and tier = 'STARTER' then
    raise exception 'Video layanan hanya tersedia untuk paket Pro.'
      using errcode = 'P0001';
  end if;

  select count(*) into current_count
  from public.service_media sm
  where sm.service_id = new.service_id
    and sm.kind = new.kind
    and sm.id is distinct from new.id;

  if new.kind = 'IMAGE' and current_count >= 5 then
    raise exception 'Satu layanan maksimal 5 gambar.' using errcode = 'P0001';
  end if;

  if new.kind = 'VIDEO' and current_count >= 1 then
    raise exception 'Satu layanan maksimal 1 video.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger service_media_enforce_limit
  before insert or update on public.service_media
  for each row execute function public.enforce_service_media_limit();

-- --- Hak akses --------------------------------------------------------------
revoke all on public.service_media from anon, authenticated;

grant select on public.service_media to anon;
grant select, insert, update, delete on public.service_media to authenticated;

alter table public.service_media enable row level security;

-- Mengikuti services_public_read: hanya media milik layanan aktif dari
-- merchant yang sudah menyelesaikan onboarding.
create policy "service_media_public_read"
  on public.service_media
  for select
  to anon
  using (
    exists (
      select 1
      from public.services s
      join public.merchants m on m.id = s.merchant_id
      where s.id = service_media.service_id
        and s.is_active
        and m.username is not null
    )
  );

create policy "service_media_read_own"
  on public.service_media
  for select
  to authenticated
  using ((select auth.uid()) = merchant_id);

create policy "service_media_insert_own"
  on public.service_media
  for insert
  to authenticated
  with check ((select auth.uid()) = merchant_id);

create policy "service_media_update_own"
  on public.service_media
  for update
  to authenticated
  using ((select auth.uid()) = merchant_id)
  with check ((select auth.uid()) = merchant_id);

create policy "service_media_delete_own"
  on public.service_media
  for delete
  to authenticated
  using ((select auth.uid()) = merchant_id);

revoke execute on function public.enforce_service_media_limit() from public;
```

- [ ] **Step 2: Tulis kasus uji SQL**

Merchant `1111…` (STARTER) dan `6666…` (PRO) sudah ada dari blok sebelumnya. Merchant STARTER dibatasi 1 layanan oleh `enforce_service_limit`, jadi layanan ujinya dibuat satu-satu.

```sql
-- 22. service_media
insert into public.services (id, merchant_id, name, price, duration_minutes)
values
  ('aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'Layanan Starter', 100000, 60),
  ('aaaaaaaa-0000-0000-0000-000000000002',
   '66666666-6666-6666-6666-666666666666', 'Layanan Pro', 250000, 90);

-- Foreign key gabungan: media tidak boleh menunjuk layanan merchant lain.
select pg_temp.expect_fail(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000002',
             '11111111-1111-1111-1111-111111111111', 'IMAGE',
             '11111111-1111-1111-1111-111111111111/svc/x/a.webp', 800, 600)$q$,
  't22a media menunjuk layanan milik merchant lain');

-- Batas lima gambar per layanan.
insert into public.service_media (service_id, merchant_id, kind, path, width, height)
select 'aaaaaaaa-0000-0000-0000-000000000002',
       '66666666-6666-6666-6666-666666666666', 'IMAGE',
       '66666666-6666-6666-6666-666666666666/svc/x/' || i || '.webp', 800, 600
from generate_series(1, 5) as i;

select pg_temp.expect_fail(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000002',
             '66666666-6666-6666-6666-666666666666', 'IMAGE',
             '66666666-6666-6666-6666-666666666666/svc/x/6.webp', 800, 600)$q$,
  't22b gambar keenam pada satu layanan');

-- Video: poster wajib, maksimal satu, dan tertutup untuk STARTER.
select pg_temp.expect_fail(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000002',
             '66666666-6666-6666-6666-666666666666', 'VIDEO',
             '66666666-6666-6666-6666-666666666666/svc/x/v.mp4', 1280, 720)$q$,
  't22c video tanpa poster_path');

select pg_temp.expect_ok(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, poster_path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000002',
             '66666666-6666-6666-6666-666666666666', 'VIDEO',
             '66666666-6666-6666-6666-666666666666/svc/x/v.mp4',
             '66666666-6666-6666-6666-666666666666/svc/x/v-poster.webp',
             1280, 720)$q$,
  't22d video pertama milik merchant PRO');

select pg_temp.expect_fail(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, poster_path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000002',
             '66666666-6666-6666-6666-666666666666', 'VIDEO',
             '66666666-6666-6666-6666-666666666666/svc/x/v2.mp4',
             '66666666-6666-6666-6666-666666666666/svc/x/v2-poster.webp',
             1280, 720)$q$,
  't22e video kedua pada satu layanan');

select pg_temp.expect_fail(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, poster_path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111', 'VIDEO',
             '11111111-1111-1111-1111-111111111111/svc/y/v.mp4',
             '11111111-1111-1111-1111-111111111111/svc/y/v-poster.webp',
             1280, 720)$q$,
  't22f video milik merchant STARTER');

-- Dimensi nol akan merusak atribut width/height di halaman publik.
select pg_temp.expect_fail(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111', 'IMAGE',
             '11111111-1111-1111-1111-111111111111/svc/y/a.webp', 0, 600)$q$,
  't22g dimensi gambar nol');

begin;
set local role anon;
select pg_temp.expect_fail(
  $q$insert into public.service_media
       (service_id, merchant_id, kind, path, width, height)
     values ('aaaaaaaa-0000-0000-0000-000000000002',
             '66666666-6666-6666-6666-666666666666', 'IMAGE',
             '66666666-6666-6666-6666-666666666666/svc/x/anon.webp', 800, 600)$q$,
  't22h anon menulis service_media');
rollback;
```

- [ ] **Step 3: Jalankan harness**

```bash
npm run docker:test
```

Expected: `t22a` sampai `t22h` diawali `OK`. Periksa `sqlerrm` pada `t22f` — harus menyebut paket Pro, bukan batas jumlah. Kalau menyebut batas jumlah, urutan pemeriksaan di trigger salah.

- [ ] **Step 4: Perbarui tipe TypeScript**

Di `src/types/database.ts`:

```ts
export type MediaKind = "IMAGE" | "VIDEO";

export type ServiceMedia = {
  id: string;
  service_id: string;
  merchant_id: string;
  kind: MediaKind;
  path: string;
  poster_path: string | null;
  alt: string | null;
  width: number;
  height: number;
  sort_order: number;
  created_at: string;
};
```

Dan di `Database["public"]["Tables"]`:

```ts
      service_media: {
        Row: ServiceMedia;
        Insert: Omit<ServiceMedia, "id" | "created_at" | "sort_order"> &
          Partial<Pick<ServiceMedia, "id" | "sort_order">>;
        Update: Partial<
          Omit<ServiceMedia, "id" | "service_id" | "merchant_id" | "created_at">
        >;
        Relationships: [
          Relationship<"service_id", "services">,
          Relationship<"merchant_id", "merchants">,
        ];
      };
```

- [ ] **Step 5: Verifikasi dan commit**

```bash
npm run typecheck
```

```bash
git add supabase/migrations/20260820000300_service_media.sql supabase/tests/99_verify.sql src/types/database.ts
git commit -m "Tambah skema service_media dengan foreign key gabungan dan batas per paket"
```

---

### Task 5: Skema FAQ — `merchant_faqs`

**Files:**
- Create: `supabase/migrations/20260820000400_merchant_faqs.sql`
- Modify: `supabase/tests/99_verify.sql`, `src/types/database.ts`

**Interfaces:**
- Consumes: `public.merchants`, `public.set_updated_at()`
- Produces: tabel `public.merchant_faqs`; tipe TS `MerchantFaq`.

- [ ] **Step 1: Tulis migration**

Buat `supabase/migrations/20260820000400_merchant_faqs.sql`:

```sql
-- ===========================================================================
-- FAQ halaman publik merchant.
--
-- Terbuka untuk semua paket, bukan fitur Pro: FAQ mengurangi pertanyaan
-- berulang yang masuk ke WhatsApp merchant, dan halaman merchant STARTER
-- adalah halaman yang membawa watermark Booka. Lihat docs/DECISIONS.md.
-- ===========================================================================

create table public.merchant_faqs (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint merchant_faqs_question_length check (
    char_length(trim(question)) between 3 and 200
  ),
  constraint merchant_faqs_answer_length check (
    char_length(trim(answer)) between 1 and 1000
  )
);

create index merchant_faqs_merchant_idx
  on public.merchant_faqs (merchant_id, sort_order);

create trigger merchant_faqs_set_updated_at
  before update on public.merchant_faqs
  for each row execute function public.set_updated_at();

-- Sepuluh pertanyaan sudah lebih panjang dari yang mau dibaca siapa pun di
-- ponsel. Batas ini menjaga halaman, bukan menjaga biaya.
create or replace function public.enforce_faq_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  select count(*) into current_count
  from public.merchant_faqs f
  where f.merchant_id = new.merchant_id;

  if current_count >= 10 then
    raise exception 'Maksimal 10 pertanyaan pada FAQ.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger merchant_faqs_enforce_limit
  before insert on public.merchant_faqs
  for each row execute function public.enforce_faq_limit();

-- --- Hak akses --------------------------------------------------------------
revoke all on public.merchant_faqs from anon, authenticated;

grant select on public.merchant_faqs to anon;
grant select, insert, update, delete on public.merchant_faqs to authenticated;

alter table public.merchant_faqs enable row level security;

create policy "merchant_faqs_public_read"
  on public.merchant_faqs
  for select
  to anon
  using (
    exists (
      select 1
      from public.merchants m
      where m.id = merchant_faqs.merchant_id
        and m.username is not null
    )
  );

create policy "merchant_faqs_read_own"
  on public.merchant_faqs
  for select
  to authenticated
  using ((select auth.uid()) = merchant_id);

create policy "merchant_faqs_insert_own"
  on public.merchant_faqs
  for insert
  to authenticated
  with check ((select auth.uid()) = merchant_id);

create policy "merchant_faqs_update_own"
  on public.merchant_faqs
  for update
  to authenticated
  using ((select auth.uid()) = merchant_id)
  with check ((select auth.uid()) = merchant_id);

create policy "merchant_faqs_delete_own"
  on public.merchant_faqs
  for delete
  to authenticated
  using ((select auth.uid()) = merchant_id);

revoke execute on function public.enforce_faq_limit() from public;
```

- [ ] **Step 2: Tulis kasus uji SQL**

```sql
-- 23. merchant_faqs
insert into public.merchant_faqs (merchant_id, question, answer, sort_order)
select '66666666-6666-6666-6666-666666666666',
       'Pertanyaan nomor ' || i,
       'Jawaban nomor ' || i,
       i
from generate_series(1, 10) as i;

select pg_temp.expect_fail(
  $q$insert into public.merchant_faqs (merchant_id, question, answer)
     values ('66666666-6666-6666-6666-666666666666',
             'Pertanyaan kesebelas', 'Jawaban kesebelas')$q$,
  't23a FAQ kesebelas');

-- Panjang minimum diuji pada merchant lain supaya batas jumlah di atas tidak
-- menangkap baris ini lebih dulu dan membuat labelnya menyesatkan.
select pg_temp.expect_fail(
  $q$insert into public.merchant_faqs (merchant_id, question, answer)
     values ('11111111-1111-1111-1111-111111111111', 'ab', 'Jawaban')$q$,
  't23b pertanyaan lebih pendek dari 3 karakter');

select pg_temp.expect_fail(
  $q$insert into public.merchant_faqs (merchant_id, question, answer)
     values ('11111111-1111-1111-1111-111111111111', 'Pertanyaan valid', '   ')$q$,
  't23c jawaban hanya berisi spasi');

select pg_temp.expect_ok(
  $q$insert into public.merchant_faqs (merchant_id, question, answer)
     values ('11111111-1111-1111-1111-111111111111',
             'Apakah bisa reschedule?', 'Bisa, hubungi kami lewat WhatsApp.')$q$,
  't23d FAQ merchant STARTER diterima');

begin;
set local role anon;
select pg_temp.expect_fail(
  $q$insert into public.merchant_faqs (merchant_id, question, answer)
     values ('66666666-6666-6666-6666-666666666666', 'Anon', 'Anon')$q$,
  't23e anon menulis merchant_faqs');
rollback;
```

- [ ] **Step 3: Jalankan harness**

```bash
npm run docker:test
```

Expected: `t23a` sampai `t23e` diawali `OK`. Perhatikan `t23d` — kalau gagal, berarti FAQ tidak sengaja ikut terkunci paket.

- [ ] **Step 4: Perbarui tipe TypeScript**

```ts
export type MerchantFaq = {
  id: string;
  merchant_id: string;
  question: string;
  answer: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
```

```ts
      merchant_faqs: {
        Row: MerchantFaq;
        Insert: Omit<MerchantFaq, "id" | Timestamps | "sort_order"> &
          Partial<Pick<MerchantFaq, "id" | "sort_order">>;
        Update: Partial<Omit<MerchantFaq, "id" | "merchant_id" | Timestamps>>;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
```

- [ ] **Step 5: Verifikasi dan commit**

```bash
npm run docker:test && npm run check
```

```bash
git add supabase/migrations/20260820000400_merchant_faqs.sql supabase/tests/99_verify.sql src/types/database.ts
git commit -m "Tambah skema merchant_faqs terbuka untuk semua paket"
```

---

### Task 6: Utilitas warna dan penjaga kontras

Fungsi murni, tanpa React, tanpa DOM. Ini fondasi yang membuat "merchant bebas pilih warna" tidak berujung pada halaman yang tidak terbaca.

**Files:**
- Create: `src/lib/theme/color.ts`
- Test: `src/lib/theme/color.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `hexToRgb(hex: string): { r: number; g: number; b: number }`
  - `rgbToHex(rgb: { r: number; g: number; b: number }): string`
  - `relativeLuminance(hex: string): number`
  - `contrastRatio(a: string, b: string): number`
  - `ensureContrast(color: string, background: string, minRatio?: number): string`
  - `readableOn(background: string): "#ffffff" | "#111111"`
  - `isDark(hex: string): boolean`

- [ ] **Step 1: Tulis uji yang gagal**

Buat `src/lib/theme/color.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  contrastRatio,
  ensureContrast,
  hexToRgb,
  isDark,
  readableOn,
  relativeLuminance,
  rgbToHex,
} from "./color";

test("hexToRgb dan rgbToHex saling membalik", () => {
  assert.deepEqual(hexToRgb("#1a2b3c"), { r: 26, g: 43, b: 60 });
  assert.equal(rgbToHex({ r: 26, g: 43, b: 60 }), "#1a2b3c");
});

test("relativeLuminance: putih 1, hitam 0", () => {
  assert.equal(relativeLuminance("#ffffff"), 1);
  assert.equal(relativeLuminance("#000000"), 0);
});

test("contrastRatio: putih di atas hitam adalah 21:1", () => {
  assert.equal(Math.round(contrastRatio("#ffffff", "#000000")), 21);
  assert.equal(contrastRatio("#ffffff", "#ffffff"), 1);
});

test("ensureContrast menggelapkan warna terang di atas latar terang", () => {
  // Kuning cerah di atas putih: rasio aslinya sekitar 1.07:1, tidak terbaca.
  const hasil = ensureContrast("#ffe600", "#ffffff", 4.5);
  assert.ok(
    contrastRatio(hasil, "#ffffff") >= 4.5,
    `rasio hasil hanya ${contrastRatio(hasil, "#ffffff")}`,
  );
  assert.ok(isDark(hasil), "warna hasil harus lebih gelap dari aslinya");
});

test("ensureContrast mencerahkan warna gelap di atas latar gelap", () => {
  const hasil = ensureContrast("#1f3a5f", "#111111", 4.5);
  assert.ok(contrastRatio(hasil, "#111111") >= 4.5);
});

test("ensureContrast membiarkan warna yang kontrasnya sudah cukup", () => {
  assert.equal(ensureContrast("#111111", "#ffffff", 4.5), "#111111");
});

test("readableOn memilih teks gelap di atas latar terang dan sebaliknya", () => {
  assert.equal(readableOn("#ffe600"), "#111111");
  assert.equal(readableOn("#1a1a1c"), "#ffffff");
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
npm run test:unit
```

Expected: FAIL — `Cannot find module './color'`.

- [ ] **Step 3: Tulis implementasi**

Buat `src/lib/theme/color.ts`:

```ts
/**
 * Perhitungan warna untuk tema halaman publik.
 *
 * Semuanya fungsi murni tanpa DOM supaya bisa dipanggil di server, di klien,
 * dan diuji lewat `npm run test:unit`. Rumus luminansi dan rasio kontras
 * mengikuti WCAG 2.1.
 */

export type Rgb = { r: number; g: number; b: number };

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function hexToRgb(hex: string): Rgb {
  if (!HEX_PATTERN.test(hex)) {
    throw new Error(`Warna hex tidak valid: ${hex}`);
  }
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const bagian = (nilai: number) =>
    Math.max(0, Math.min(255, Math.round(nilai))).toString(16).padStart(2, "0");
  return `#${bagian(r)}${bagian(g)}${bagian(b)}`;
}

/** Kanal sRGB dilinearkan sebelum ditimbang — bukan rata-rata biasa. */
function kanalLinear(nilai: number): number {
  const rasio = nilai / 255;
  return rasio <= 0.04045 ? rasio / 12.92 : ((rasio + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (
    0.2126 * kanalLinear(r) + 0.7152 * kanalLinear(g) + 0.0722 * kanalLinear(b)
  );
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const terang = Math.max(la, lb);
  const gelap = Math.min(la, lb);
  return (terang + 0.05) / (gelap + 0.05);
}

export function isDark(hex: string): boolean {
  return relativeLuminance(hex) < 0.18;
}

/** Warna teks yang terbaca di atas `background`. */
export function readableOn(background: string): "#ffffff" | "#111111" {
  return contrastRatio("#ffffff", background) >= contrastRatio("#111111", background)
    ? "#ffffff"
    : "#111111";
}

function campur(dari: Rgb, ke: Rgb, rasio: number): Rgb {
  return {
    r: dari.r + (ke.r - dari.r) * rasio,
    g: dari.g + (ke.g - dari.g) * rasio,
    b: dari.b + (ke.b - dari.b) * rasio,
  };
}

/**
 * Menggeser `color` ke arah hitam atau putih secukupnya sampai kontrasnya
 * terhadap `background` memenuhi `minRatio`.
 *
 * Arahnya ditentukan oleh latar, bukan oleh warnanya sendiri: di atas latar
 * terang warna digelapkan, di atas latar gelap dicerahkan. Ini yang membuat
 * merchant tetap bisa memakai kuning cerah sebagai warna tombol tanpa pernah
 * menghasilkan tulisan yang hilang.
 */
export function ensureContrast(
  color: string,
  background: string,
  minRatio = 4.5,
): string {
  if (contrastRatio(color, background) >= minRatio) {
    return color;
  }

  const asal = hexToRgb(color);
  const tujuan: Rgb = isDark(background)
    ? { r: 255, g: 255, b: 255 }
    : { r: 0, g: 0, b: 0 };

  const LANGKAH = 20;
  for (let i = 1; i <= LANGKAH; i += 1) {
    const kandidat = rgbToHex(campur(asal, tujuan, i / LANGKAH));
    if (contrastRatio(kandidat, background) >= minRatio) {
      return kandidat;
    }
  }

  // Ujung skala: hitam pekat atau putih penuh. Kalau ini pun tidak cukup,
  // backgroundnya sendiri yang bermasalah dan tidak ada warna yang menolong.
  return rgbToHex(tujuan);
}
```

- [ ] **Step 4: Jalankan uji sampai lulus**

```bash
npm run test:unit
```

Expected: seluruh uji `color.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/theme/color.ts src/lib/theme/color.test.ts
git commit -m "Tambah utilitas warna dan penjaga kontras WCAG untuk tema"
```

---
### Task 7: Preset tema dan resolver

Inti fitur. `resolveTheme()` adalah satu-satunya tempat yang memutuskan seperti apa halaman merchant terlihat, dan satu-satunya penjaga terhadap merchant PRO yang turun paket.

**Files:**
- Create: `src/lib/theme/types.ts`, `src/lib/theme/presets.ts`, `src/lib/theme/resolve.ts`
- Test: `src/lib/theme/resolve.test.ts`

**Interfaces:**
- Consumes: `ensureContrast`, `readableOn`, `isDark` dari `src/lib/theme/color.ts`; tipe `MerchantTheme`, `SubscriptionTier`, `ThemePreset`, `FontPair`, `TextScale`, `CornerStyle`, `BackgroundStyle`, `ColorMode` dari `src/types/database.ts`
- Produces:
  - `type ResolvedTheme` (bentuk lengkap di Step 3)
  - `THEME_PRESETS: Record<ThemePreset, ThemePresetDefinition>`
  - `FREE_PRESETS: readonly ThemePreset[]`, `isFreePreset(preset): boolean`
  - `resolveTheme(tier: SubscriptionTier, row: MerchantTheme | null): ResolvedTheme`

- [ ] **Step 1: Tulis uji yang gagal**

Buat `src/lib/theme/resolve.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { MerchantTheme } from "@/types/database";

import { contrastRatio } from "./color";
import { THEME_PRESETS } from "./presets";
import { resolveTheme } from "./resolve";

function baris(ubah: Partial<MerchantTheme> = {}): MerchantTheme {
  return {
    merchant_id: "m1",
    preset: "BERSIH",
    accent: null,
    background_style: "SOLID",
    background_color: null,
    background_image_path: null,
    background_overlay: 45,
    font_pair: null,
    text_scale: "SEDANG",
    corner_style: null,
    created_at: "2026-08-20T00:00:00Z",
    updated_at: "2026-08-20T00:00:00Z",
    ...ubah,
  };
}

test("tanpa baris tema: jatuh ke preset BERSIH", () => {
  const tema = resolveTheme("PRO", null);
  assert.equal(tema.preset, "BERSIH");
  assert.equal(tema.background, THEME_PRESETS.BERSIH.background);
  assert.equal(tema.colorMode, "TERANG");
});

test("null pada font_pair dan corner_style berarti ikut preset", () => {
  const tema = resolveTheme("PRO", baris({ preset: "ELEGAN" }));
  assert.equal(tema.fontPair, THEME_PRESETS.ELEGAN.fontPair);
  assert.equal(tema.radius, "0rem");
});

test("preset gelap menghasilkan colorMode GELAP", () => {
  assert.equal(resolveTheme("PRO", baris({ preset: "MALAM" })).colorMode, "GELAP");
  assert.equal(resolveTheme("PRO", baris({ preset: "ELEGAN" })).colorMode, "GELAP");
  assert.equal(resolveTheme("PRO", baris({ preset: "HANGAT" })).colorMode, "TERANG");
});

test("STARTER dipangkas ke preset gratis dan nilai netral", () => {
  const tema = resolveTheme(
    "STARTER",
    baris({
      preset: "ELEGAN",
      accent: "#ff0000",
      background_style: "IMAGE",
      background_image_path: "m1/bg.webp",
      font_pair: "KLASIK",
      text_scale: "BESAR",
    }),
  );
  assert.equal(tema.preset, "BERSIH");
  assert.equal(tema.backgroundStyle, "SOLID");
  assert.equal(tema.backgroundImagePath, null);
  assert.equal(tema.fontPair, THEME_PRESETS.BERSIH.fontPair);
  assert.equal(tema.textScale, "SEDANG");
  assert.equal(tema.accentFill, THEME_PRESETS.BERSIH.accent);
});

test("STARTER tetap boleh memakai preset gratis dan gaya sudut", () => {
  const tema = resolveTheme(
    "STARTER",
    baris({ preset: "MALAM", corner_style: "BULAT" }),
  );
  assert.equal(tema.preset, "MALAM");
  assert.equal(tema.radius, "1.25rem");
});

test("aksen yang tidak terbaca digelapkan untuk teks, tapi utuh untuk isian", () => {
  const tema = resolveTheme("PRO", baris({ preset: "BERSIH", accent: "#ffe600" }));
  assert.equal(tema.accentFill, "#ffe600");
  assert.ok(contrastRatio(tema.accentText, tema.background) >= 4.5);
  assert.equal(tema.accentForeground, "#111111");
});

test("background pilihan sendiri tetap menghasilkan teks yang kontras", () => {
  const tema = resolveTheme(
    "PRO",
    baris({ preset: "BERSIH", background_color: "#101010" }),
  );
  assert.equal(tema.colorMode, "GELAP");
  assert.ok(contrastRatio(tema.foreground, tema.background) >= 4.5);
});

test("background bergambar memaksa overlay minimal 40", () => {
  const tema = resolveTheme(
    "PRO",
    baris({
      preset: "BERSIH",
      background_style: "IMAGE",
      background_image_path: "m1/bg.webp",
      background_overlay: 5,
    }),
  );
  assert.equal(tema.backgroundOverlay, 40);
  assert.equal(tema.backgroundImagePath, "m1/bg.webp");
});

test("background bergambar tanpa path jatuh kembali ke SOLID", () => {
  const tema = resolveTheme(
    "PRO",
    baris({ preset: "BERSIH", background_style: "IMAGE", background_image_path: null }),
  );
  assert.equal(tema.backgroundStyle, "SOLID");
});

test("skala teks dipetakan ke pengali", () => {
  assert.equal(resolveTheme("PRO", baris({ text_scale: "KECIL" })).scale, 0.9375);
  assert.equal(resolveTheme("PRO", baris({ text_scale: "SEDANG" })).scale, 1);
  assert.equal(resolveTheme("PRO", baris({ text_scale: "BESAR" })).scale, 1.125);
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
npm run test:unit
```

Expected: FAIL — modul `./presets` dan `./resolve` belum ada.

- [ ] **Step 3: Tulis `types.ts`**

Buat `src/lib/theme/types.ts`:

```ts
import type {
  BackgroundStyle,
  ColorMode,
  CornerStyle,
  FontPair,
  TextScale,
  ThemePreset,
} from "@/types/database";

/**
 * Tema yang sudah jadi: hasil menggabungkan preset dengan penimpaan merchant,
 * memangkas nilai premium, dan menegakkan kontras. Halaman publik maupun
 * preview dashboard hanya pernah melihat bentuk ini, tidak pernah baris mentah.
 */
export type ResolvedTheme = {
  preset: ThemePreset;
  /** Diturunkan dari luminansi permukaan, bukan dipilih merchant. */
  colorMode: ColorMode;
  background: string;
  foreground: string;
  card: string;
  mutedForeground: string;
  border: string;
  /** Warna mentah pilihan merchant, untuk latar tombol dan blok. */
  accentFill: string;
  /** Versi yang dijamin terbaca di atas `background`. */
  accentText: string;
  /** Warna teks di ATAS `accentFill`. */
  accentForeground: string;
  radius: string;
  fontPair: FontPair;
  textScale: TextScale;
  /** Pengali ukuran teks yang diturunkan dari `textScale`. */
  scale: number;
  backgroundStyle: BackgroundStyle;
  backgroundImagePath: string | null;
  backgroundOverlay: number;
  cornerStyle: CornerStyle;
};
```

- [ ] **Step 4: Tulis `presets.ts`**

Buat `src/lib/theme/presets.ts`:

```ts
import type { CornerStyle, FontPair, ThemePreset } from "@/types/database";

export type ThemePresetDefinition = {
  label: string;
  /** Kalimat pendek untuk kartu pilihan di editor. */
  description: string;
  background: string;
  foreground: string;
  card: string;
  mutedForeground: string;
  border: string;
  accent: string;
  corner: CornerStyle;
  fontPair: FontPair;
};

/**
 * Enam preset. Masing-masing menyetel warna, sudut, dan pasangan font
 * sekaligus, sehingga tidak ada keadaan "setengah jadi": tema apa pun yang
 * dipilih merchant selalu utuh.
 */
export const THEME_PRESETS: Record<ThemePreset, ThemePresetDefinition> = {
  BERSIH: {
    label: "Bersih",
    description: "Netral dan rapi. Aman untuk bidang usaha apa pun.",
    background: "#ffffff",
    foreground: "#252525",
    card: "#ffffff",
    mutedForeground: "#8a8a8a",
    border: "#e4e4e4",
    accent: "#252525",
    corner: "LEMBUT",
    fontPair: "NETRAL",
  },
  HANGAT: {
    label: "Hangat",
    description: "Krem lembut dengan aksen terakota. Cocok untuk MUA dan katering.",
    background: "#faf4ea",
    foreground: "#453425",
    card: "#ffffff",
    mutedForeground: "#8d7a63",
    border: "#e8dcc9",
    accent: "#b8613a",
    corner: "BULAT",
    fontPair: "HANGAT",
  },
  MALAM: {
    label: "Malam",
    description: "Gelap dan tegas. Cocok untuk fotografer, barber, dan studio tato.",
    background: "#1a1a1c",
    foreground: "#f5f5f5",
    card: "#1a1a1c",
    mutedForeground: "#9a9a9e",
    border: "#3a3a3d",
    accent: "#f5f5f5",
    corner: "TAJAM",
    fontPair: "MODERN",
  },
  PASTEL: {
    label: "Pastel",
    description: "Mint lembut dan bulat. Cocok untuk nail art, spa, dan kelas anak.",
    background: "#e9f6f1",
    foreground: "#254a41",
    card: "#ffffff",
    mutedForeground: "#5f8579",
    border: "#cfe7de",
    accent: "#2f8f76",
    corner: "BULAT",
    fontPair: "RAPI",
  },
  BERANI: {
    label: "Berani",
    description: "Kontras tinggi dan bergaris tebal. Cocok untuk studio kreatif.",
    background: "#fdfbf3",
    foreground: "#141414",
    card: "#fdfbf3",
    mutedForeground: "#6b6b66",
    border: "#141414",
    accent: "#e35d24",
    corner: "TAJAM",
    fontPair: "TEGAS",
  },
  ELEGAN: {
    label: "Elegan",
    description: "Hitam dan emas dengan serif tinggi. Cocok untuk wedding dan salon premium.",
    background: "#191510",
    foreground: "#f0e6d2",
    card: "#191510",
    mutedForeground: "#a5977e",
    border: "#4a3f2e",
    accent: "#c9a961",
    corner: "TAJAM",
    fontPair: "KLASIK",
  },
};

/**
 * Tiga preset gratis dipilih agar menutup tiga kutub berbeda — terang-netral,
 * terang-hangat, dan gelap. Merchant STARTER mana pun menemukan yang cocok,
 * sementara batasnya tetap terasa jelas. Kalau ketiganya varian terang yang
 * mirip, tidak ada yang merasa perlu upgrade.
 */
export const FREE_PRESETS: readonly ThemePreset[] = ["BERSIH", "HANGAT", "MALAM"];

export function isFreePreset(preset: ThemePreset): boolean {
  return FREE_PRESETS.includes(preset);
}

export const CORNER_RADIUS: Record<CornerStyle, string> = {
  TAJAM: "0rem",
  LEMBUT: "0.625rem",
  BULAT: "1.25rem",
};
```

- [ ] **Step 5: Tulis `resolve.ts`**

Buat `src/lib/theme/resolve.ts`:

```ts
import type { MerchantTheme, SubscriptionTier, TextScale } from "@/types/database";

import { ensureContrast, isDark, readableOn } from "./color";
import { CORNER_RADIUS, isFreePreset, THEME_PRESETS } from "./presets";
import type { ResolvedTheme } from "./types";

const SKALA_TEKS: Record<TextScale, number> = {
  KECIL: 0.9375,
  SEDANG: 1,
  BESAR: 1.125,
};

/**
 * Overlay minimum saat background berupa foto. Di bawah ini, teks di atas foto
 * yang ramai praktis tidak terbaca, dan tidak ada warna teks yang menolong.
 */
const OVERLAY_MINIMUM = 40;

/**
 * Menggabungkan preset dengan penimpaan merchant menjadi tema yang siap
 * dirender.
 *
 * Pemangkasan nilai premium di sini BUKAN duplikasi trigger
 * `merchant_themes_enforce_tier`. Trigger tidak pernah menyala saat merchant
 * PRO turun ke STARTER — barisnya sudah terlanjur premium dan tidak ada UPDATE
 * yang terjadi. Trigger menjaga data tetap bersih saat ditulis; fungsi ini
 * menjaga tampilan tetap benar saat dibaca.
 */
export function resolveTheme(
  tier: SubscriptionTier,
  row: MerchantTheme | null,
): ResolvedTheme {
  const starter = tier === "STARTER";

  const presetDiminta = row?.preset ?? "BERSIH";
  const preset = starter && !isFreePreset(presetDiminta) ? "BERSIH" : presetDiminta;
  const def = THEME_PRESETS[preset];

  // Null berarti "ikut preset" — lihat komentar kolom di migration.
  const cornerStyle = row?.corner_style ?? def.corner;
  const fontPair = starter ? def.fontPair : (row?.font_pair ?? def.fontPair);
  const textScale = starter ? "SEDANG" : (row?.text_scale ?? "SEDANG");

  const gayaDiminta = starter ? "SOLID" : (row?.background_style ?? "SOLID");
  const pathGambar = starter ? null : (row?.background_image_path ?? null);
  // Background bergambar tanpa gambar akan merender kotak kosong. Constraint DB
  // sudah menolak kombinasi ini, tapi baris lama milik merchant yang turun
  // paket bisa saja lolos — jadi dijaga lagi di sini.
  const backgroundStyle =
    gayaDiminta === "IMAGE" && pathGambar === null ? "SOLID" : gayaDiminta;

  const backgroundPilihan = starter ? null : (row?.background_color ?? null);
  const background = backgroundPilihan ?? def.background;

  // Saat background berupa foto, teks sebenarnya duduk di atas overlay berwarna
  // background preset — itulah permukaan yang menentukan kontras, bukan fotonya.
  const permukaan = backgroundStyle === "IMAGE" ? def.background : background;

  const accentFill = starter ? def.accent : (row?.accent ?? def.accent);

  return {
    preset,
    colorMode: isDark(permukaan) ? "GELAP" : "TERANG",
    background,
    // Merchant boleh mengganti warna background tanpa mengganti preset, jadi
    // warna teks preset belum tentu masih kontras. Digeser secukupnya.
    foreground: ensureContrast(def.foreground, permukaan, 4.5),
    card: backgroundPilihan ?? def.card,
    mutedForeground: ensureContrast(def.mutedForeground, permukaan, 3),
    border: ensureContrast(def.border, permukaan, 1.3),
    accentFill,
    accentText: ensureContrast(accentFill, permukaan, 4.5),
    accentForeground: readableOn(accentFill),
    radius: CORNER_RADIUS[cornerStyle],
    cornerStyle,
    fontPair,
    textScale,
    scale: SKALA_TEKS[textScale],
    backgroundStyle,
    backgroundImagePath: backgroundStyle === "IMAGE" ? pathGambar : null,
    backgroundOverlay:
      backgroundStyle === "IMAGE"
        ? Math.max(OVERLAY_MINIMUM, row?.background_overlay ?? OVERLAY_MINIMUM)
        : 0,
  };
}
```

- [ ] **Step 6: Jalankan uji sampai lulus**

```bash
npm run test:unit
```

Expected: seluruh uji `resolve.test.ts` PASS. Kalau uji `border` gagal karena `ensureContrast` mengembalikan warna terlalu gelap, periksa dulu rasio 1.3 — garis pemisah memang sengaja tidak sekontras teks.

- [ ] **Step 7: Commit**

```bash
git add src/lib/theme/types.ts src/lib/theme/presets.ts src/lib/theme/resolve.ts src/lib/theme/resolve.test.ts
git commit -m "Tambah preset tema dan resolver dengan pemangkasan paket serta penjaga kontras"
```

---

### Task 8: CSS custom property dan pemuatan font

**Files:**
- Create: `src/lib/theme/css.ts`, `src/lib/theme/fonts.ts`
- Test: `src/lib/theme/css.test.ts`

**Interfaces:**
- Consumes: `ResolvedTheme` dari Task 7
- Produces:
  - `themeToCssVars(theme: ResolvedTheme): React.CSSProperties`
  - `BOOKING_FONT_CLASSNAMES: string` — gabungan `className` variabel enam keluarga
  - `FONT_PAIR_VARS: Record<FontPair, { heading: string; body: string }>`

- [ ] **Step 1: Verifikasi asumsi Tailwind v4 sebelum menulis kode**

Seluruh mekanisme skala teks bersandar pada satu klaim: di Tailwind v4, utilitas `text-sm` mengompilasi menjadi `font-size: var(--text-sm)`, sehingga menimpa variabel itu pada elemen pembungkus akan menskalakan seluruh teks di dalamnya. Buktikan dulu, jangan diasumsikan.

```bash
grep -rn "\--text-sm" node_modules/tailwindcss/theme.css | head -5
```

Expected: baris yang mendefinisikan `--text-sm` (dan `--text-sm--line-height` sebagai rasio tanpa satuan, sehingga tinggi baris ikut menyesuaikan sendiri).

Kalau `--text-*` **tidak** dipakai seperti itu, hentikan dan pakai rencana cadangan: pancarkan token `--fs-body`, `--fs-heading`, `--fs-small` dari `themeToCssVars`, lalu pakai `text-[length:var(--fs-body)]` di komponen `src/components/booking-page/*`. Catat perubahan ini di plan sebelum lanjut.

- [ ] **Step 2: Tulis uji yang gagal**

Buat `src/lib/theme/css.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { themeToCssVars } from "./css";
import { resolveTheme } from "./resolve";

test("memancarkan token shadcn yang dibaca komponen", () => {
  const vars = themeToCssVars(resolveTheme("PRO", null)) as Record<string, string>;
  assert.equal(vars["--background"], "#ffffff");
  assert.equal(vars["--foreground"], "#252525");
  assert.equal(vars["--radius"], "0.625rem");
  assert.equal(vars["--font-sans"], "var(--font-plus-jakarta)");
});

test("skala teks menggeser seluruh token ukuran secara proporsional", () => {
  const sedang = themeToCssVars(
    resolveTheme("PRO", null),
  ) as Record<string, string>;
  assert.equal(sedang["--text-base"], "1rem");

  const besar = themeToCssVars({
    ...resolveTheme("PRO", null),
    textScale: "BESAR",
    scale: 1.125,
  }) as Record<string, string>;
  assert.equal(besar["--text-base"], "1.125rem");
  assert.equal(besar["--text-sm"], "0.984375rem");
});

test("overlay hanya dipancarkan saat background berupa gambar", () => {
  const solid = themeToCssVars(resolveTheme("PRO", null)) as Record<string, string>;
  assert.equal(solid["--page-overlay"], undefined);
});
```

- [ ] **Step 3: Jalankan uji untuk memastikan gagal**

```bash
npm run test:unit
```

Expected: FAIL — modul `./css` belum ada.

- [ ] **Step 4: Tulis `fonts.ts`**

Buat `src/lib/theme/fonts.ts`. Keenam keluarga ini variable font di Google Fonts, jadi `weight` sengaja tidak disebut — `next/font` memuat seluruh rentang berat. Periksa `node_modules/next/dist/docs/` bila API-nya berbeda dari yang Anda kenal.

```ts
import {
  DM_Sans,
  Fraunces,
  Inter,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Space_Grotesk,
} from "next/font/google";

import type { FontPair } from "@/types/database";

/**
 * `preload: false` disengaja. Tanpa itu, Next menyisipkan <link rel=preload>
 * untuk keenam keluarga di setiap halaman publik, padahal tema mana pun cuma
 * memakai satu atau dua. Dengan preload dimatikan, hanya aturan @font-face yang
 * ikut di CSS rute — murni teks, murah — dan berkas woff2 baru diunduh untuk
 * keluarga yang benar-benar dirujuk `--font-sans` / `--font-heading`.
 */
const opsi = { subsets: ["latin"] as const, display: "swap" as const, preload: false };

const plusJakarta = Plus_Jakarta_Sans({ ...opsi, variable: "--font-plus-jakarta" });
const inter = Inter({ ...opsi, variable: "--font-inter" });
const dmSans = DM_Sans({ ...opsi, variable: "--font-dm-sans" });
const spaceGrotesk = Space_Grotesk({ ...opsi, variable: "--font-space-grotesk" });
const playfair = Playfair_Display({ ...opsi, variable: "--font-playfair" });
const fraunces = Fraunces({ ...opsi, variable: "--font-fraunces" });

/**
 * Dipasang pada layout rute [username] dan pada bingkai preview dashboard —
 * bukan pada root layout, supaya dashboard dan landing tidak ikut menanggung
 * aturan @font-face yang tidak mereka pakai.
 */
export const BOOKING_FONT_CLASSNAMES = [
  plusJakarta.variable,
  inter.variable,
  dmSans.variable,
  spaceGrotesk.variable,
  playfair.variable,
  fraunces.variable,
].join(" ");

/** Enam pasangan dari enam keluarga; tiap keluarga dipakai ulang. */
export const FONT_PAIR_VARS: Record<FontPair, { heading: string; body: string }> = {
  NETRAL: { heading: "var(--font-plus-jakarta)", body: "var(--font-plus-jakarta)" },
  KLASIK: { heading: "var(--font-playfair)", body: "var(--font-inter)" },
  MODERN: { heading: "var(--font-space-grotesk)", body: "var(--font-dm-sans)" },
  HANGAT: { heading: "var(--font-fraunces)", body: "var(--font-dm-sans)" },
  TEGAS: { heading: "var(--font-space-grotesk)", body: "var(--font-space-grotesk)" },
  RAPI: { heading: "var(--font-inter)", body: "var(--font-inter)" },
};

export const FONT_PAIR_LABELS: Record<FontPair, string> = {
  NETRAL: "Netral",
  KLASIK: "Klasik",
  MODERN: "Modern",
  HANGAT: "Hangat",
  TEGAS: "Tegas",
  RAPI: "Rapi",
};
```

- [ ] **Step 5: Tulis `css.ts`**

Buat `src/lib/theme/css.ts`:

```ts
import type { CSSProperties } from "react";

import { FONT_PAIR_VARS } from "./fonts";
import type { ResolvedTheme } from "./types";

/** Ukuran dasar Tailwind v4 dalam rem, sebelum dikalikan skala teks merchant. */
const UKURAN_DASAR = {
  "--text-xs": 0.75,
  "--text-sm": 0.875,
  "--text-base": 1,
  "--text-lg": 1.125,
  "--text-xl": 1.25,
  "--text-2xl": 1.5,
} as const;

/**
 * Menerjemahkan tema jadi CSS custom property untuk dipasang inline pada satu
 * elemen pembungkus.
 *
 * Komponen shadcn membaca `--background`, `--foreground`, `--radius`, dan
 * kawan-kawan lewat `var(--…)`, jadi menimpanya di sini membuat semuanya ikut
 * bertema tanpa satu komponen pun diubah. Hal yang sama berlaku untuk ukuran
 * teks: di Tailwind v4, `text-sm` mengompilasi jadi `font-size: var(--text-sm)`,
 * dan tinggi barisnya rasio tanpa satuan sehingga menyesuaikan sendiri.
 */
export function themeToCssVars(theme: ResolvedTheme): CSSProperties {
  const font = FONT_PAIR_VARS[theme.fontPair];

  const ukuran: Record<string, string> = {};
  for (const [nama, rem] of Object.entries(UKURAN_DASAR)) {
    ukuran[nama] = `${rem * theme.scale}rem`;
  }

  const vars: Record<string, string> = {
    "--background": theme.background,
    "--foreground": theme.foreground,
    "--card": theme.card,
    "--card-foreground": theme.foreground,
    "--popover": theme.card,
    "--popover-foreground": theme.foreground,
    "--muted": theme.card,
    "--muted-foreground": theme.mutedForeground,
    "--border": theme.border,
    "--input": theme.border,
    "--ring": theme.accentFill,
    "--primary": theme.accentFill,
    "--primary-foreground": theme.accentForeground,
    "--accent-fill": theme.accentFill,
    "--accent-text": theme.accentText,
    "--radius": theme.radius,
    "--font-sans": font.body,
    "--font-heading": font.heading,
    ...ukuran,
  };

  if (theme.backgroundStyle === "IMAGE") {
    vars["--page-overlay"] = String(theme.backgroundOverlay / 100);
  }

  return vars as CSSProperties;
}
```

- [ ] **Step 6: Jalankan uji sampai lulus**

```bash
npm run test:unit
```

Expected: seluruh uji `css.test.ts` PASS.

- [ ] **Step 7: Gerbang akhir dan commit**

```bash
npm run check
```

```bash
git add src/lib/theme/css.ts src/lib/theme/css.test.ts src/lib/theme/fonts.ts
git commit -m "Pancarkan tema sebagai CSS custom property dan muat enam keluarga font"
```

---
### Task 9: Ekstrak tampilan halaman publik ke komponen bersama

Refactor murni: hasil render harus **identik** dengan sekarang. Tujuannya menyiapkan satu sumber tampilan yang nanti dipakai halaman publik dan preview dashboard, sehingga keduanya mustahil berbeda.

**Files:**
- Create: `src/lib/media/url.ts`, `src/components/booking-page/page-shell.tsx`, `src/components/booking-page/profile-header.tsx`, `src/components/booking-page/service-card.tsx`
- Modify: `src/app/[username]/page.tsx`

**Interfaces:**
- Consumes: `ResolvedTheme`, `themeToCssVars`, `BOOKING_FONT_CLASSNAMES` dari Task 7–8
- Produces:
  - `publicMediaUrl(path: string): string`
  - `<BookingPageShell theme={ResolvedTheme}>{children}</BookingPageShell>`
  - `<BookingProfileHeader name={string} bio={string | null} avatarUrl={string | null} />`
  - `<BookingServiceCard service={Service} media={ServiceMedia[]} eager={boolean} />`

- [ ] **Step 1: Tulis helper URL media**

Buat `src/lib/media/url.ts`:

```ts
import { clientEnv } from "@/lib/env/client";

export const MEDIA_BUCKET = "merchant-media";

/**
 * URL publik sebuah berkas di bucket merchant-media.
 *
 * Database menyimpan path, bukan URL penuh, supaya isi tabel tidak ikut basi
 * kalau host Supabase berubah. URL-nya dirakit di sini.
 */
export function publicMediaUrl(path: string): string {
  const base = clientEnv().supabaseUrl.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}
```

- [ ] **Step 2: Tulis `page-shell.tsx`**

Buat `src/components/booking-page/page-shell.tsx`:

```tsx
import type { ReactNode } from "react";

import { themeToCssVars } from "@/lib/theme/css";
import { BOOKING_FONT_CLASSNAMES } from "@/lib/theme/fonts";
import type { ResolvedTheme } from "@/lib/theme/types";
import { publicMediaUrl } from "@/lib/media/url";
import { cn } from "@/lib/utils";

/**
 * Pembungkus bertema halaman booking.
 *
 * Seluruh tema masuk lewat CSS custom property inline di elemen ini, sehingga
 * ikut ter-SSR dan tidak pernah ada kedipan warna default sebelum tema dipakai.
 * Kelas `dark` dipasang berdampingan karena `@custom-variant dark (&:is(.dark *))`
 * di globals.css menyasar keturunan, bukan elemen ini sendiri.
 */
export function BookingPageShell({
  theme,
  children,
  className,
}: {
  theme: ResolvedTheme;
  children: ReactNode;
  className?: string;
}) {
  const gambarLatar = theme.backgroundImagePath
    ? publicMediaUrl(theme.backgroundImagePath)
    : null;

  return (
    <div
      className={cn(
        "relative isolate min-h-svh w-full",
        BOOKING_FONT_CLASSNAMES,
        theme.colorMode === "GELAP" && "dark",
        className,
      )}
      style={{
        ...themeToCssVars(theme),
        backgroundColor: "var(--background)",
        color: "var(--foreground)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {gambarLatar ? (
        <>
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url("${gambarLatar}")` }}
          />
          {/* Overlay sewarna background preset. Inilah permukaan yang dipakai
              resolveTheme() saat menghitung kontras teks. */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              backgroundColor: "var(--background)",
              opacity: "var(--page-overlay)",
            }}
          />
        </>
      ) : null}

      <div className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-8 px-4 py-10">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Tulis `profile-header.tsx`**

Buat `src/components/booking-page/profile-header.tsx`. Markup-nya disalin apa adanya dari `src/app/[username]/page.tsx` yang sekarang, hanya ditambah `font-heading` pada judul.

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function BookingProfileHeader({
  name,
  bio,
  avatarUrl,
}: {
  name: string;
  bio: string | null;
  avatarUrl: string | null;
}) {
  return (
    <header className="flex flex-col items-center gap-3 text-center">
      <Avatar size="lg" className="size-16">
        <AvatarImage src={avatarUrl ?? undefined} alt={name} />
        <AvatarFallback className="text-lg">
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-1">
        <h1
          className="text-xl font-semibold tracking-tight text-balance"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {name}
        </h1>
        {bio ? <p className="text-muted-foreground text-sm text-pretty">{bio}</p> : null}
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Tulis `service-card.tsx`**

Buat `src/components/booking-page/service-card.tsx`. Untuk sekarang tanpa galeri — galerinya masuk di Task 11, supaya task ini tetap refactor tanpa perubahan tampilan.

```tsx
import { formatDuration, formatRupiah } from "@/lib/format";
import type { Service } from "@/types/database";

export function BookingServiceCard({ service }: { service: Service }) {
  return (
    <li className="border-border flex flex-col gap-1 border p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-balance">{service.name}</span>
        <span className="shrink-0 text-sm font-medium">{formatRupiah(service.price)}</span>
      </div>
      {service.description ? (
        <p className="text-muted-foreground text-sm text-pretty">{service.description}</p>
      ) : null}
      <span className="text-muted-foreground text-xs">
        {formatDuration(service.duration_minutes)}
      </span>
    </li>
  );
}
```

- [ ] **Step 5: Pakai komponen baru di halaman publik**

Di `src/app/[username]/page.tsx`, ganti blok `<header>` dengan `<BookingProfileHeader …/>` dan isi `<ul>` dengan `<BookingServiceCard key={service.id} service={service} />`. Belum menyentuh `BookingPageShell` — pembungkus bertema masuk di Task 10. Jangan ubah apa pun yang lain, termasuk `BookingSeam`, blok `Empty`, dan watermark STARTER.

- [ ] **Step 6: Verifikasi tidak ada perubahan tampilan**

```bash
npm run check
```

Lalu jalankan preview dan bandingkan dengan halaman sebelum refactor:

Buka preview lewat `preview_start` pada konfigurasi dev di `.claude/launch.json`, arahkan ke `/{username}` milik merchant uji, dan pastikan susunan, jarak, dan ukuran teksnya sama persis seperti sebelumnya. Perbedaan sekecil apa pun berarti markup tersalin tidak utuh.

- [ ] **Step 7: Commit**

```bash
git add src/lib/media/url.ts src/components/booking-page src/app/\[username\]/page.tsx
git commit -m "Ekstrak tampilan halaman booking ke komponen bersama"
```

---

### Task 10: Halaman publik memakai tema merchant

**Files:**
- Create: `src/app/[username]/layout.tsx`
- Modify: `src/app/[username]/page.tsx`

**Interfaces:**
- Consumes: `resolveTheme` (Task 7), `BookingPageShell` (Task 9)
- Produces: halaman `/[username]` yang dirender di dalam `BookingPageShell` dengan tema merchant, dan tema ikut terbawa `getMerchantPageData()`.

- [ ] **Step 1: Tambahkan layout rute untuk kelas variabel font**

Buat `src/app/[username]/layout.tsx`:

```tsx
import type { ReactNode } from "react";

/**
 * Rute ini sengaja punya layout sendiri supaya aturan @font-face keenam
 * keluarga tema hanya ikut di CSS halaman publik — dashboard dan landing tidak
 * perlu menanggungnya. Kelas variabelnya sendiri dipasang BookingPageShell,
 * karena preview di dashboard memakai shell yang sama tanpa lewat layout ini.
 */
export default function MerchantPublicLayout({ children }: { children: ReactNode }) {
  return children;
}
```

- [ ] **Step 2: Ambil tema bersama data merchant**

Di `src/app/[username]/page.tsx`, ubah query merchant supaya tema ikut menempel lewat embedding PostgREST — tetap satu round-trip:

```ts
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select(
      "id, username, full_name, bio, avatar_url, subscription_tier, merchant_themes(*)",
    )
    .eq("username", username)
    .maybeSingle();
```

Hasil embedding relasi satu-ke-satu berupa objek atau `null`. Normalkan sekali di tempat data dirakit, jangan diserakkan ke komponen:

```ts
  // Relasi satu-ke-satu: PostgREST mengembalikan objek atau null. Beberapa
  // versi mengembalikan array satu elemen, jadi keduanya ditangani di sini
  // supaya konsumen di bawah tidak perlu tahu bedanya.
  const themeRow = Array.isArray(merchant.merchant_themes)
    ? (merchant.merchant_themes[0] ?? null)
    : (merchant.merchant_themes ?? null);
```

Kembalikan `theme: resolveTheme(onboardedMerchant.subscription_tier, themeRow)` dari `getMerchantPageData()`.

- [ ] **Step 3: Bungkus halaman dengan shell bertema**

Ganti `<div className="mx-auto flex min-h-svh …">` terluar di `MerchantPublicPage` dengan `<BookingPageShell theme={theme}>`. Pembungkus lebar dan jarak sudah ada di dalam shell, jadi jangan digandakan.

- [ ] **Step 4: Verifikasi di preview**

Jalankan dev server lewat `preview_start`, lalu untuk merchant uji, setel tema langsung di database:

```sql
insert into public.merchant_themes (merchant_id, preset)
values ('<id-merchant-uji>', 'ELEGAN')
on conflict (merchant_id) do update set preset = excluded.preset;
```

Muat ulang `/{username}` dan periksa:
- latar gelap kecoklatan, teks ivory, sudut tajam, judul berserif Playfair;
- `read_console_messages` bersih dari error;
- **View Source** (bukan DOM setelah hidrasi) sudah memuat `style="--background:#191510…"` pada elemen pembungkus. Kalau tema hanya muncul setelah hidrasi, berarti ada komponen klien yang menyisip dan tema akan berkedip di koneksi lambat.

- [ ] **Step 5: Verifikasi tema STARTER dipangkas**

Turunkan merchant uji ke STARTER lalu muat ulang tanpa mengubah baris tema:

```sql
update public.merchants set subscription_tier = 'STARTER' where id = '<id-merchant-uji>';
```

Expected: halaman kembali ke preset BERSIH meskipun baris `merchant_themes` masih berisi `ELEGAN`. Inilah jalur yang tidak pernah disentuh trigger database. Kembalikan ke PRO setelah selesai.

- [ ] **Step 6: Commit**

```bash
npm run check
```

```bash
git add src/app/\[username\]
git commit -m "Terapkan tema merchant pada halaman publik lewat shell ber-SSR"
```

---

### Task 11: Galeri layanan, FAQ, dan JSON-LD

**Files:**
- Create: `src/components/booking-page/service-gallery.tsx`, `src/components/booking-page/faq-section.tsx`
- Modify: `src/components/booking-page/service-card.tsx`, `src/app/[username]/page.tsx`

**Interfaces:**
- Consumes: `publicMediaUrl` (Task 9), tipe `ServiceMedia`, `MerchantFaq` (Task 4–5)
- Produces:
  - `<BookingServiceGallery media={ServiceMedia[]} eager={boolean} />`
  - `<BookingFaqSection faqs={MerchantFaq[]} />` — mengembalikan `null` bila `faqs` kosong
  - `<BookingServiceCard service media eager />` dengan galeri terpasang

- [ ] **Step 1: Tulis `service-gallery.tsx`**

```tsx
import { publicMediaUrl } from "@/lib/media/url";
import type { ServiceMedia } from "@/types/database";

/**
 * Strip gulir horizontal ber-scroll-snap. Video, kalau ada, selalu slide
 * pertama.
 *
 * `preload="none"` disengaja dan penting: tanpa itu, tiap kunjungan halaman
 * mengunduh sebagian berkas video meski tidak ada yang menontonnya, dan biaya
 * bandwidth-nya ditanggung platform. Dengan poster + preload none, nol byte
 * video terunduh sampai pelanggan menekan play.
 */
export function BookingServiceGallery({
  media,
  eager = false,
}: {
  media: ServiceMedia[];
  eager?: boolean;
}) {
  if (media.length === 0) return null;

  const urut = [...media].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "VIDEO" ? -1 : 1;
    return a.sort_order - b.sort_order;
  });

  return (
    <ul className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1">
      {urut.map((item, index) => (
        <li
          key={item.id}
          className="border-border aspect-[4/3] w-4/5 shrink-0 snap-start overflow-hidden border"
          style={{ borderRadius: "var(--radius)" }}
        >
          {item.kind === "VIDEO" && item.poster_path ? (
            <video
              className="size-full object-cover"
              controls
              preload="none"
              playsInline
              poster={publicMediaUrl(item.poster_path)}
              width={item.width}
              height={item.height}
            >
              <source src={publicMediaUrl(item.path)} />
            </video>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- berkas sudah
            // dikompres ke WebP berukuran tetap di browser sebelum diunggah,
            // jadi next/image hanya akan menambah tagihan transformasi.
            <img
              className="size-full object-cover"
              src={publicMediaUrl(item.path)}
              alt={item.alt ?? ""}
              width={item.width}
              height={item.height}
              loading={eager && index === 0 ? "eager" : "lazy"}
              decoding="async"
            />
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Pasang galeri di kartu layanan**

Ubah `src/components/booking-page/service-card.tsx` agar menerima `media: ServiceMedia[]` dan `eager?: boolean`, lalu render `<BookingServiceGallery media={media} eager={eager} />` sebagai anak pertama di dalam `<li>`, sebelum baris nama dan harga.

- [ ] **Step 3: Tulis `faq-section.tsx`**

```tsx
import type { MerchantFaq } from "@/types/database";

/**
 * FAQ memakai <details>/<summary> asli, bukan accordion ber-JavaScript:
 * bisa dibuka tanpa hidrasi, sudah benar secara aksesibilitas dan keyboard,
 * dan tidak menambah satu byte pun JS ke halaman yang tugasnya mengubah
 * pengunjung jadi pesanan.
 *
 * Mengembalikan null saat merchant belum mengisi FAQ. Bagiannya memang TIDAK
 * ADA di HTML — bukan disembunyikan lewat CSS — sehingga tidak ada judul,
 * ikon, atau elemen kosong yang tersisa.
 */
export function BookingFaqSection({ faqs }: { faqs: MerchantFaq[] }) {
  if (faqs.length === 0) return null;

  return (
    <section aria-labelledby="faq-heading" className="flex flex-col gap-3">
      <h2
        id="faq-heading"
        className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.18em] uppercase"
      >
        Pertanyaan umum
      </h2>
      <ul className="flex flex-col gap-2">
        {faqs.map((faq) => (
          <li key={faq.id} className="border-border border">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium">
                {faq.question}
                <span aria-hidden className="text-muted-foreground shrink-0 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="text-muted-foreground px-4 pb-4 text-sm text-pretty whitespace-pre-line">
                {faq.answer}
              </p>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Muat media dan FAQ di halaman publik**

Di `getMerchantPageData()`, tambahkan `service_media(*)` ke query layanan dan jalankan FAQ paralel bersama `availability`:

```ts
  const [servicesResult, availabilityResult, faqsResult] = await Promise.all([
    supabase
      .from("services")
      .select("*, service_media(*)")
      .eq("merchant_id", onboardedMerchant.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("availability").select("*").eq("merchant_id", onboardedMerchant.id),
    supabase
      .from("merchant_faqs")
      .select("*")
      .eq("merchant_id", onboardedMerchant.id)
      .order("sort_order", { ascending: true }),
  ]);
```

Tangani `faqsResult.error` persis seperti dua yang lain: `console.error` lalu `throw`, bukan diam-diam jadi daftar kosong. FAQ yang hilang karena gangguan database tidak boleh terlihat sama dengan merchant yang memang belum mengisi FAQ.

`BookingSeam` menerima `services` — pastikan tipe yang dikirim ke sana tetap `Service[]`, dengan membuang `service_media` sebelum diteruskan, supaya tanda tangannya tidak ikut berubah.

- [ ] **Step 5: Render FAQ dan JSON-LD**

Tambahkan `<BookingFaqSection faqs={faqs} />` setelah bagian layanan dan sebelum watermark. Lalu, hanya bila `faqs.length > 0`, sisipkan structured data:

```tsx
      {faqs.length > 0 ? (
        <script
          type="application/ld+json"
          // Isinya milik merchant sendiri dan sudah dibatasi panjangnya oleh
          // constraint database. JSON.stringify menutup tanda kutip; kurung
          // sudut ditutup di bawah supaya string "</script>" di dalam jawaban
          // tidak bisa menutup tag ini lebih awal.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faqs.map((faq) => ({
                "@type": "Question",
                name: faq.question,
                acceptedAnswer: { "@type": "Answer", text: faq.answer },
              })),
            }).replace(/</g, "\\u003c"),
          }}
        />
      ) : null}
```

- [ ] **Step 6: Verifikasi di preview**

Isi data uji lewat SQL untuk merchant uji: dua gambar dan satu FAQ. Lalu di preview:
- galeri bisa digulir samping dan gambar tidak membuat halaman melompat saat dimuat;
- `read_network_requests` menunjukkan berkas video **tidak** terunduh sebelum tombol play ditekan;
- `<details>` bisa dibuka-tutup;
- hapus semua baris FAQ, muat ulang, dan pastikan `get_page_text` tidak lagi memuat "Pertanyaan umum" **dan** View Source tidak memuat blok `application/ld+json`.

- [ ] **Step 7: Commit**

```bash
npm run check
```

```bash
git add src/components/booking-page src/app/\[username\]/page.tsx
git commit -m "Tambah galeri layanan, FAQ, dan structured data FAQPage di halaman publik"
```

---

### Task 12: Pemrosesan media di browser

Semua yang berjalan di browser sebelum berkas menyentuh jaringan. Bagian murninya dipisah supaya bisa diuji tanpa DOM.

**Files:**
- Create: `src/lib/media/limits.ts`, `src/lib/media/compress.ts`, `src/lib/media/upload.ts`
- Test: `src/lib/media/limits.test.ts`

**Interfaces:**
- Consumes: `MEDIA_BUCKET` dari `src/lib/media/url.ts`; `createClient` dari `src/lib/supabase/client.ts`
- Produces:
  - `MEDIA_LIMITS` — konstanta batas
  - `validateImageFile(file: { type: string; size: number }): string | null` — pesan error atau `null`
  - `validateVideoFile(file: { type: string; size: number }, durationSeconds: number): string | null`
  - `compressImage(file: File, opts: { maxSide: number; square: boolean }): Promise<{ blob: Blob; width: number; height: number }>`
  - `captureVideoPoster(file: File): Promise<{ blob: Blob; width: number; height: number; duration: number }>`
  - `uploadMedia(path: string, blob: Blob, contentType: string): Promise<void>`
  - `removeMedia(paths: string[]): Promise<void>`

- [ ] **Step 1: Tulis uji yang gagal**

Buat `src/lib/media/limits.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { MEDIA_LIMITS, validateImageFile, validateVideoFile } from "./limits";

test("gambar dengan tipe dan ukuran wajar diterima", () => {
  assert.equal(validateImageFile({ type: "image/jpeg", size: 2_000_000 }), null);
});

test("gambar bertipe asing ditolak dengan pesan berbahasa Indonesia", () => {
  const pesan = validateImageFile({ type: "image/gif", size: 1000 });
  assert.ok(pesan);
  assert.match(pesan, /JPG|PNG|WebP/);
});

test("gambar melampaui batas unggah ditolak", () => {
  const pesan = validateImageFile({
    type: "image/png",
    size: MEDIA_LIMITS.imageMaxUploadBytes + 1,
  });
  assert.ok(pesan);
});

test("video melampaui 20MB ditolak", () => {
  const pesan = validateVideoFile(
    { type: "video/mp4", size: MEDIA_LIMITS.videoMaxBytes + 1 },
    10,
  );
  assert.ok(pesan);
  assert.match(pesan, /20 ?MB/);
});

test("video lebih panjang dari 30 detik ditolak", () => {
  const pesan = validateVideoFile({ type: "video/mp4", size: 1_000_000 }, 45);
  assert.ok(pesan);
  assert.match(pesan, /30 detik/);
});

test("video mp4 pendek diterima", () => {
  assert.equal(validateVideoFile({ type: "video/mp4", size: 5_000_000 }, 12), null);
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
npm run test:unit
```

Expected: FAIL — modul `./limits` belum ada.

- [ ] **Step 3: Tulis `limits.ts`**

```ts
/**
 * Batas media.
 *
 * Angka-angka ini WAJIB sejalan dengan setelan bucket di migration
 * 20260820000200_storage_bucket.sql. Yang di sini memberi pesan yang enak
 * dibaca sebelum berkas dikirim; yang di bucket adalah yang benar-benar
 * mengikat, karena pemeriksaan di browser bisa dilewati siapa pun yang
 * menembak Storage langsung.
 */
export const MEDIA_LIMITS = {
  imageTypes: ["image/jpeg", "image/png", "image/webp"],
  videoTypes: ["video/mp4", "video/webm"],
  /** Batas berkas mentah yang boleh dipilih merchant, sebelum dikompres. */
  imageMaxUploadBytes: 12 * 1024 * 1024,
  videoMaxBytes: 20 * 1024 * 1024,
  videoMaxSeconds: 30,
  avatarMaxSide: 512,
  backgroundMaxSide: 1200,
  serviceImageMaxSide: 800,
  maxServiceImages: 5,
  maxFaqs: 10,
} as const;

export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!MEDIA_LIMITS.imageTypes.includes(file.type as never)) {
    return "Format gambar harus JPG, PNG, atau WebP.";
  }
  if (file.size > MEDIA_LIMITS.imageMaxUploadBytes) {
    return "Ukuran gambar maksimal 12MB.";
  }
  return null;
}

export function validateVideoFile(
  file: { type: string; size: number },
  durationSeconds: number,
): string | null {
  if (!MEDIA_LIMITS.videoTypes.includes(file.type as never)) {
    return "Format video harus MP4 atau WebM.";
  }
  if (file.size > MEDIA_LIMITS.videoMaxBytes) {
    return "Ukuran video maksimal 20MB.";
  }
  if (durationSeconds > MEDIA_LIMITS.videoMaxSeconds) {
    return "Durasi video maksimal 30 detik.";
  }
  return null;
}
```

- [ ] **Step 4: Jalankan uji sampai lulus**

```bash
npm run test:unit
```

Expected: seluruh uji `limits.test.ts` PASS.

- [ ] **Step 5: Tulis `compress.ts`**

```ts
"use client";

/**
 * Pengecilan gambar dan pembuatan poster video lewat canvas.
 *
 * Semuanya terjadi di browser SEBELUM berkas menyentuh jaringan. Selain
 * menghemat kuota merchant, ini yang membuat halaman publik bisa memakai
 * <img> biasa dengan ukuran yang sudah pasti, tanpa optimisasi gambar berbayar.
 */

const KUALITAS_WEBP = 0.82;

function muatGambar(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gambar tidak bisa dibaca."));
    };
    img.src = url;
  });
}

function keBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Gagal mengubah gambar ke WebP.")),
      "image/webp",
      KUALITAS_WEBP,
    );
  });
}

export async function compressImage(
  file: File,
  { maxSide, square }: { maxSide: number; square: boolean },
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await muatGambar(file);

  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;

  if (square) {
    // Center-crop, bukan digepengkan: avatar selalu tampil dalam lingkaran,
    // jadi rasio yang salah langsung kelihatan.
    const sisi = Math.min(sw, sh);
    sx = (sw - sisi) / 2;
    sy = (sh - sisi) / 2;
    sw = sisi;
    sh = sisi;
  }

  const rasio = Math.min(1, maxSide / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * rasio));
  const height = Math.max(1, Math.round(sh * rasio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser tidak mendukung pemrosesan gambar.");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);

  return { blob: await keBlob(canvas), width, height };
}

/**
 * Mengambil bingkai detik ke-1 sebagai poster video, sekaligus melaporkan
 * durasi dan dimensinya. Merchant tidak perlu mengunggah thumbnail terpisah.
 */
export async function captureVideoPoster(
  file: File,
): Promise<{ blob: Blob; width: number; height: number; duration: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Video tidak bisa dibaca."));
      video.src = url;
    });

    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Video tidak bisa dibaca."));
      // Klip yang lebih pendek dari 1 detik tetap harus dapat poster.
      video.currentTime = Math.min(1, Math.max(0, video.duration - 0.1));
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Browser tidak mendukung pemrosesan video.");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return {
      blob: await keBlob(canvas),
      width: canvas.width,
      height: canvas.height,
      duration: video.duration,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

- [ ] **Step 6: Tulis `upload.ts`**

```ts
"use client";

import { createClient } from "@/lib/supabase/client";

import { MEDIA_BUCKET } from "./url";

/**
 * Unggahan berjalan dari browser LANGSUNG ke Storage memakai klien bersesi,
 * jadi yang menjaga adalah policy RLS "folder pertama harus sama dengan
 * auth.uid()", bukan kode route handler yang bisa lupa memeriksa.
 */
export async function uploadMedia(
  path: string,
  blob: Blob,
  contentType: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, blob, { contentType, upsert: false });

  if (error) {
    throw new Error(`Gagal mengunggah berkas: ${error.message}`);
  }
}

/**
 * Menghapus berkas. Dipakai dua kali: saat merchant mengganti berkas lama, dan
 * saat penyimpanan baris database gagal setelah berkas terlanjur mendarat
 * (misalnya trigger menolak video milik merchant STARTER) — tanpa ini, bucket
 * perlahan terisi berkas yang tidak dirujuk apa pun.
 */
export async function removeMedia(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const supabase = createClient();
  await supabase.storage.from(MEDIA_BUCKET).remove(paths);
}

/** Nama berkas acak; menjaga URL lama tidak tertimpa di cache CDN. */
export function mediaFileName(prefix: string, ext: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
}
```

- [ ] **Step 7: Commit**

```bash
npm run check
```

```bash
git add src/lib/media
git commit -m "Tambah kompresi gambar, poster video otomatis, dan unggahan Storage di browser"
```

---
### Task 13: Validasi Zod dan Server Action tema

**Files:**
- Create: `src/lib/validations/theme.ts`, `src/app/dashboard/halaman/appearance-state.ts`, `src/app/dashboard/halaman/actions.ts`
- Test: `src/lib/validations/theme.test.ts`

**Interfaces:**
- Consumes: `FREE_PRESETS`, `isFreePreset` (Task 7); `MEDIA_LIMITS` (Task 12)
- Produces:
  - `themeSchema` — Zod, menghasilkan `ThemeInput`
  - `faqSchema`, `faqListSchema` — Zod untuk Task 15
  - `type AppearanceFormState`, `INITIAL_APPEARANCE_STATE`
  - `updateTheme(prev, formData): Promise<AppearanceFormState>`
  - `updateProfileMedia(prev, formData): Promise<AppearanceFormState>`

- [ ] **Step 1: Tulis uji yang gagal**

Buat `src/lib/validations/theme.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { faqSchema, themeSchema } from "./theme";

test("menerima tema minimal", () => {
  const hasil = themeSchema.safeParse({
    preset: "HANGAT",
    background_style: "SOLID",
    background_overlay: "45",
    text_scale: "SEDANG",
  });
  assert.ok(hasil.success, JSON.stringify(hasil.error?.issues));
  assert.equal(hasil.data.accent, null);
  assert.equal(hasil.data.font_pair, null);
});

test("menormalkan hex huruf besar dan menolak yang bukan hex", () => {
  const ok = themeSchema.safeParse({
    preset: "BERSIH",
    background_style: "SOLID",
    background_overlay: "45",
    text_scale: "SEDANG",
    accent: "#FF8800",
  });
  assert.ok(ok.success);
  assert.equal(ok.data.accent, "#ff8800");

  const gagal = themeSchema.safeParse({
    preset: "BERSIH",
    background_style: "SOLID",
    background_overlay: "45",
    text_scale: "SEDANG",
    accent: "merah",
  });
  assert.equal(gagal.success, false);
});

test("menolak overlay di luar 0-80", () => {
  const gagal = themeSchema.safeParse({
    preset: "BERSIH",
    background_style: "SOLID",
    background_overlay: "95",
    text_scale: "SEDANG",
  });
  assert.equal(gagal.success, false);
});

test("background IMAGE wajib disertai path gambar", () => {
  const gagal = themeSchema.safeParse({
    preset: "BERSIH",
    background_style: "IMAGE",
    background_overlay: "45",
    text_scale: "SEDANG",
  });
  assert.equal(gagal.success, false);
});

test("FAQ menolak pertanyaan terlalu pendek dan jawaban kosong", () => {
  assert.equal(faqSchema.safeParse({ question: "ab", answer: "x" }).success, false);
  assert.equal(faqSchema.safeParse({ question: "Bisa reschedule?", answer: "  " }).success, false);
  assert.ok(faqSchema.safeParse({ question: "Bisa reschedule?", answer: "Bisa." }).success);
});
```

- [ ] **Step 2: Jalankan uji untuk memastikan gagal**

```bash
npm run test:unit
```

Expected: FAIL — modul `./theme` belum ada.

- [ ] **Step 3: Tulis `src/lib/validations/theme.ts`**

```ts
import { z } from "zod";

import { MEDIA_LIMITS } from "@/lib/media/limits";

const HEX = /^#[0-9a-f]{6}$/;

/** String kosong dari FormData berarti "tidak diisi", bukan nilai kosong. */
const hexOpsional = z
  .string()
  .trim()
  .toLowerCase()
  .transform((nilai) => (nilai === "" ? null : nilai))
  .nullable()
  .refine((nilai) => nilai === null || HEX.test(nilai), {
    message: "Warna harus berupa kode hex enam digit, misalnya #b8613a",
  })
  .default(null);

export const themeSchema = z
  .object({
    preset: z.enum(["BERSIH", "HANGAT", "MALAM", "PASTEL", "BERANI", "ELEGAN"]),
    accent: hexOpsional,
    background_style: z.enum(["SOLID", "GRADIENT", "IMAGE"]),
    background_color: hexOpsional,
    background_image_path: z
      .string()
      .trim()
      .transform((nilai) => (nilai === "" ? null : nilai))
      .nullable()
      .default(null),
    background_overlay: z.coerce
      .number()
      .int()
      .min(0, "Overlay minimal 0")
      .max(80, "Overlay maksimal 80"),
    font_pair: z
      .enum(["NETRAL", "KLASIK", "MODERN", "HANGAT", "TEGAS", "RAPI"])
      .nullable()
      .default(null),
    text_scale: z.enum(["KECIL", "SEDANG", "BESAR"]),
    corner_style: z.enum(["TAJAM", "LEMBUT", "BULAT"]).nullable().default(null),
  })
  // Cermin constraint merchant_themes_image_requires_path. Ditolak di sini juga
  // supaya merchant dapat pesan yang bisa dibaca, bukan galat Postgres mentah.
  .refine(
    (nilai) => nilai.background_style !== "IMAGE" || nilai.background_image_path !== null,
    {
      path: ["background_image_path"],
      message: "Unggah dulu gambar backgroundnya.",
    },
  );

export type ThemeInput = z.infer<typeof themeSchema>;

export const faqSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "Pertanyaan minimal 3 karakter")
    .max(200, "Pertanyaan maksimal 200 karakter"),
  answer: z
    .string()
    .trim()
    .min(1, "Jawaban tidak boleh kosong")
    .max(1000, "Jawaban maksimal 1000 karakter"),
});

// Angka yang sama dengan trigger merchant_faqs_enforce_limit dan dengan
// MEDIA_LIMITS.maxFaqs. Diambil dari satu konstanta supaya ketiganya tidak
// bisa berbeda diam-diam.
export const faqListSchema = z
  .array(faqSchema)
  .max(MEDIA_LIMITS.maxFaqs, `Maksimal ${MEDIA_LIMITS.maxFaqs} pertanyaan pada FAQ`);
```

- [ ] **Step 4: Jalankan uji sampai lulus**

```bash
npm run test:unit
```

Expected: seluruh uji `theme.test.ts` PASS.

- [ ] **Step 5: Tulis `appearance-state.ts`**

Ikuti bentuk `src/app/dashboard/settings/settings-state.ts` yang sudah ada.

```ts
export type AppearanceFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<"accent" | "background_image_path" | "faqs", string>>;
};

export const INITIAL_APPEARANCE_STATE: AppearanceFormState = { status: "idle" };
```

- [ ] **Step 6: Tulis `actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireMerchant } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { themeSchema } from "@/lib/validations/theme";

import type { AppearanceFormState } from "./appearance-state";

/**
 * Trigger merchant_themes_enforce_tier melempar P0001 dengan pesan yang sudah
 * berbahasa Indonesia dan sudah menyebut paket Pro, jadi pesannya diteruskan
 * apa adanya ketimbang ditulis ulang di sini dan berisiko berbeda.
 */
function pesanDariError(error: { code?: string; message: string }): string {
  return error.code === "P0001"
    ? error.message
    : "Perubahan gagal disimpan. Coba lagi sebentar lagi.";
}

export async function updateTheme(
  _prevState: AppearanceFormState,
  formData: FormData,
): Promise<AppearanceFormState> {
  const { user } = await requireMerchant();

  const parsed = themeSchema.safeParse({
    preset: formData.get("preset"),
    accent: formData.get("accent") ?? "",
    background_style: formData.get("background_style"),
    background_color: formData.get("background_color") ?? "",
    background_image_path: formData.get("background_image_path") ?? "",
    background_overlay: formData.get("background_overlay"),
    font_pair: formData.get("font_pair") || null,
    text_scale: formData.get("text_scale"),
    corner_style: formData.get("corner_style") || null,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      status: "error",
      message: issue.message,
      fieldErrors: { [issue.path[0] as "accent"]: issue.message },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("merchant_themes")
    .upsert({ merchant_id: user.id, ...parsed.data }, { onConflict: "merchant_id" });

  if (error) {
    return { status: "error", message: pesanDariError(error) };
  }

  // Halaman publik dirender di server, jadi cache-nya harus dibuang eksplisit
  // atau merchant akan mengira perubahannya tidak tersimpan.
  const { merchant } = await requireMerchant();
  if (merchant.username) {
    revalidatePath(ROUTES.merchantPage(merchant.username));
  }
  revalidatePath(ROUTES.appearance);

  return { status: "success", message: "Tampilan tersimpan" };
}

/**
 * Menyimpan path foto profil setelah berkasnya mendarat di Storage. Berkas
 * lamanya sudah dihapus di klien; kalau baris ini gagal disimpan, klien juga
 * yang menghapus berkas baru (lihat removeMedia di src/lib/media/upload.ts).
 */
export async function updateProfileMedia(
  _prevState: AppearanceFormState,
  formData: FormData,
): Promise<AppearanceFormState> {
  const { user, merchant } = await requireMerchant();

  const avatarUrl = String(formData.get("avatar_url") ?? "").trim();
  if (avatarUrl !== "" && !avatarUrl.startsWith("https://")) {
    return { status: "error", message: "Alamat foto profil tidak valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("merchants")
    .update({ avatar_url: avatarUrl === "" ? null : avatarUrl })
    .eq("id", user.id);

  if (error) {
    return { status: "error", message: "Foto profil gagal disimpan." };
  }

  if (merchant.username) {
    revalidatePath(ROUTES.merchantPage(merchant.username));
  }
  revalidatePath(ROUTES.appearance);

  return { status: "success", message: "Foto profil tersimpan" };
}
```

Catatan: `ROUTES.appearance` belum ada sampai Task 17. Tambahkan barisnya sekarang di `src/lib/routes.ts` — `appearance: "/dashboard/halaman",` — supaya file ini bisa dikompilasi; sisa pekerjaan navigasi tetap di Task 17.

- [ ] **Step 7: Commit**

```bash
npm run check
```

```bash
git add src/lib/validations/theme.ts src/lib/validations/theme.test.ts src/app/dashboard/halaman src/lib/routes.ts
git commit -m "Tambah validasi tema dan Server Action penyimpan tampilan"
```

---

### Task 14: Halaman `/dashboard/halaman` dengan preview hidup

**Files:**
- Create: `src/app/dashboard/halaman/page.tsx`, `src/app/dashboard/halaman/preview-frame.tsx`, `src/app/dashboard/halaman/appearance-editor.tsx`

**Interfaces:**
- Consumes: `resolveTheme`, `THEME_PRESETS`, `FREE_PRESETS`, `BookingPageShell`, `BookingProfileHeader`, `BookingServiceCard`, `BookingFaqSection`, `updateTheme`, `updateProfileMedia`, `compressImage`, `uploadMedia`, `removeMedia`, `mediaFileName`
- Produces: halaman editor tampilan; `<AppearancePreview theme merchant services faqs />`

- [ ] **Step 1: Tulis `preview-frame.tsx`**

```tsx
"use client";

import { BookingFaqSection } from "@/components/booking-page/faq-section";
import { BookingPageShell } from "@/components/booking-page/page-shell";
import { BookingProfileHeader } from "@/components/booking-page/profile-header";
import { BookingServiceCard } from "@/components/booking-page/service-card";
import type { ResolvedTheme } from "@/lib/theme/types";
import type { MerchantFaq, Service, ServiceMedia } from "@/types/database";

/**
 * Preview memakai komponen yang SAMA PERSIS dengan halaman publik, hanya
 * diberi tema berbeda. Itu sebabnya preview tidak bisa berbohong: kalau
 * tampilannya berubah di sini, ia berubah juga di sana.
 *
 * Pemilih jadwal sengaja diganti stand-in mati — preview tidak boleh
 * menyentuh logika booking sungguhan, apalagi membuat pesanan hantu.
 */
export function AppearancePreview({
  theme,
  name,
  bio,
  avatarUrl,
  services,
  media,
  faqs,
}: {
  theme: ResolvedTheme;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  services: Service[];
  media: Record<string, ServiceMedia[]>;
  faqs: MerchantFaq[];
}) {
  return (
    <div className="border-border mx-auto w-full max-w-[380px] overflow-hidden rounded-[2rem] border-8 border-neutral-800 shadow-sm">
      <div className="max-h-[640px] overflow-y-auto">
        <BookingPageShell theme={theme} className="min-h-0">
          <BookingProfileHeader name={name} bio={bio} avatarUrl={avatarUrl} />

          {services.length > 0 ? (
            <section className="flex flex-col gap-4">
              <h2 className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.18em] uppercase">
                Layanan
              </h2>
              <ul className="flex flex-col gap-3">
                {services.map((service, index) => (
                  <BookingServiceCard
                    key={service.id}
                    service={service}
                    media={media[service.id] ?? []}
                    eager={index === 0}
                  />
                ))}
              </ul>
              <div
                aria-hidden
                className="bg-primary text-primary-foreground py-3 text-center text-sm font-medium"
                style={{ borderRadius: "var(--radius)" }}
              >
                Pilih jadwal
              </div>
            </section>
          ) : (
            <p className="text-muted-foreground text-center text-sm">
              Belum ada layanan untuk ditampilkan.
            </p>
          )}

          <BookingFaqSection faqs={faqs} />
        </BookingPageShell>
      </div>
    </div>
  );
}
```

`BookingPageShell` perlu menerima `className` yang bisa menetralkan `min-h-svh` — sudah disiapkan di Task 9 lewat `cn(...)`. Pastikan `min-h-0` benar-benar menang; kalau tidak, ubah `min-h-svh` di shell menjadi kelas yang bisa ditimpa, misalnya dengan memindahkannya ke prop `className` default.

- [ ] **Step 2: Tulis `appearance-editor.tsx`**

Komponen klien yang memegang seluruh state tema, memanggil `<AppearancePreview>` dengan `resolveTheme(tier, stateSaatIni)`, dan mengirim `updateTheme` lewat `useActionState`. Susunan kontrol dari atas ke bawah, sesuai dampak visualnya:

1. **Foto profil** — `<input type="file" accept="image/*">`; saat dipilih, jalankan `validateImageFile`, lalu `compressImage(file, { maxSide: MEDIA_LIMITS.avatarMaxSide, square: true })`, `uploadMedia(`${merchantId}/${mediaFileName("avatar", "webp")}`, blob, "image/webp")`, lalu kirim `updateProfileMedia`. Bila penyimpanan gagal, panggil `removeMedia([pathBaru])`. Bila berhasil dan ada berkas lama di bucket kita, panggil `removeMedia([pathLama])`.
2. **Tema** — grid kartu dari `THEME_PRESETS`. Kartu preset premium untuk merchant STARTER tetap tampil, dengan `<Badge>Pro</Badge>` dan `Link` ke `ROUTES.billing`, dan `disabled`.
3. **Warna aksen** — `<input type="color">` plus isian hex, dengan tombol "Ikut tema" yang mengembalikannya ke `null`.
4. **Background** — pilihan SOLID / GRADIENT / IMAGE; untuk IMAGE, unggah dengan `MEDIA_LIMITS.backgroundMaxSide` dan `square: false`, plus slider overlay 40–80.
5. **Font** — `<Select>` dari `FONT_PAIR_LABELS`, dengan opsi pertama "Ikut tema" bernilai kosong.
6. **Ukuran teks** — tiga tombol Kecil / Sedang / Besar.
7. **Sudut** — tiga tombol Tajam / Lembut / Bulat.

Aturan yang mengikat di komponen ini:

- Setiap kontrol premium untuk merchant STARTER **tampil tapi terkunci**, bukan disembunyikan. Merchant yang tidak pernah melihat apa yang bisa dibeli tidak akan membelinya.
- Nilai `null` berarti "ikut tema" dan harus punya jalan kembali di UI. Tanpa itu, merchant yang sekali menyentuh warna aksen tidak akan pernah bisa membatalkannya.
- Tombol **Simpan** eksplisit di bagian bawah panel, plus tombol "Lihat halaman saya" yang membuka `ROUTES.merchantPage(username)` di tab baru. Jangan auto-save: halaman ini sedang dilihat pelanggan.
- Di bawah `md`, panel dan preview jadi dua tab memakai `@/components/ui/tabs` yang sudah ada — jangan menumpuk preview di bawah panel.

- [ ] **Step 3: Tulis `page.tsx`**

```tsx
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { requireMerchant } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { AppearanceEditor } from "./appearance-editor";

export const metadata: Metadata = { title: "Halaman saya" };

export default async function AppearancePage() {
  const { user, merchant } = await requireMerchant();
  const supabase = await createClient();

  const [themeResult, profilResult, servicesResult, faqsResult] = await Promise.all([
    supabase.from("merchant_themes").select("*").eq("merchant_id", user.id).maybeSingle(),
    // requireMerchant() tidak membawa `bio`, sedangkan halaman publik
    // menampilkannya. Diambil di sini supaya preview tidak diam-diam berbeda
    // dari hasil akhir hanya karena satu kolom hilang.
    supabase.from("merchants").select("bio").eq("id", user.id).maybeSingle(),
    supabase
      .from("services")
      .select("*, service_media(*)")
      .eq("merchant_id", user.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("merchant_faqs")
      .select("*")
      .eq("merchant_id", user.id)
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <>
      <PageHeader
        title="Halaman saya"
        description="Atur tampilan halaman booking yang dilihat pelanggan."
      />
      <AppearanceEditor
        tier={merchant.subscription_tier}
        merchantId={user.id}
        username={merchant.username}
        name={merchant.full_name ?? merchant.username ?? ""}
        bio={profilResult.data?.bio ?? null}
        avatarUrl={merchant.avatar_url}
        theme={themeResult.data ?? null}
        services={servicesResult.data ?? []}
        faqs={faqsResult.data ?? []}
      />
    </>
  );
}
```

- [ ] **Step 4: Verifikasi di preview**

Jalankan dev server, buka `/dashboard/halaman`, lalu:
- ganti preset dan pastikan bingkai kanan berubah **seketika**, tanpa reload;
- tekan Simpan, buka `/{username}` di tab lain, dan pastikan hasilnya sama persis dengan preview;
- masuk sebagai merchant STARTER dan pastikan kartu preset premium tampil terkunci dengan lencana Pro, bukan hilang;
- `read_console_messages` bersih dari error hidrasi.

- [ ] **Step 5: Verifikasi unggah foto profil**

Unggah foto berukuran besar dan periksa lewat `read_network_requests` bahwa berkas yang dikirim ke Storage bertipe `image/webp` dan jauh lebih kecil dari aslinya. Muat ulang halaman publik dan pastikan fotonya tampil.

- [ ] **Step 6: Commit**

```bash
npm run check
```

```bash
git add src/app/dashboard/halaman
git commit -m "Tambah halaman editor tampilan dengan preview hidup berbagi komponen"
```

---

### Task 15: Editor FAQ

**Files:**
- Create: `src/app/dashboard/halaman/faq-editor.tsx`
- Modify: `src/app/dashboard/halaman/actions.ts`, `src/app/dashboard/halaman/appearance-editor.tsx`

**Interfaces:**
- Consumes: `faqListSchema` (Task 13)
- Produces: `saveFaqs(prev, formData): Promise<AppearanceFormState>`; `<FaqEditor faqs onChange />`

- [ ] **Step 1: Tambahkan `saveFaqs` ke `actions.ts`**

```ts
export async function saveFaqs(
  _prevState: AppearanceFormState,
  formData: FormData,
): Promise<AppearanceFormState> {
  const { user, merchant } = await requireMerchant();

  let mentah: unknown;
  try {
    mentah = JSON.parse(String(formData.get("faqs") ?? "[]"));
  } catch {
    return { status: "error", message: "Data FAQ tidak terbaca." };
  }

  const parsed = faqListSchema.safeParse(mentah);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0].message,
      fieldErrors: { faqs: parsed.error.issues[0].message },
    };
  }

  const supabase = await createClient();

  // Ganti seluruh daftar, bukan diff per baris: urutannya ikut berubah setiap
  // kali merchant menyusun ulang, dan daftar maksimal sepuluh baris terlalu
  // kecil untuk pantas dibuatkan rekonsiliasi sendiri.
  const { error: hapusError } = await supabase
    .from("merchant_faqs")
    .delete()
    .eq("merchant_id", user.id);

  if (hapusError) {
    return { status: "error", message: "FAQ gagal disimpan." };
  }

  if (parsed.data.length > 0) {
    const { error: simpanError } = await supabase.from("merchant_faqs").insert(
      parsed.data.map((faq, index) => ({
        merchant_id: user.id,
        question: faq.question,
        answer: faq.answer,
        sort_order: index,
      })),
    );

    if (simpanError) {
      return { status: "error", message: pesanDariError(simpanError) };
    }
  }

  if (merchant.username) {
    revalidatePath(ROUTES.merchantPage(merchant.username));
  }
  revalidatePath(ROUTES.appearance);

  return { status: "success", message: "FAQ tersimpan" };
}
```

Tambahkan `faqListSchema` ke daftar impor dari `@/lib/validations/theme`.

- [ ] **Step 2: Tulis `faq-editor.tsx`**

Komponen klien berisi daftar kartu, masing-masing dengan `<Input>` pertanyaan dan `<Textarea>` jawaban, tombol hapus, dan tombol naik/turun untuk urutan. Tombol "Tambah pertanyaan" dinonaktifkan pada sepuluh baris dengan keterangan "Maksimal 10 pertanyaan". Seluruh daftar dikirim sebagai satu field JSON bernama `faqs`.

Keadaan kosong harus jujur menyebut akibatnya, karena inilah satu-satunya tempat merchant bisa tahu:

> Belum ada pertanyaan. Selama kosong, bagian FAQ tidak muncul sama sekali di halaman Anda.

- [ ] **Step 3: Sambungkan ke preview**

Teruskan daftar FAQ dari state editor ke `<AppearancePreview faqs={…} />`, sehingga bagian FAQ muncul dan hilang di preview seiring merchant mengetik. Ini yang membuat aturan "kosong berarti tidak ada" terlihat, bukan sekadar dijanjikan.

- [ ] **Step 4: Verifikasi di preview**

- Tambahkan dua pertanyaan, simpan, buka halaman publik: bagian FAQ muncul dan bisa dibuka-tutup.
- Periksa View Source memuat blok `application/ld+json` bertipe `FAQPage`.
- Hapus semua pertanyaan, simpan, muat ulang halaman publik: `get_page_text` tidak lagi memuat "Pertanyaan umum", dan View Source tidak lagi memuat blok JSON-LD.
- Coba tambah pertanyaan kesebelas: tombolnya nonaktif, dan bila dipaksa lewat request, pesan dari trigger yang muncul.

- [ ] **Step 5: Commit**

```bash
npm run check
```

```bash
git add src/app/dashboard/halaman
git commit -m "Tambah editor FAQ yang menghilang sepenuhnya saat kosong"
```

---

### Task 16: Media pada editor layanan

**Files:**
- Create: `src/lib/validations/service-media.ts`, `src/app/dashboard/services/service-media-field.tsx`
- Modify: `src/app/dashboard/services/actions.ts`, `src/app/dashboard/services/service-form-dialog.tsx`, `src/app/dashboard/services/page.tsx`, `src/app/dashboard/services/services-table.tsx`

**Interfaces:**
- Consumes: `compressImage`, `captureVideoPoster`, `uploadMedia`, `removeMedia`, `mediaFileName`, `validateImageFile`, `validateVideoFile`, `MEDIA_LIMITS`
- Produces:
  - `serviceMediaSchema` — Zod untuk baris `service_media`
  - `attachServiceMedia(formData): Promise<{ status: "success" | "error"; message?: string }>`
  - `detachServiceMedia(formData): Promise<{ status: "success" | "error"; message?: string }>`
  - `<ServiceMediaField serviceId merchantId tier media />`

- [ ] **Step 1: Tulis skema Zod**

Buat `src/lib/validations/service-media.ts`:

```ts
import { z } from "zod";

export const serviceMediaSchema = z.object({
  service_id: z.uuid("Layanan tidak dikenal"),
  kind: z.enum(["IMAGE", "VIDEO"]),
  path: z.string().trim().min(1).max(400),
  poster_path: z.string().trim().max(400).nullable().default(null),
  alt: z.string().trim().max(120).nullable().default(null),
  width: z.coerce.number().int().min(1).max(4096),
  height: z.coerce.number().int().min(1).max(4096),
});
```

- [ ] **Step 2: Tambahkan Server Action ke `src/app/dashboard/services/actions.ts`**

`attachServiceMedia` memvalidasi dengan `serviceMediaSchema`, lalu `insert` ke `service_media` dengan `merchant_id: user.id`. Bila trigger menolak (kode `P0001`), teruskan pesannya apa adanya — pesan trigger sudah berbahasa Indonesia dan sudah menyebut sebabnya.

**Wajib:** kembalikan `path` dan `poster_path` di dalam pesan error, karena klien perlu menghapus berkas yang sudah terlanjur terunggah. Tanpa itu, penolakan video milik merchant STARTER meninggalkan berkas 20MB yatim di bucket setiap kali dicoba.

`detachServiceMedia` menghapus baris berdasarkan `id` **dan** `merchant_id = user.id`, lalu mengembalikan `path` dan `poster_path` yang terhapus supaya klien bisa membersihkan berkasnya.

Keduanya memanggil `revalidatePath(ROUTES.services)` dan `revalidatePath(ROUTES.merchantPage(username))`.

- [ ] **Step 3: Tulis `service-media-field.tsx`**

Komponen klien berisi:

- Petak thumbnail media yang sudah ada, masing-masing dengan tombol hapus.
- Tombol "Tambah gambar" — nonaktif pada lima gambar, dengan keterangan "Maksimal 5 gambar".
- Tombol "Tambah video" — untuk merchant STARTER tampil terkunci dengan lencana Pro dan tautan ke `ROUTES.billing`.
- Isian teks alternatif per gambar (opsional, maks 120 karakter), dengan keterangan bahwa isian ini dibacakan pembaca layar dan membantu pencarian.

Alur unggah gambar:

```ts
const galat = validateImageFile(file);
if (galat) { toast.error(galat); return; }

const { blob, width, height } = await compressImage(file, {
  maxSide: MEDIA_LIMITS.serviceImageMaxSide,
  square: false,
});
const path = `${merchantId}/svc/${serviceId}/${mediaFileName("img", "webp")}`;
await uploadMedia(path, blob, "image/webp");

const hasil = await attachServiceMedia(bentukFormData({ ... }));
if (hasil.status === "error") {
  // Baris ditolak setelah berkas mendarat -- bersihkan, jangan tinggalkan
  // berkas yatim di bucket.
  await removeMedia([path]);
  toast.error(hasil.message);
}
```

Alur unggah video sama, dengan tambahan: `captureVideoPoster(file)` dijalankan **lebih dulu** untuk mendapat `duration`, lalu `validateVideoFile(file, duration)` dijalankan sebelum berkas videonya diunggah. Urutan ini penting — memeriksa durasi setelah mengunggah 20MB berarti kuota merchant sudah telanjur habis untuk berkas yang akan ditolak. Poster diunggah dengan nama `${dasar}-poster.webp`, dan bila penyimpanan baris gagal, keduanya dihapus.

- [ ] **Step 4: Sambungkan ke halaman layanan**

`src/app/dashboard/services/page.tsx` sudah memuat `services`; ubah `select` menjadi `"*, service_media(*)"` dan teruskan medianya ke `ServicesTable`, lalu ke `ServiceMediaField` di dalam dialog edit layanan.

- [ ] **Step 5: Verifikasi di preview**

- Unggah tiga gambar pada satu layanan; muat halaman publik dan pastikan galerinya bisa digulir dan tidak menggeser tata letak.
- Sebagai merchant PRO, unggah video 10 detik: poster terbuat otomatis, dan `read_network_requests` menunjukkan berkas video **tidak** terunduh sampai tombol play ditekan.
- Sebagai merchant STARTER, pastikan tombol video terkunci. Lalu, sebagai uji jaring pengaman, panggil `attachServiceMedia` dengan `kind: "VIDEO"` langsung dari konsol dan pastikan pesan penolakan berasal dari trigger.
- Coba unggah gambar keenam: ditolak dengan pesan yang bisa dibaca, dan berkasnya tidak tertinggal di bucket (periksa lewat dashboard Storage).

- [ ] **Step 6: Commit**

```bash
npm run check
```

```bash
git add src/lib/validations/service-media.ts src/app/dashboard/services
git commit -m "Tambah galeri gambar dan video pada editor layanan"
```

---

### Task 17: Navigasi, dokumentasi, dan gerbang akhir

**Files:**
- Modify: `src/lib/routes.ts`, `src/components/layout/app-sidebar.tsx`, `docs/DECISIONS.md`, `AGENTS.md`, `src/app/dashboard/billing/page.tsx`

- [ ] **Step 1: Lengkapi `ROUTES`**

Pastikan `appearance: "/dashboard/halaman",` sudah ada (ditambahkan di Task 13). Karena bukan segmen tingkat atas, `reserved_usernames` **tidak** perlu diubah — aturan itu hanya berlaku untuk segmen yang berbagi ruang nama dengan `/[username]`.

- [ ] **Step 2: Tambahkan menu sidebar**

Di `src/components/layout/app-sidebar.tsx`, sisipkan `{ title: "Halaman saya", href: ROUTES.appearance, icon: Palette }` tepat sebelum "Layanan" — merchant memikirkan halamannya sebelum memikirkan isinya. Impor `Palette` dari `lucide-react`.

- [ ] **Step 3: Catat penyimpangan PRD di `docs/DECISIONS.md`**

Tambahkan bagian baru:

```markdown
## Paket Starter mendapat sebagian kustomisasi tampilan

PRD bagian 1 menempatkan "Custom Theme" sepenuhnya di paket Pro. Implementasi
memberi paket Starter tiga preset gratis (Bersih, Hangat, Malam), pilihan gaya
sudut, foto profil, dan FAQ.

Alasannya: halaman merchant Starter justru halaman yang memasang watermark
"Dibuat dengan Booka". Halaman itu etalase platform, dan etalase yang seragam
dan hambar merugikan kami sendiri. Batas yang terasa — tiga preset premium,
warna sendiri, background foto, pilihan font, dan video layanan masih terkunci
— mendorong upgrade lebih baik daripada tembok penuh yang membuat merchant
tidak pernah tahu ada yang bisa dibeli.

FAQ sengaja terbuka untuk semua paket: manfaatnya adalah berkurangnya
pertanyaan berulang yang masuk ke WhatsApp merchant, dan itu manfaat yang
membuat merchant bertahan cukup lama untuk akhirnya upgrade.
```

- [ ] **Step 4: Selaraskan salinan halaman Langganan**

`src/app/dashboard/billing/page.tsx` menyebut "Warna dan tampilan sendiri" sebagai fitur Pro. Sekarang Starter juga punya sebagian, jadi ubah agar tidak menyesatkan: pada Starter tambahkan `"3 tema halaman"`, dan pada Pro ganti menjadi `"Semua tema, warna, dan font sendiri"` serta tambahkan `"Video pada layanan"`. Komentar di file itu mengingatkan bahwa daftar ini berpasangan dengan landing page — periksa dan samakan juga.

- [ ] **Step 5: Perbarui `AGENTS.md`**

Tambahkan pada bagian Status bahwa kustomisasi halaman publik sudah selesai, dan tambahkan satu aturan mengikat pada bagian aturan:

```markdown
**Tampilan halaman publik hanya boleh datang dari `resolveTheme()`.** Jangan
menulis warna, ukuran, atau font langsung di komponen `src/components/booking-page/*`
— semuanya lewat CSS custom property dari `themeToCssVars()`. Komponen di sana
dipakai halaman publik DAN preview dashboard; nilai yang ditulis langsung akan
membuat keduanya diam-diam berbeda.
```

- [ ] **Step 6: Gerbang akhir**

```bash
npm run docker:test
```

Expected: tidak ada satu pun baris diawali `FAIL`.

```bash
npm run check
```

Expected: typecheck, lint, uji unit, dan build semuanya hijau.

- [ ] **Step 7: Verifikasi menyeluruh di preview**

Dengan satu merchant PRO dan satu merchant STARTER:
- halaman publik keduanya tampil benar, dan halaman STARTER memakai preset gratis meski barisnya berisi nilai premium;
- watermark "Dibuat dengan Booka" masih muncul hanya untuk STARTER;
- alur booking dari halaman publik masih berjalan sampai QRIS — tema tidak boleh menyentuh `BookingSeam`;
- `read_console_messages` bersih di halaman publik maupun `/dashboard/halaman`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/routes.ts src/components/layout/app-sidebar.tsx docs/DECISIONS.md AGENTS.md src/app/dashboard/billing/page.tsx
git commit -m "Tambah menu Halaman saya, catat penyimpangan PRD, selaraskan salinan paket"
```

---

## Catatan untuk pelaksana

**Urutan tidak bisa ditukar.** Task 1 harus mendahului Task 3 (harness akan mati tanpa tiruan `storage`). Task 7 harus mendahului Task 10 dan seterusnya (semua tampilan bersandar pada `resolveTheme`). Task 9 harus mendahului Task 14 (preview memakai komponen yang diekstrak di sana).

**Dua tempat yang paling mudah salah:**

1. **Menyalin pola `getClaims()` ke `/api/*`.** Matcher proxy tidak mencakup `/api/*`. Fitur ini tidak menambah route handler baru, jadi masalahnya tidak muncul — kecuali Anda tergoda memindahkan unggahan ke route handler. Jangan; unggahan sengaja lewat klien bersesi supaya RLS yang menjaga.
2. **Menulis nilai langsung di komponen `booking-page`.** Satu `text-neutral-500` yang lolos akan membuat halaman terlihat benar di tema terang dan rusak di tema gelap, dan preview tidak akan menangkapnya karena preview memakai komponen yang sama.
