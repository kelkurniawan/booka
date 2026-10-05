# Kuesioner Onboarding Interaktif — Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengubah `/onboarding` menjadi wizard yang jawabannya langsung menghasilkan baris `services` dan `availability`, sekaligus merekam klasifikasi bisnis dan demografi merchant di tabel baru `merchant_profiles`.

**Architecture:** Katalog jenis usaha dan mesin langkah wizard adalah modul TypeScript murni yang diuji unit. Seluruh penulisan onboarding terjadi dalam satu RPC `security invoker` sehingga identitas, profil, layanan, dan jam kerja tersimpan atomik. Blok pertanyaan opsional disimpan terpisah lewat server action biasa setelah akun jadi.

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind v4 · shadcn/ui · Supabase Postgres + RLS · Zod

**Spesifikasi:** `docs/superpowers/specs/2026-08-29-onboarding-kuesioner-design.md`

## Global Constraints

- **Bahasa UI dan komentar kode: Indonesia.** Nama variabel, tabel, dan kolom tetap Inggris.
- **Tipe tabel di `src/types/database.ts` wajib `type`, bukan `interface`** — postgrest-js menuntut `Record<string, unknown>`; interface tidak punya index signature implisit sehingga hasil query diam-diam jadi `never`.
- **Setiap tabel baru di `public` wajib `revoke all` dari `anon` dan `authenticated` lebih dulu**, lalu grant per kolom. Supabase memberi ALL secara default lewat `ALTER DEFAULT PRIVILEGES`.
- **Fungsi baru tertutup secara default** sejak `20260730000300_lock_down_function_execute.sql`. Fungsi yang dipanggil dari klien wajib `grant execute` eksplisit. `revoke ... from public` saja tidak cukup.
- **`getSession()` terlarang.** Pakai `getUser()`, atau helper ber-`cache()` di `src/lib/auth/session.ts` (`getSessionUser()` / `requireMerchant()`) di Server Component.
- **Perubahan skema hanya lewat migration baru** di `supabase/migrations/`, tidak pernah mengedit file lama.
- **Migration wajib diuji `npm run docker:test`.** Tambahkan kasus ke `supabase/tests/99_verify.sql`, dan pastikan constraint lain tidak menangkap baris uji lebih dulu sehingga labelnya menyesatkan.
- **Klien Supabase dipilih sesuai konteks:** `lib/supabase/client.ts` (komponen client), `lib/supabase/server.ts` → `createClient` (Server Component / Server Action), `createPublicClient` (halaman publik), `lib/supabase/admin.ts` (service role). Onboarding memakai `createClient`.
- **Validasi tidak diduplikasi.** Pakai ulang `src/lib/validations/merchant.ts`, `service.ts`, `availability.ts`. Modul baru hanya `onboarding.ts`.
- **Gerbang lulus:** `npm run check` (typecheck + lint + test:unit + build) untuk tugas TypeScript; `npm run docker:test` untuk tugas skema.
- **Tidak ada segmen rute tingkat atas baru**, jadi `src/lib/routes.ts` dan tabel `reserved_usernames` tidak disentuh.
- Katalog jenis usaha hidup di TypeScript, bukan tabel referensi — mengikuti `src/lib/theme/presets.ts` dan `font-pairs.ts`.

---

## Struktur berkas

| Berkas | Tanggung jawab |
| --- | --- |
| `supabase/migrations/20260829000100_onboarding_profile.sql` | Enum, tabel `merchant_profiles`, grant, RLS, RPC `complete_onboarding` |
| `src/types/database.ts` | Tipe enum baru, `MerchantProfile`, entri Tables/Functions/Enums |
| `supabase/tests/99_verify.sql` | Uji hak akses, constraint array, cascade, atomicity RPC |
| `src/lib/business/catalog.ts` | Katalog kategori, sub-kategori, template layanan |
| `src/lib/validations/onboarding.ts` | Skema Zod untuk jawaban kuesioner |
| `src/app/onboarding/wizard-state.ts` | Mesin langkah murni: urutan, prasyarat, preset jam, kunci sessionStorage |
| `src/components/ui/option-card.tsx` | Kartu pilih-satu berbasis `<input type="radio">` |
| `src/components/ui/option-check-card.tsx` | Kartu pilih-banyak berbasis `<input type="checkbox">` |
| `src/components/onboarding/wizard-shell.tsx` | Kerangka layar penuh + footer lengket |
| `src/components/onboarding/wizard-progress.tsx` | Bar progres "Langkah N dari 4" |
| `src/app/onboarding/actions.ts` | Cek username, RPC, simpan/lewati jawaban opsional |
| `src/app/onboarding/wizard.tsx` | Orkestrator klien: `?langkah=`, state, sessionStorage |
| `src/app/onboarding/steps/*.tsx` | Satu berkas per langkah |
| `src/app/dashboard/profile-nudge.tsx` | Tawaran kuesioner untuk merchant lama |

---

## Task 1: Migration, tipe database, dan uji skema

**Files:**
- Create: `supabase/migrations/20260829000100_onboarding_profile.sql`
- Modify: `src/types/database.ts`
- Test: `supabase/tests/99_verify.sql` (tambah di akhir berkas)

**Interfaces:**
- Consumes: tabel `merchants`, `services`, `availability` dari `20260729000100_init_schema.sql`; helper `public.set_updated_at()`
- Produces: enum `business_category`, `team_size`, `id_province`, `booking_channel`, `merchant_goal`, `acquisition_source`; tabel `public.merchant_profiles`; fungsi `public.complete_onboarding(text, text, text, public.business_category, text, text, integer, numeric, jsonb) returns void`; tipe TypeScript `BusinessCategory`, `TeamSize`, `IdProvince`, `BookingChannel`, `MerchantGoal`, `AcquisitionSource`, `MerchantProfile`

- [ ] **Step 1: Tulis migration**

Buat `supabase/migrations/20260829000100_onboarding_profile.sql`:

```sql
-- ===========================================================================
-- Profil kuesioner onboarding.
--
-- Jawaban SENGAJA tidak disimpan sebagai kolom di public.merchants. Tabel itu
-- punya policy merchants_public_read untuk anon; menaruh ukuran tim dan kendala
-- usaha di sana membuat keamanannya bergantung pada disiplin grant-per-kolom
-- selamanya. Tabel terpisah yang anon tidak punya hak apa pun atasnya membuat
-- kebocoran itu mustahil secara struktural.
--
-- Spesifikasi: docs/superpowers/specs/2026-08-29-onboarding-kuesioner-design.md
-- ===========================================================================

-- --- Tipe -------------------------------------------------------------------
create type public.business_category as enum (
  'KECANTIKAN', 'KESEHATAN', 'FOTOGRAFI', 'ACARA', 'PENDIDIKAN',
  'HEWAN', 'OTOMOTIF', 'SERVIS', 'KONSULTASI', 'LAINNYA'
);

create type public.team_size as enum (
  'SENDIRI', 'KECIL_2_5', 'MENENGAH_6_15', 'BESAR_15_PLUS'
);

create type public.id_province as enum (
  'ACEH', 'SUMATERA_UTARA', 'SUMATERA_BARAT', 'RIAU', 'KEPULAUAN_RIAU',
  'JAMBI', 'SUMATERA_SELATAN', 'KEPULAUAN_BANGKA_BELITUNG', 'BENGKULU',
  'LAMPUNG', 'DKI_JAKARTA', 'JAWA_BARAT', 'BANTEN', 'JAWA_TENGAH',
  'DI_YOGYAKARTA', 'JAWA_TIMUR', 'BALI', 'NUSA_TENGGARA_BARAT',
  'NUSA_TENGGARA_TIMUR', 'KALIMANTAN_BARAT', 'KALIMANTAN_TENGAH',
  'KALIMANTAN_SELATAN', 'KALIMANTAN_TIMUR', 'KALIMANTAN_UTARA',
  'SULAWESI_UTARA', 'GORONTALO', 'SULAWESI_TENGAH', 'SULAWESI_BARAT',
  'SULAWESI_SELATAN', 'SULAWESI_TENGGARA', 'MALUKU', 'MALUKU_UTARA',
  'PAPUA', 'PAPUA_BARAT', 'PAPUA_BARAT_DAYA', 'PAPUA_TENGAH',
  'PAPUA_PEGUNUNGAN', 'PAPUA_SELATAN'
);

create type public.booking_channel as enum (
  'WHATSAPP', 'INSTAGRAM_DM', 'TELEPON', 'DATANG_LANGSUNG',
  'APLIKASI_LAIN', 'BELUM_ADA'
);

create type public.merchant_goal as enum (
  'NO_SHOW', 'DP_SULIT', 'JADWAL_BENTROK', 'CHAT_BERULANG',
  'HALAMAN_RAPI', 'LAPORAN_PEMASUKAN'
);

create type public.acquisition_source as enum (
  'INSTAGRAM', 'TIKTOK', 'TEMAN', 'GOOGLE', 'KOMUNITAS', 'LAINNYA'
);

-- --- Tabel ------------------------------------------------------------------
create table public.merchant_profiles (
  merchant_id uuid primary key references public.merchants (id) on delete cascade,
  business_category public.business_category not null,
  -- Sub-kategori. Katalognya hidup di src/lib/business/catalog.ts, divalidasi
  -- Zod -- pola yang sama dengan font_pair yang enum sementara detail pasangan
  -- fontnya ada di TypeScript. NULL untuk kategori LAINNYA yang tanpa sub.
  business_type_slug text,
  team_size public.team_size,
  province public.id_province,
  current_channels public.booking_channel[],
  goals public.merchant_goal[],
  acquisition_source public.acquisition_source,
  -- Dipisah dengan sengaja: keduanya NULL berarti merchant belum pernah
  -- ditawari blok opsional, dan itu berbeda dari merchant yang ditawari lalu
  -- menolak. Perbedaan itulah yang menentukan apakah ProfileNudge boleh
  -- menagih.
  optional_answered_at timestamptz,
  optional_skipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint merchant_profiles_type_slug_format check (
    business_type_slug is null
    or business_type_slug ~ '^[a-z0-9](?:[a-z0-9-]{0,38})[a-z0-9]$'
  ),

  -- coalesce dipakai karena array_length('{}', 1) bernilai NULL, bukan 0 --
  -- tanpa itu array kosong lolos diam-diam. array_position mencari elemen NULL:
  -- tanpa larangan ini array_length tetap lolos sementara analitik menghitung
  -- kategori hantu.
  constraint merchant_profiles_channels_sane check (
    current_channels is null
    or (coalesce(array_length(current_channels, 1), 0) between 1 and 6
        and array_position(current_channels, null) is null)
  ),
  constraint merchant_profiles_goals_sane check (
    goals is null
    or (coalesce(array_length(goals, 1), 0) between 1 and 3
        and array_position(goals, null) is null)
  ),

  -- Dijawab dan dilewati saling meniadakan.
  constraint merchant_profiles_optional_exclusive check (
    optional_answered_at is null or optional_skipped_at is null
  )
);

create trigger merchant_profiles_set_updated_at
  before update on public.merchant_profiles
  for each row execute function public.set_updated_at();

-- --- Hak akses --------------------------------------------------------------
-- anon TIDAK diberi apa pun. Ini properti keamanan utama tabel ini.
revoke all on public.merchant_profiles from anon, authenticated;

grant select, insert on public.merchant_profiles to authenticated;
grant update (
  business_category, business_type_slug, team_size, province,
  current_channels, goals, acquisition_source,
  optional_answered_at, optional_skipped_at
) on public.merchant_profiles to authenticated;

alter table public.merchant_profiles enable row level security;

create policy "merchant_profiles_read_own"
  on public.merchant_profiles
  for select
  to authenticated
  using ((select auth.uid()) = merchant_id);

create policy "merchant_profiles_insert_own"
  on public.merchant_profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = merchant_id);

create policy "merchant_profiles_update_own"
  on public.merchant_profiles
  for update
  to authenticated
  using ((select auth.uid()) = merchant_id)
  with check ((select auth.uid()) = merchant_id);

-- ===========================================================================
-- RPC: complete_onboarding
--
-- SECURITY INVOKER, bukan DEFINER. Pemanggilnya adalah merchant itu sendiri,
-- jadi RLS dan grant per kolom tetap berlaku penuh -- tidak ada yang perlu
-- dilewati. Berbeda dari create_booking yang DEFINER + service_role karena di
-- sana pemanggilnya pelanggan anonim.
--
-- Satu fungsi = satu transaksi: identitas, profil, layanan, dan jam kerja
-- tersimpan seluruhnya atau tidak sama sekali.
-- ===========================================================================
create or replace function public.complete_onboarding(
  p_full_name text,
  p_username text,
  p_whatsapp_number text,
  p_business_category public.business_category,
  p_business_type_slug text,
  p_service_name text,
  p_service_duration_minutes integer,
  p_service_price numeric,
  -- [{"day_of_week":1,"start_time":"09:00","end_time":"17:00"}, ...]
  p_availability jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  updated integer;
begin
  if uid is null then
    raise exception 'Tidak ada sesi.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_availability) <> 'array' then
    raise exception 'Jam kerja harus berupa array.' using errcode = '22023';
  end if;

  -- 1. Identitas. UPDATE dulu, INSERT hanya bila tidak ada baris yang kena.
  -- Sengaja BUKAN upsert: `authenticated` tidak punya hak UPDATE pada kolom
  -- `id` (lihat grant per kolom di 20260729000100_init_schema.sql), sehingga
  -- ON CONFLICT DO UPDATE gagal 42501 untuk setiap merchant baru. Trigger
  -- handle_new_user selalu membuat baris merchant saat signup, jadi jalur yang
  -- terpakai hampir selalu UPDATE; INSERT menjaga user lama dari sebelum
  -- trigger dipasang.
  update public.merchants
     set full_name = p_full_name,
         username = p_username,
         whatsapp_number = p_whatsapp_number,
         onboarded_at = now()
   where id = uid;

  get diagnostics updated = row_count;

  if updated = 0 then
    insert into public.merchants
      (id, full_name, username, whatsapp_number, onboarded_at)
    values
      (uid, p_full_name, p_username, p_whatsapp_number, now());
  end if;

  -- 2. Profil kuesioner. on conflict menjaga merchant yang mengulang wizard.
  insert into public.merchant_profiles
    (merchant_id, business_category, business_type_slug)
  values
    (uid, p_business_category, p_business_type_slug)
  on conflict (merchant_id) do update
    set business_category = excluded.business_category,
        business_type_slug = excluded.business_type_slug;

  -- 3. Layanan pertama -- HANYA bila merchant belum punya layanan sama sekali.
  -- Bukan sekadar menghindari P0001 dari enforce_service_limit pada paket
  -- STARTER: merchant yang sudah punya layanan tidak boleh kehilangannya
  -- karena wizard.
  if not exists (select 1 from public.services s where s.merchant_id = uid) then
    insert into public.services (merchant_id, name, price, duration_minutes)
    values (uid, p_service_name, p_service_price, p_service_duration_minutes);
  end if;

  -- 4. Jam kerja -- HANYA bila merchant belum punya baris jam kerja. Melewati,
  -- bukan menghapus lalu menulis ulang; wizard onboarding tidak berhak
  -- menghancurkan jadwal yang sudah ada.
  if not exists (select 1 from public.availability a where a.merchant_id = uid) then
    insert into public.availability (merchant_id, day_of_week, start_time, end_time)
    select uid,
           (item ->> 'day_of_week')::integer,
           (item ->> 'start_time')::time,
           (item ->> 'end_time')::time
    from jsonb_array_elements(p_availability) as t(item);
  end if;
end;
$$;

revoke execute on function public.complete_onboarding(
  text, text, text, public.business_category, text, text, integer, numeric, jsonb
) from public;

grant execute on function public.complete_onboarding(
  text, text, text, public.business_category, text, text, integer, numeric, jsonb
) to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Tambahkan kasus uji ke `supabase/tests/99_verify.sql`**

Tambahkan di AKHIR berkas. Merchant `11111111-1111-1111-1111-111111111111` sudah ada dari kasus sebelumnya dan sudah punya username, layanan, serta jam kerja — jadi buat merchant uji baru agar cabang "belum punya layanan" benar-benar teruji.

```sql
-- ===========================================================================
-- 27. Profil kuesioner onboarding (20260829000100)
-- ===========================================================================

-- 27a. anon tidak punya hak APA PUN atas merchant_profiles. Ini pengujian
-- terpenting di migration ini.
select
  case when has_table_privilege('anon', 'public.merchant_profiles', 'SELECT')
       then 'FAIL t27a anon bisa SELECT merchant_profiles'
       else 'OK   t27a anon tidak bisa SELECT merchant_profiles' end as t27a,
  case when has_table_privilege('anon', 'public.merchant_profiles', 'INSERT')
       then 'FAIL t27a anon bisa INSERT merchant_profiles'
       else 'OK   t27a anon tidak bisa INSERT merchant_profiles' end as t27a2,
  case when has_table_privilege('anon', 'public.merchant_profiles', 'UPDATE')
       then 'FAIL t27a anon bisa UPDATE merchant_profiles'
       else 'OK   t27a anon tidak bisa UPDATE merchant_profiles' end as t27a3,
  case when has_table_privilege('anon', 'public.merchant_profiles', 'DELETE')
       then 'FAIL t27a anon bisa DELETE merchant_profiles'
       else 'OK   t27a anon tidak bisa DELETE merchant_profiles' end as t27a4,
  case when has_table_privilege('authenticated', 'public.merchant_profiles', 'SELECT')
       then 'OK   t27a authenticated bisa SELECT merchant_profiles'
       else 'FAIL t27a authenticated tidak bisa SELECT merchant_profiles' end as t27a5;

-- 27b. Hak EXECUTE complete_onboarding
select
  case when has_function_privilege('anon',
         'public.complete_onboarding(text, text, text, public.business_category, text, text, integer, numeric, jsonb)',
         'EXECUTE')
       then 'FAIL t27b anon bisa EXECUTE complete_onboarding'
       else 'OK   t27b anon tidak bisa EXECUTE complete_onboarding' end as t27b,
  case when has_function_privilege('authenticated',
         'public.complete_onboarding(text, text, text, public.business_category, text, text, integer, numeric, jsonb)',
         'EXECUTE')
       then 'OK   t27b authenticated bisa EXECUTE complete_onboarding'
       else 'FAIL t27b authenticated tidak bisa EXECUTE complete_onboarding' end as t27b2;

-- 27c. Merchant uji baru khusus bagian ini.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'kuesioner@example.com',
   '{"full_name":"Barbershop Uji"}'::jsonb);

select pg_temp.expect_ok(
  $q$insert into public.merchant_profiles (merchant_id, business_category, business_type_slug)
     values ('aaaaaaaa-0000-0000-0000-00000000000a', 'KECANTIKAN', 'barbershop')$q$,
  't27c profil valid');

-- 27d. Enum menolak nilai di luar daftar.
select pg_temp.expect_fail(
  $q$update public.merchant_profiles set business_category = 'KULINER'
     where merchant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$,
  't27d business_category di luar enum');

-- 27e. goals: maksimal 3, tolak elemen NULL, tolak array kosong.
select pg_temp.expect_ok(
  $q$update public.merchant_profiles
     set goals = array['NO_SHOW','DP_SULIT','JADWAL_BENTROK']::public.merchant_goal[]
     where merchant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$,
  't27e goals tepat 3 elemen');
select pg_temp.expect_fail(
  $q$update public.merchant_profiles
     set goals = array['NO_SHOW','DP_SULIT','JADWAL_BENTROK','CHAT_BERULANG']::public.merchant_goal[]
     where merchant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$,
  't27e goals 4 elemen ditolak');
select pg_temp.expect_fail(
  $q$update public.merchant_profiles
     set goals = array['NO_SHOW', null]::public.merchant_goal[]
     where merchant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$,
  't27e goals mengandung NULL ditolak');
select pg_temp.expect_fail(
  $q$update public.merchant_profiles
     set goals = array[]::public.merchant_goal[]
     where merchant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$,
  't27e goals array kosong ditolak');

-- 27f. current_channels: maksimal 6, tolak elemen NULL.
select pg_temp.expect_ok(
  $q$update public.merchant_profiles
     set current_channels = array['WHATSAPP','INSTAGRAM_DM']::public.booking_channel[]
     where merchant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$,
  't27f current_channels 2 elemen');
select pg_temp.expect_fail(
  $q$update public.merchant_profiles
     set current_channels = array['WHATSAPP', null]::public.booking_channel[]
     where merchant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$,
  't27f current_channels mengandung NULL ditolak');

-- 27g. Dijawab dan dilewati saling meniadakan.
select pg_temp.expect_fail(
  $q$update public.merchant_profiles
     set optional_answered_at = now(), optional_skipped_at = now()
     where merchant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$,
  't27g optional_answered_at dan optional_skipped_at bersamaan ditolak');

-- 27h. Hapus merchant ikut menghapus profilnya (cascade).
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
select case when (select count(*) from public.merchant_profiles
                  where merchant_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 0
            then 'OK   t27h profil ikut terhapus saat merchant dihapus'
            else 'FAIL t27h profil tertinggal setelah merchant dihapus' end as t27h;

-- 27i. Atomicity complete_onboarding: username yang sudah dipakai merchant lain
-- membatalkan SELURUH pemanggilan -- tidak ada services maupun availability
-- yang tertinggal. 'studio-mawar' sudah dipakai 1111... dari kasus 2.
insert into auth.users (id, email) values
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'atomik@example.com');

-- Jalankan sebagai merchant tersebut supaya auth.uid() di dalam fungsi terisi.
-- Harness memakai stub auth.uid() dari 00_supabase_stub.sql; setel klaim
-- request sesuai pola yang dipakai kasus RLS sebelumnya di berkas ini.
select pg_temp.expect_fail(
  $q$select set_config('request.jwt.claims',
        '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}', true);
     select public.complete_onboarding(
       'Barber Atomik', 'studio-mawar', '+6281200000001',
       'KECANTIKAN', 'barbershop', 'Potong rambut', 45, 50000,
       '[{"day_of_week":1,"start_time":"09:00","end_time":"17:00"}]'::jsonb)$q$,
  't27i complete_onboarding dengan username terpakai ditolak');

select case
         when (select count(*) from public.services
               where merchant_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 0
          and (select count(*) from public.availability
               where merchant_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 0
          and (select count(*) from public.merchant_profiles
               where merchant_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 0
         then 'OK   t27i rollback bersih: tidak ada services/availability/profil tertinggal'
         else 'FAIL t27i ada baris tertinggal setelah complete_onboarding gagal'
       end as t27i;

-- 27j. Jalur sukses menghasilkan layanan dan jam kerja sekaligus.
select pg_temp.expect_ok(
  $q$select set_config('request.jwt.claims',
        '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}', true);
     select public.complete_onboarding(
       'Barber Atomik', 'barber-atomik', '+6281200000001',
       'KECANTIKAN', 'barbershop', 'Potong rambut', 45, 50000,
       '[{"day_of_week":1,"start_time":"09:00","end_time":"17:00"},
         {"day_of_week":2,"start_time":"09:00","end_time":"17:00"}]'::jsonb)$q$,
  't27j complete_onboarding jalur sukses');

select case
         when (select count(*) from public.services
               where merchant_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 1
          and (select count(*) from public.availability
               where merchant_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 2
          and (select username from public.merchants
               where id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 'barber-atomik'
         then 'OK   t27j 1 layanan + 2 hari jam kerja + username tersimpan'
         else 'FAIL t27j hasil complete_onboarding tidak sesuai'
       end as t27j;

-- 27k. Pemanggilan ulang tidak menggandakan layanan maupun jam kerja.
select pg_temp.expect_ok(
  $q$select set_config('request.jwt.claims',
        '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}', true);
     select public.complete_onboarding(
       'Barber Atomik', 'barber-atomik', '+6281200000001',
       'KECANTIKAN', 'nail-art', 'Layanan Lain', 60, 90000,
       '[{"day_of_week":3,"start_time":"10:00","end_time":"18:00"}]'::jsonb)$q$,
  't27k complete_onboarding dipanggil ulang');

select case
         when (select count(*) from public.services
               where merchant_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 1
          and (select count(*) from public.availability
               where merchant_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 2
          and (select business_type_slug from public.merchant_profiles
               where merchant_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 'nail-art'
         then 'OK   t27k layanan & jam kerja tidak digandakan, profil ter-update'
         else 'FAIL t27k pemanggilan ulang menggandakan baris'
       end as t27k;

select set_config('request.jwt.claims', null, true);
```

Catatan untuk implementer: periksa `supabase/tests/00_supabase_stub.sql` dan kasus RLS yang sudah ada di `99_verify.sql` untuk cara harness ini menyetel identitas pemanggil. Kalau stub-nya memakai mekanisme lain daripada `request.jwt.claims`, sesuaikan kasus 27i–27k mengikuti mekanisme yang sudah dipakai berkas itu — JANGAN mengubah stub.

- [ ] **Step 3: Jalankan uji skema, harapkan gagal sebelum migration diterapkan**

Run: `npm run docker:test`
Expected: kasus 27a–27k FAIL / error "relation public.merchant_profiles does not exist" bila migration belum ada. Kalau Anda menulis Step 1 lebih dulu, lewati harapan gagal ini dan langsung ke Step 4.

- [ ] **Step 4: Jalankan uji skema, harapkan lulus**

Run: `npm run docker:test`
Expected: seluruh baris 27a–27k berawalan `OK`. Tidak boleh ada `FAIL` di seluruh keluaran.

- [ ] **Step 5: Perbarui `src/types/database.ts`**

Tambahkan tipe enum setelah blok `export type MediaKind = ...`:

```ts
export type BusinessCategory =
  | "KECANTIKAN"
  | "KESEHATAN"
  | "FOTOGRAFI"
  | "ACARA"
  | "PENDIDIKAN"
  | "HEWAN"
  | "OTOMOTIF"
  | "SERVIS"
  | "KONSULTASI"
  | "LAINNYA";

export type TeamSize = "SENDIRI" | "KECIL_2_5" | "MENENGAH_6_15" | "BESAR_15_PLUS";

/** 38 provinsi Indonesia, sama persis dengan enum `id_province` di database. */
export type IdProvince =
  | "ACEH" | "SUMATERA_UTARA" | "SUMATERA_BARAT" | "RIAU" | "KEPULAUAN_RIAU"
  | "JAMBI" | "SUMATERA_SELATAN" | "KEPULAUAN_BANGKA_BELITUNG" | "BENGKULU"
  | "LAMPUNG" | "DKI_JAKARTA" | "JAWA_BARAT" | "BANTEN" | "JAWA_TENGAH"
  | "DI_YOGYAKARTA" | "JAWA_TIMUR" | "BALI" | "NUSA_TENGGARA_BARAT"
  | "NUSA_TENGGARA_TIMUR" | "KALIMANTAN_BARAT" | "KALIMANTAN_TENGAH"
  | "KALIMANTAN_SELATAN" | "KALIMANTAN_TIMUR" | "KALIMANTAN_UTARA"
  | "SULAWESI_UTARA" | "GORONTALO" | "SULAWESI_TENGAH" | "SULAWESI_BARAT"
  | "SULAWESI_SELATAN" | "SULAWESI_TENGGARA" | "MALUKU" | "MALUKU_UTARA"
  | "PAPUA" | "PAPUA_BARAT" | "PAPUA_BARAT_DAYA" | "PAPUA_TENGAH"
  | "PAPUA_PEGUNUNGAN" | "PAPUA_SELATAN";

export type BookingChannel =
  | "WHATSAPP"
  | "INSTAGRAM_DM"
  | "TELEPON"
  | "DATANG_LANGSUNG"
  | "APLIKASI_LAIN"
  | "BELUM_ADA";

export type MerchantGoal =
  | "NO_SHOW"
  | "DP_SULIT"
  | "JADWAL_BENTROK"
  | "CHAT_BERULANG"
  | "HALAMAN_RAPI"
  | "LAPORAN_PEMASUKAN";

export type AcquisitionSource =
  | "INSTAGRAM"
  | "TIKTOK"
  | "TEMAN"
  | "GOOGLE"
  | "KOMUNITAS"
  | "LAINNYA";

/**
 * Jawaban kuesioner onboarding. Barisnya OPSIONAL -- merchant lama dari
 * sebelum kuesioner ada tidak punya baris sama sekali, dan itu berbeda dari
 * merchant yang punya baris dengan blok opsional kosong.
 *
 * `optional_answered_at` dan `optional_skipped_at` tidak pernah terisi
 * bersamaan (constraint merchant_profiles_optional_exclusive).
 */
export type MerchantProfile = {
  merchant_id: string;
  business_category: BusinessCategory;
  business_type_slug: string | null;
  team_size: TeamSize | null;
  province: IdProvince | null;
  current_channels: BookingChannel[] | null;
  goals: MerchantGoal[] | null;
  acquisition_source: AcquisitionSource | null;
  optional_answered_at: string | null;
  optional_skipped_at: string | null;
  created_at: string;
  updated_at: string;
};
```

Tambahkan entri Tables setelah blok `merchant_themes`, mengikuti pola `merchant_themes` yang sudah ada (bidang wajib eksplisit, sisanya `Partial`):

```ts
      merchant_profiles: {
        Row: MerchantProfile;
        Insert: Partial<
          Omit<MerchantProfile, "merchant_id" | "business_category" | Timestamps>
        > & { merchant_id: string; business_category: BusinessCategory };
        Update: Partial<Omit<MerchantProfile, "merchant_id" | Timestamps>>;
        Relationships: [Relationship<"merchant_id", "merchants">];
      };
```

Tambahkan entri Functions di dalam blok `Functions`:

```ts
      /**
       * Menyimpan seluruh hasil wizard onboarding dalam satu transaksi:
       * identitas merchant, profil kuesioner, layanan pertama, dan jam kerja.
       * SECURITY INVOKER -- RLS dan grant per kolom tetap berlaku.
       *
       * Layanan hanya disisipkan bila merchant belum punya layanan, dan jam
       * kerja hanya bila merchant belum punya baris availability. Lihat
       * supabase/migrations/20260829000100_onboarding_profile.sql.
       */
      complete_onboarding: {
        Args: {
          p_full_name: string;
          p_username: string;
          p_whatsapp_number: string;
          p_business_category: BusinessCategory;
          p_business_type_slug: string | null;
          p_service_name: string;
          p_service_duration_minutes: number;
          p_service_price: number;
          p_availability: {
            day_of_week: number;
            start_time: string;
            end_time: string;
          }[];
        };
        Returns: undefined;
      };
```

Tambahkan ke blok `Enums`:

```ts
      business_category: BusinessCategory;
      team_size: TeamSize;
      id_province: IdProvince;
      booking_channel: BookingChannel;
      merchant_goal: MerchantGoal;
      acquisition_source: AcquisitionSource;
```

- [ ] **Step 6: Verifikasi tipe**

Run: `npm run typecheck`
Expected: lulus tanpa error.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260829000100_onboarding_profile.sql supabase/tests/99_verify.sql src/types/database.ts
git commit -m "Tambahkan tabel profil kuesioner onboarding dan RPC complete_onboarding"
```

---

## Task 2: Katalog jenis usaha

**Files:**
- Create: `src/lib/business/catalog.ts`
- Test: `src/lib/business/catalog.test.ts`

**Interfaces:**
- Consumes: `BusinessCategory` dari `@/types/database`
- Produces: `ServiceTemplate`, `BusinessType`, `BusinessCategoryEntry`, `BUSINESS_CATEGORIES`, `BUSINESS_TYPE_SLUGS`, `findBusinessType(slug)`, `typesForCategory(id)`, `findCategory(id)`

Modul ini TIDAK boleh mengimpor React, `next/font`, atau apa pun dari `src/components`. `npm run test:unit` menjalankannya di luar pipeline build Next.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `src/lib/business/catalog.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BUSINESS_CATEGORIES,
  BUSINESS_TYPE_SLUGS,
  findBusinessType,
  findCategory,
  typesForCategory,
} from "./catalog";

describe("katalog jenis usaha", () => {
  it("memuat sepuluh kategori sesuai enum business_category", () => {
    assert.deepEqual(
      BUSINESS_CATEGORIES.map((c) => c.id),
      [
        "KECANTIKAN",
        "KESEHATAN",
        "FOTOGRAFI",
        "ACARA",
        "PENDIDIKAN",
        "HEWAN",
        "OTOMOTIF",
        "SERVIS",
        "KONSULTASI",
        "LAINNYA",
      ],
    );
  });

  it("memberi setiap kategori selain LAINNYA minimal satu sub-kategori", () => {
    for (const category of BUSINESS_CATEGORIES) {
      const jumlah = category.types.length;
      if (category.id === "LAINNYA") {
        assert.equal(jumlah, 0, "LAINNYA tidak boleh punya sub-kategori");
      } else {
        assert.ok(jumlah >= 1, `${category.id} tidak punya sub-kategori`);
      }
    }
  });

  it("memakai slug yang unik di seluruh katalog", () => {
    const unik = new Set(BUSINESS_TYPE_SLUGS);
    assert.equal(unik.size, BUSINESS_TYPE_SLUGS.length, "ada slug ganda");
  });

  it("memakai slug yang lolos constraint merchant_profiles_type_slug_format", () => {
    const pola = /^[a-z0-9](?:[a-z0-9-]{0,38})[a-z0-9]$/;
    for (const slug of BUSINESS_TYPE_SLUGS) {
      assert.match(slug, pola, `slug tidak valid: ${slug}`);
    }
  });

  it("memberi setiap sub-kategori empat sampai enam template layanan", () => {
    for (const category of BUSINESS_CATEGORIES) {
      for (const type of category.types) {
        assert.ok(
          type.templates.length >= 4 && type.templates.length <= 6,
          `${type.slug} punya ${type.templates.length} template, harus 4-6`,
        );
      }
    }
  });

  it("menjaga durasi template di dalam constraint services_duration_range", () => {
    for (const category of BUSINESS_CATEGORIES) {
      for (const type of category.types) {
        for (const template of type.templates) {
          assert.ok(
            Number.isInteger(template.durationMinutes) &&
              template.durationMinutes >= 5 &&
              template.durationMinutes <= 480,
            `${type.slug}/${template.name}: durasi ${template.durationMinutes} di luar 5-480`,
          );
        }
      }
    }
  });

  it("menjaga nama template di dalam constraint services_name_length", () => {
    for (const category of BUSINESS_CATEGORIES) {
      for (const type of category.types) {
        for (const template of type.templates) {
          const panjang = template.name.trim().length;
          assert.ok(
            panjang >= 2 && panjang <= 80,
            `${type.slug}/${template.name}: panjang nama ${panjang} di luar 2-80`,
          );
        }
      }
    }
  });

  it("mengisi petunjuk harga untuk setiap template", () => {
    for (const category of BUSINESS_CATEGORIES) {
      for (const type of category.types) {
        for (const template of type.templates) {
          assert.ok(
            template.priceHint.trim().length > 0,
            `${type.slug}/${template.name}: petunjuk harga kosong`,
          );
        }
      }
    }
  });

  it("menemukan sub-kategori berdasarkan slug", () => {
    const type = findBusinessType("barbershop");
    assert.equal(type?.label, "Barbershop");
    assert.equal(findBusinessType("tidak-ada"), undefined);
  });

  it("mengembalikan sub-kategori milik satu kategori", () => {
    const types = typesForCategory("KECANTIKAN");
    assert.ok(types.some((t) => t.slug === "barbershop"));
    assert.equal(typesForCategory("LAINNYA").length, 0);
  });

  it("menemukan kategori berdasarkan id", () => {
    assert.equal(findCategory("HEWAN")?.label, "Perawatan Hewan");
    assert.equal(findCategory("KULINER" as never), undefined);
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './catalog'`.

- [ ] **Step 3: Tulis katalog**

Buat `src/lib/business/catalog.ts`. Kerangka dan tipe persis seperti ini:

```ts
import type { BusinessCategory } from "@/types/database";

/**
 * Katalog jenis usaha. SENGAJA di TypeScript, bukan tabel referensi --
 * mengikuti src/lib/theme/presets.ts dan font-pairs.ts. Konsekuensinya tidak
 * ada RLS baru, tidak ada seed migration, dan integritasnya diuji unit.
 *
 * Modul ini murni: tidak boleh mengimpor React maupun next/font.
 */

/** Template layanan yang ditawarkan di langkah 2 wizard. */
export type ServiceTemplate = {
  name: string;
  /** Harus di dalam constraint services_duration_range: 5..480. */
  durationMinutes: number;
  /**
   * Teks bantu di bawah kolom harga, misal "Umumnya Rp 40.000-80.000".
   * TIDAK PERNAH mengisi kolom harga -- harga adalah keputusan merchant.
   */
  priceHint: string;
};

export type BusinessType = {
  /** Harus lolos constraint merchant_profiles_type_slug_format. */
  slug: string;
  label: string;
  templates: ServiceTemplate[];
};

export type BusinessCategoryEntry = {
  id: BusinessCategory;
  label: string;
  /** Nama ikon lucide-react, dipetakan di komponen agar modul ini tetap murni. */
  icon: string;
  types: BusinessType[];
};

export const BUSINESS_CATEGORIES: readonly BusinessCategoryEntry[] = [
  {
    id: "KECANTIKAN",
    label: "Kecantikan & Perawatan",
    icon: "Scissors",
    types: [
      {
        slug: "salon-rambut",
        label: "Salon rambut",
        templates: [
          { name: "Potong rambut", durationMinutes: 45, priceHint: "Umumnya Rp 50.000-120.000" },
          { name: "Cuci & blow", durationMinutes: 45, priceHint: "Umumnya Rp 50.000-100.000" },
          { name: "Pewarnaan", durationMinutes: 120, priceHint: "Umumnya Rp 250.000-800.000" },
          { name: "Smoothing", durationMinutes: 180, priceHint: "Umumnya Rp 400.000-1.500.000" },
          { name: "Creambath", durationMinutes: 60, priceHint: "Umumnya Rp 75.000-150.000" },
        ],
      },
      {
        slug: "barbershop",
        label: "Barbershop",
        templates: [
          { name: "Potong rambut", durationMinutes: 45, priceHint: "Umumnya Rp 40.000-80.000" },
          { name: "Potong + keramas", durationMinutes: 60, priceHint: "Umumnya Rp 60.000-110.000" },
          { name: "Cukur jenggot", durationMinutes: 30, priceHint: "Umumnya Rp 30.000-60.000" },
          { name: "Pewarnaan", durationMinutes: 90, priceHint: "Umumnya Rp 150.000-400.000" },
        ],
      },
      // Lanjutkan: nail-art, eyelash-alis, facial-skincare, spa-pijat
    ],
  },
  // Lanjutkan kategori berikutnya
];
```

Isi katalog LENGKAP memakai slug dan label persis berikut. Setiap sub-kategori WAJIB punya 4–6 template — uji di Step 1 menegakkannya, jadi tidak ada yang boleh dilewati. Durasi dan petunjuk harga adalah penilaian Anda untuk pasar jasa kecil Indonesia, selama lolos seluruh uji.

| Kategori | `id` | `icon` | Sub-kategori (`slug` → label) |
| --- | --- | --- | --- |
| Kecantikan & Perawatan | `KECANTIKAN` | `Scissors` | `salon-rambut`→Salon rambut · `barbershop`→Barbershop · `nail-art`→Nail art · `eyelash-alis`→Eyelash & alis · `facial-skincare`→Facial & skincare · `spa-pijat`→Spa & pijat |
| Kesehatan & Kebugaran | `KESEHATAN` | `HeartPulse` | `klinik`→Klinik & praktik dokter · `fisioterapi`→Fisioterapi · `pijat-terapi`→Pijat terapi · `personal-trainer`→Personal trainer · `yoga-pilates`→Studio yoga/pilates · `konsultasi-gizi`→Konsultasi gizi |
| Fotografi & Videografi | `FOTOGRAFI` | `Camera` | `studio-foto`→Studio foto · `prewedding`→Prewedding · `dokumentasi-acara`→Dokumentasi acara · `foto-produk`→Foto produk · `videografi`→Videografi |
| Perias & Jasa Acara | `ACARA` | `PartyPopper` | `mua`→Perias (MUA) · `dekorasi`→Dekorasi · `wedding-organizer`→Wedding organizer · `sewa-busana`→Sewa busana · `katering`→Katering · `hiburan-musik`→Hiburan & musik |
| Pendidikan & Kursus | `PENDIDIKAN` | `GraduationCap` | `les-akademik`→Les privat akademik · `kursus-musik`→Kursus musik · `kursus-bahasa`→Kursus bahasa · `mengaji`→Mengaji · `kursus-keterampilan`→Kursus keterampilan · `bimbingan-karier`→Bimbingan karier |
| Perawatan Hewan | `HEWAN` | `PawPrint` | `grooming-hewan`→Grooming · `klinik-hewan`→Klinik hewan · `penitipan-hewan`→Penitipan · `pelatihan-hewan`→Pelatihan |
| Otomotif | `OTOMOTIF` | `Car` | `bengkel-mobil`→Bengkel mobil · `bengkel-motor`→Bengkel motor · `salon-detailing`→Salon & detailing · `cuci-kendaraan`→Cuci kendaraan · `servis-ac-mobil`→Servis AC mobil |
| Servis & Perbaikan | `SERVIS` | `Wrench` | `servis-ac`→Servis AC · `servis-elektronik`→Servis elektronik · `servis-gadget`→Servis gadget · `laundry`→Laundry · `kebersihan-rumah`→Kebersihan rumah · `tukang-renovasi`→Tukang & renovasi |
| Konsultasi Profesional | `KONSULTASI` | `Briefcase` | `psikolog-konseling`→Psikolog & konseling · `konsultan-bisnis`→Konsultan bisnis · `konsultan-pajak`→Konsultan pajak · `notaris-hukum`→Notaris & hukum · `desain-kreatif`→Desain & kreatif |
| Lainnya | `LAINNYA` | `Sparkles` | *(tidak ada — `types: []`)* |

Lalu tambahkan turunan dan helper di akhir berkas:

```ts
export const BUSINESS_TYPE_SLUGS: readonly string[] = BUSINESS_CATEGORIES.flatMap(
  (category) => category.types.map((type) => type.slug),
);

export function findCategory(
  id: BusinessCategory,
): BusinessCategoryEntry | undefined {
  return BUSINESS_CATEGORIES.find((category) => category.id === id);
}

export function typesForCategory(
  id: BusinessCategory,
): readonly BusinessType[] {
  return findCategory(id)?.types ?? [];
}

export function findBusinessType(slug: string): BusinessType | undefined {
  for (const category of BUSINESS_CATEGORIES) {
    const found = category.types.find((type) => type.slug === slug);
    if (found) return found;
  }
  return undefined;
}
```

- [ ] **Step 4: Jalankan uji, pastikan lulus**

Run: `npm run test:unit`
Expected: seluruh 11 uji di `catalog.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/business/catalog.ts src/lib/business/catalog.test.ts
git commit -m "Tambahkan katalog jenis usaha untuk kuesioner onboarding"
```

---

## Task 3: Skema validasi kuesioner

**Files:**
- Create: `src/lib/validations/onboarding.ts`
- Test: `src/lib/validations/onboarding.test.ts`

**Interfaces:**
- Consumes: `BUSINESS_TYPE_SLUGS`, `findCategory` dari `@/lib/business/catalog`; `serviceSchema` dari `./service`; `availabilitySchema` dari `./availability`; `onboardingSchema` dari `./merchant`; tipe enum dari `@/types/database`
- Produces: `BUSINESS_CATEGORY_VALUES`, `TEAM_SIZE_VALUES`, `ID_PROVINCE_VALUES`, `BOOKING_CHANNEL_VALUES`, `MERCHANT_GOAL_VALUES`, `ACQUISITION_SOURCE_VALUES`, `businessStepSchema`, `wizardServiceSchema`, `hoursStepSchema`, `completeOnboardingSchema`, `optionalProfileSchema`, tipe `CompleteOnboardingValues`, `OptionalProfileValues`, `MAX_GOALS`

- [ ] **Step 1: Tulis uji yang gagal**

Buat `src/lib/validations/onboarding.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  businessStepSchema,
  completeOnboardingSchema,
  hoursStepSchema,
  optionalProfileSchema,
  wizardServiceSchema,
} from "./onboarding";

const IDENTITAS = {
  full_name: "Barbershop Uji",
  username: "barbershop-uji",
  whatsapp_number: "0812-3456-7890",
};

const LAYANAN = { name: "Potong rambut", duration_minutes: 45, price: "50000" };

const JAM = {
  days: [1, 2, 3],
  start_time: "09:00",
  end_time: "17:00",
};

describe("businessStepSchema", () => {
  it("menerima kategori dengan sub-kategori dari katalog", () => {
    const hasil = businessStepSchema.safeParse({
      business_category: "KECANTIKAN",
      business_type_slug: "barbershop",
    });
    assert.equal(hasil.success, true);
  });

  it("menolak slug di luar katalog", () => {
    const hasil = businessStepSchema.safeParse({
      business_category: "KECANTIKAN",
      business_type_slug: "kuliner-padang",
    });
    assert.equal(hasil.success, false);
  });

  it("menolak slug yang bukan milik kategori terpilih", () => {
    const hasil = businessStepSchema.safeParse({
      business_category: "OTOMOTIF",
      business_type_slug: "barbershop",
    });
    assert.equal(hasil.success, false);
  });

  it("menerima kategori LAINNYA tanpa sub-kategori", () => {
    const hasil = businessStepSchema.safeParse({
      business_category: "LAINNYA",
      business_type_slug: null,
    });
    assert.equal(hasil.success, true);
  });

  it("menolak kategori selain LAINNYA tanpa sub-kategori", () => {
    const hasil = businessStepSchema.safeParse({
      business_category: "KECANTIKAN",
      business_type_slug: null,
    });
    assert.equal(hasil.success, false);
  });
});

describe("wizardServiceSchema", () => {
  it("menerima layanan yang valid", () => {
    assert.equal(wizardServiceSchema.safeParse(LAYANAN).success, true);
  });

  it("menolak durasi di luar 5-480", () => {
    assert.equal(
      wizardServiceSchema.safeParse({ ...LAYANAN, duration_minutes: 600 }).success,
      false,
    );
  });

  it("menolak harga negatif", () => {
    assert.equal(
      wizardServiceSchema.safeParse({ ...LAYANAN, price: "-1" }).success,
      false,
    );
  });

  it("menolak harga kosong, BUKAN mengubahnya jadi nol", () => {
    // z.coerce.number() mengubah "" menjadi 0 yang lolos nonnegative(). Tanpa
    // penolakan eksplisit, merchant yang melewati kolom harga diam-diam
    // menyimpan layanan gratis.
    assert.equal(wizardServiceSchema.safeParse({ ...LAYANAN, price: "" }).success, false);
    assert.equal(wizardServiceSchema.safeParse({ ...LAYANAN, price: "   " }).success, false);
  });

  it("menghasilkan harga bertipe number setelah divalidasi", () => {
    const hasil = wizardServiceSchema.safeParse(LAYANAN);
    assert.equal(hasil.success, true);
    assert.equal(hasil.data?.price, 50000);
  });
});

describe("hoursStepSchema", () => {
  it("menerima hari dan jam yang valid", () => {
    assert.equal(hoursStepSchema.safeParse(JAM).success, true);
  });

  it("menolak daftar hari kosong", () => {
    assert.equal(hoursStepSchema.safeParse({ ...JAM, days: [] }).success, false);
  });

  it("menolak hari ganda", () => {
    assert.equal(
      hoursStepSchema.safeParse({ ...JAM, days: [1, 1, 2] }).success,
      false,
    );
  });

  it("menolak hari di luar 1-7", () => {
    assert.equal(hoursStepSchema.safeParse({ ...JAM, days: [0] }).success, false);
    assert.equal(hoursStepSchema.safeParse({ ...JAM, days: [8] }).success, false);
  });

  it("menolak jam selesai sebelum jam mulai", () => {
    assert.equal(
      hoursStepSchema.safeParse({ ...JAM, start_time: "17:00", end_time: "09:00" })
        .success,
      false,
    );
  });
});

describe("completeOnboardingSchema", () => {
  it("menerima seluruh jawaban wajib dan menormalkan nomor WhatsApp", () => {
    const hasil = completeOnboardingSchema.safeParse({
      ...IDENTITAS,
      business_category: "KECANTIKAN",
      business_type_slug: "barbershop",
      service: LAYANAN,
      hours: JAM,
    });
    assert.equal(hasil.success, true);
    assert.equal(hasil.data?.whatsapp_number, "+6281234567890");
  });

  it("ikut menolak slug yang bukan milik kategori terpilih", () => {
    const hasil = completeOnboardingSchema.safeParse({
      ...IDENTITAS,
      business_category: "OTOMOTIF",
      business_type_slug: "barbershop",
      service: LAYANAN,
      hours: JAM,
    });
    assert.equal(hasil.success, false);
  });

  it("menolak bila salah satu bagian wajib hilang", () => {
    const hasil = completeOnboardingSchema.safeParse({
      ...IDENTITAS,
      business_category: "KECANTIKAN",
      business_type_slug: "barbershop",
      hours: JAM,
    });
    assert.equal(hasil.success, false);
  });
});

describe("optionalProfileSchema", () => {
  it("menerima jawaban yang kosong seluruhnya", () => {
    const hasil = optionalProfileSchema.safeParse({});
    assert.equal(hasil.success, true);
  });

  it("menerima jawaban sebagian", () => {
    const hasil = optionalProfileSchema.safeParse({
      team_size: "SENDIRI",
      province: "DKI_JAKARTA",
    });
    assert.equal(hasil.success, true);
  });

  it("menolak lebih dari tiga goals", () => {
    const hasil = optionalProfileSchema.safeParse({
      goals: ["NO_SHOW", "DP_SULIT", "JADWAL_BENTROK", "CHAT_BERULANG"],
    });
    assert.equal(hasil.success, false);
  });

  it("menolak goals ganda", () => {
    const hasil = optionalProfileSchema.safeParse({
      goals: ["NO_SHOW", "NO_SHOW"],
    });
    assert.equal(hasil.success, false);
  });

  it("menolak nilai enum yang tidak dikenal", () => {
    assert.equal(
      optionalProfileSchema.safeParse({ province: "JAWA_TENGGARA" }).success,
      false,
    );
    assert.equal(
      optionalProfileSchema.safeParse({ team_size: "BANYAK" }).success,
      false,
    );
  });

  it("mengubah array kosong menjadi null agar lolos constraint database", () => {
    const hasil = optionalProfileSchema.safeParse({ goals: [], current_channels: [] });
    assert.equal(hasil.success, true);
    assert.equal(hasil.data?.goals, null);
    assert.equal(hasil.data?.current_channels, null);
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './onboarding'`.

- [ ] **Step 3: Tulis skema**

Buat `src/lib/validations/onboarding.ts`:

```ts
import { z } from "zod";

import { findCategory } from "@/lib/business/catalog";
import type {
  AcquisitionSource,
  BookingChannel,
  BusinessCategory,
  IdProvince,
  MerchantGoal,
  TeamSize,
} from "@/types/database";

import { availabilitySchema } from "./availability";
import { onboardingSchema } from "./merchant";
import { serviceSchema } from "./service";

/**
 * Validasi jawaban kuesioner onboarding.
 *
 * Aturan identitas, layanan, dan jam kerja TIDAK ditulis ulang di sini -- modul
 * ini memakai ulang skema yang sudah ada supaya panjang nama, rentang durasi
 * 5..480, harga non-negatif, dan format E.164 tetap punya satu sumber kebenaran.
 */

/** Harus sama persis dengan enum di 20260829000100_onboarding_profile.sql. */
export const BUSINESS_CATEGORY_VALUES = [
  "KECANTIKAN", "KESEHATAN", "FOTOGRAFI", "ACARA", "PENDIDIKAN",
  "HEWAN", "OTOMOTIF", "SERVIS", "KONSULTASI", "LAINNYA",
] as const satisfies readonly BusinessCategory[];

export const TEAM_SIZE_VALUES = [
  "SENDIRI", "KECIL_2_5", "MENENGAH_6_15", "BESAR_15_PLUS",
] as const satisfies readonly TeamSize[];

export const ID_PROVINCE_VALUES = [
  "ACEH", "SUMATERA_UTARA", "SUMATERA_BARAT", "RIAU", "KEPULAUAN_RIAU",
  "JAMBI", "SUMATERA_SELATAN", "KEPULAUAN_BANGKA_BELITUNG", "BENGKULU",
  "LAMPUNG", "DKI_JAKARTA", "JAWA_BARAT", "BANTEN", "JAWA_TENGAH",
  "DI_YOGYAKARTA", "JAWA_TIMUR", "BALI", "NUSA_TENGGARA_BARAT",
  "NUSA_TENGGARA_TIMUR", "KALIMANTAN_BARAT", "KALIMANTAN_TENGAH",
  "KALIMANTAN_SELATAN", "KALIMANTAN_TIMUR", "KALIMANTAN_UTARA",
  "SULAWESI_UTARA", "GORONTALO", "SULAWESI_TENGAH", "SULAWESI_BARAT",
  "SULAWESI_SELATAN", "SULAWESI_TENGGARA", "MALUKU", "MALUKU_UTARA",
  "PAPUA", "PAPUA_BARAT", "PAPUA_BARAT_DAYA", "PAPUA_TENGAH",
  "PAPUA_PEGUNUNGAN", "PAPUA_SELATAN",
] as const satisfies readonly IdProvince[];

export const BOOKING_CHANNEL_VALUES = [
  "WHATSAPP", "INSTAGRAM_DM", "TELEPON", "DATANG_LANGSUNG",
  "APLIKASI_LAIN", "BELUM_ADA",
] as const satisfies readonly BookingChannel[];

export const MERCHANT_GOAL_VALUES = [
  "NO_SHOW", "DP_SULIT", "JADWAL_BENTROK", "CHAT_BERULANG",
  "HALAMAN_RAPI", "LAPORAN_PEMASUKAN",
] as const satisfies readonly MerchantGoal[];

export const ACQUISITION_SOURCE_VALUES = [
  "INSTAGRAM", "TIKTOK", "TEMAN", "GOOGLE", "KOMUNITAS", "LAINNYA",
] as const satisfies readonly AcquisitionSource[];

/** Sama dengan constraint merchant_profiles_goals_sane. */
export const MAX_GOALS = 3;
/** Sama dengan constraint merchant_profiles_channels_sane. */
export const MAX_CHANNELS = 6;

/**
 * Langkah 1. Sub-kategori divalidasi terhadap katalog TypeScript, bukan enum
 * database -- lihat spec bagian 6.1. Kategori LAINNYA sengaja tanpa
 * sub-kategori, jadi slug-nya wajib null; kategori lain wajib mengisinya.
 */
const businessFields = {
  business_category: z.enum(BUSINESS_CATEGORY_VALUES, {
    message: "Pilih bidang usaha Anda",
  }),
  business_type_slug: z.string().nullable(),
};

/**
 * Dipakai BERSAMA oleh businessStepSchema (langkah 1) dan
 * completeOnboardingSchema (kiriman akhir). Kalau hanya langkah 1 yang
 * memeriksanya, klien yang menyusun payload sendiri bisa mengirim slug milik
 * kategori lain dan database menerimanya -- kolomnya cuma `text`.
 */
function refineBusinessType(
  data: { business_category: BusinessCategory; business_type_slug: string | null },
  ctx: z.RefinementCtx,
): void {
  const tersedia = findCategory(data.business_category)?.types ?? [];

  if (tersedia.length === 0) {
    if (data.business_type_slug !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["business_type_slug"],
        message: "Kategori ini tidak punya sub-kategori",
      });
    }
    return;
  }

  if (data.business_type_slug === null) {
    ctx.addIssue({
      code: "custom",
      path: ["business_type_slug"],
      message: "Pilih jenis usaha yang paling mendekati",
    });
    return;
  }

  if (!tersedia.some((type) => type.slug === data.business_type_slug)) {
    ctx.addIssue({
      code: "custom",
      path: ["business_type_slug"],
      message: "Jenis usaha tidak sesuai bidang yang dipilih",
    });
  }
}

export const businessStepSchema = z.object(businessFields).superRefine(refineBusinessType);

/**
 * Langkah 2. Layanan wizard tidak punya deskripsi -- merchant mengisinya nanti
 * di /dashboard/services -- jadi kolom itu dibuang dari serviceSchema.
 *
 * Harga di-override menjadi string-dulu. `z.coerce.number()` milik
 * serviceSchema mengubah string kosong menjadi 0, yang lolos
 * `nonnegative()` -- artinya merchant yang tidak mengisi harga diam-diam
 * menyimpan layanan gratis. Di sini string kosong ditolak lebih dulu, baru
 * dialirkan ke aturan angka yang sama supaya batas 0..MAX tetap satu sumber.
 */
export const wizardServiceSchema = serviceSchema
  .omit({ description: true })
  .extend({
    price: z
      .string()
      .trim()
      .min(1, "Harga wajib diisi")
      .pipe(serviceSchema.shape.price),
  });

/**
 * Langkah 3. Satu rentang jam berlaku untuk seluruh hari terpilih. Rentangnya
 * divalidasi lewat availabilitySchema agar aturan format HH:mm dan
 * "selesai setelah mulai" tidak ditulis dua kali.
 */
export const hoursStepSchema = z
  .object({
    days: z
      .array(z.number().int().min(1, "Hari tidak valid").max(7, "Hari tidak valid"))
      .min(1, "Pilih minimal satu hari"),
    start_time: z.string(),
    end_time: z.string(),
  })
  .superRefine((data, ctx) => {
    if (new Set(data.days).size !== data.days.length) {
      ctx.addIssue({ code: "custom", path: ["days"], message: "Hari tidak boleh ganda" });
    }

    const rentang = availabilitySchema.safeParse({
      day_of_week: data.days[0] ?? 1,
      start_time: data.start_time,
      end_time: data.end_time,
    });

    if (!rentang.success) {
      for (const issue of rentang.error.issues) {
        ctx.addIssue({
          code: "custom",
          path: issue.path.length > 0 ? issue.path : ["end_time"],
          message: issue.message,
        });
      }
    }
  });

/** Seluruh jawaban wajib, dikirim ke RPC complete_onboarding sebagai satu unit. */
export const completeOnboardingSchema = onboardingSchema
  .extend({
    ...businessFields,
    service: wizardServiceSchema,
    hours: hoursStepSchema,
  })
  .superRefine(refineBusinessType);

export type CompleteOnboardingInput = z.input<typeof completeOnboardingSchema>;
export type CompleteOnboardingValues = z.output<typeof completeOnboardingSchema>;

/**
 * Blok opsional. Setiap field boleh hilang. Array kosong diubah menjadi null:
 * constraint merchant_profiles_goals_sane dan _channels_sane menolak array
 * kosong, dan "tidak menjawab" memang seharusnya null, bukan '{}'.
 */
const emptyArrayToNull = <T extends string>(values: readonly [T, ...T[]], max: number) =>
  z
    .array(z.enum(values))
    .max(max)
    .refine((items) => new Set(items).size === items.length, "Pilihan tidak boleh ganda")
    .transform((items) => (items.length > 0 ? items : null))
    .nullish()
    .transform((items) => items ?? null);

export const optionalProfileSchema = z.object({
  team_size: z.enum(TEAM_SIZE_VALUES).nullish().transform((v) => v ?? null),
  province: z.enum(ID_PROVINCE_VALUES).nullish().transform((v) => v ?? null),
  current_channels: emptyArrayToNull(BOOKING_CHANNEL_VALUES, MAX_CHANNELS),
  goals: emptyArrayToNull(MERCHANT_GOAL_VALUES, MAX_GOALS),
  acquisition_source: z
    .enum(ACQUISITION_SOURCE_VALUES)
    .nullish()
    .transform((v) => v ?? null),
});

export type OptionalProfileInput = z.input<typeof optionalProfileSchema>;
export type OptionalProfileValues = z.output<typeof optionalProfileSchema>;
```

- [ ] **Step 4: Jalankan uji, pastikan lulus**

Run: `npm run test:unit`
Expected: seluruh uji di `onboarding.test.ts` PASS. Bila `z.enum` dengan `as const satisfies` menghasilkan error tipe di versi Zod yang terpasang, periksa versi Zod di `package.json` dan sesuaikan pemanggilannya — JANGAN melonggarkan uji.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/onboarding.ts src/lib/validations/onboarding.test.ts
git commit -m "Tambahkan skema validasi kuesioner onboarding"
```

---

## Task 4: Mesin langkah wizard

**Files:**
- Create: `src/app/onboarding/wizard-state.ts`
- Test: `src/app/onboarding/wizard-state.test.ts`

**Interfaces:**
- Consumes: `BusinessCategory`, `DayOfWeek` dari `@/types/database`
- Produces: `WIZARD_STEPS`, `WizardStep`, `REQUIRED_STEPS`, `WizardAnswers`, `EMPTY_ANSWERS`, `HOURS_PRESETS`, `HoursPresetId`, `requiredStepNumber(step)`, `REQUIRED_STEP_COUNT`, `isStepUnlocked(step, answers)`, `resolveStep(requested, answers)`, `nextStep(step)`, `previousStep(step)`, `storageKey(userId)`, `parseStoredAnswers(raw)`, `hoursToRows(hours)`

Modul murni — tidak mengimpor React. Ini yang membuat logika langkah bisa diuji `npm run test:unit`, mengikuti pola `src/app/dashboard/services/service-state.ts` yang sudah ada.

- [ ] **Step 1: Tulis uji yang gagal**

Buat `src/app/onboarding/wizard-state.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_ANSWERS,
  HOURS_PRESETS,
  REQUIRED_STEP_COUNT,
  hoursToRows,
  isStepUnlocked,
  nextStep,
  parseStoredAnswers,
  previousStep,
  requiredStepNumber,
  resolveStep,
  storageKey,
  type WizardAnswers,
} from "./wizard-state";

const USAHA: WizardAnswers = {
  ...EMPTY_ANSWERS,
  category: "KECANTIKAN",
  typeSlug: "barbershop",
};

const LAYANAN: WizardAnswers = {
  ...USAHA,
  service: { name: "Potong rambut", durationMinutes: 45, price: "50000" },
};

const JAM: WizardAnswers = {
  ...LAYANAN,
  hours: { days: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "17:00" },
};

describe("progres", () => {
  it("menghitung empat langkah wajib saja", () => {
    assert.equal(REQUIRED_STEP_COUNT, 4);
    assert.equal(requiredStepNumber("usaha"), 1);
    assert.equal(requiredStepNumber("layanan"), 2);
    assert.equal(requiredStepNumber("jam"), 3);
    assert.equal(requiredStepNumber("identitas"), 4);
  });

  it("tidak memberi nomor progres pada layar sukses dan blok opsional", () => {
    assert.equal(requiredStepNumber("sukses"), null);
    assert.equal(requiredStepNumber("profil"), null);
    assert.equal(requiredStepNumber("kebutuhan"), null);
  });
});

describe("isStepUnlocked", () => {
  it("selalu membuka langkah pertama", () => {
    assert.equal(isStepUnlocked("usaha", EMPTY_ANSWERS), true);
  });

  it("mengunci langkah yang prasyaratnya belum terjawab", () => {
    assert.equal(isStepUnlocked("layanan", EMPTY_ANSWERS), false);
    assert.equal(isStepUnlocked("jam", USAHA), false);
    assert.equal(isStepUnlocked("identitas", LAYANAN), false);
  });

  it("membuka langkah begitu prasyaratnya terpenuhi", () => {
    assert.equal(isStepUnlocked("layanan", USAHA), true);
    assert.equal(isStepUnlocked("jam", LAYANAN), true);
    assert.equal(isStepUnlocked("identitas", JAM), true);
  });

  it("membuka kategori LAINNYA tanpa sub-kategori", () => {
    const lainnya: WizardAnswers = {
      ...EMPTY_ANSWERS,
      category: "LAINNYA",
      typeSlug: null,
    };
    assert.equal(isStepUnlocked("layanan", lainnya), true);
  });
});

describe("resolveStep", () => {
  it("memakai langkah yang diminta bila terbuka", () => {
    assert.equal(resolveStep("jam", JAM), "jam");
  });

  it("memundurkan ke langkah valid terakhir bila prasyarat belum terjawab", () => {
    assert.equal(resolveStep("identitas", EMPTY_ANSWERS), "usaha");
    assert.equal(resolveStep("identitas", USAHA), "layanan");
    assert.equal(resolveStep("jam", USAHA), "layanan");
  });

  it("jatuh ke langkah pertama untuk nilai yang tidak dikenal atau kosong", () => {
    assert.equal(resolveStep(null, EMPTY_ANSWERS), "usaha");
    assert.equal(resolveStep("langkah-palsu", JAM), "usaha");
  });
});

describe("navigasi", () => {
  it("maju mengikuti urutan langkah", () => {
    assert.equal(nextStep("usaha"), "layanan");
    assert.equal(nextStep("identitas"), "sukses");
    assert.equal(nextStep("kebutuhan"), null);
  });

  it("mundur mengikuti urutan langkah", () => {
    assert.equal(previousStep("layanan"), "usaha");
    assert.equal(previousStep("usaha"), null);
  });

  it("tidak memundurkan dari layar sukses ke identitas -- akun sudah tersimpan", () => {
    assert.equal(previousStep("sukses"), null);
  });
});

describe("preset jam buka", () => {
  it("menyediakan tiga preset dan satu pilihan kustom", () => {
    assert.equal(HOURS_PRESETS.length, 3);
    for (const preset of HOURS_PRESETS) {
      assert.ok(preset.days.length >= 1);
      assert.ok(preset.endTime > preset.startTime);
    }
  });

  it("mengubah jawaban jam menjadi baris availability", () => {
    const rows = hoursToRows({ days: [1, 3], startTime: "09:00", endTime: "17:00" });
    assert.deepEqual(rows, [
      { day_of_week: 1, start_time: "09:00", end_time: "17:00" },
      { day_of_week: 3, start_time: "09:00", end_time: "17:00" },
    ]);
  });

  it("mengurutkan hari agar baris availability stabil", () => {
    const rows = hoursToRows({ days: [5, 1, 3], startTime: "09:00", endTime: "17:00" });
    assert.deepEqual(
      rows.map((r) => r.day_of_week),
      [1, 3, 5],
    );
  });
});

describe("cadangan sessionStorage", () => {
  it("memisahkan kunci per user", () => {
    assert.notEqual(storageKey("user-a"), storageKey("user-b"));
    assert.match(storageKey("user-a"), /user-a/);
  });

  it("mengembalikan jawaban kosong untuk isi yang rusak atau hilang", () => {
    assert.deepEqual(parseStoredAnswers(null), EMPTY_ANSWERS);
    assert.deepEqual(parseStoredAnswers("bukan json"), EMPTY_ANSWERS);
    assert.deepEqual(parseStoredAnswers("[]"), EMPTY_ANSWERS);
    assert.deepEqual(parseStoredAnswers('{"category":123}'), EMPTY_ANSWERS);
  });

  it("memulihkan jawaban yang tersimpan", () => {
    assert.deepEqual(parseStoredAnswers(JSON.stringify(JAM)), JAM);
  });
});
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './wizard-state'`.

- [ ] **Step 3: Tulis mesin langkah**

Buat `src/app/onboarding/wizard-state.ts`:

```ts
import type { BusinessCategory, DayOfWeek } from "@/types/database";

/**
 * Mesin langkah wizard onboarding: urutan, prasyarat, preset jam buka, dan
 * cadangan sessionStorage.
 *
 * Modul MURNI, tanpa React -- mengikuti pola service-state.ts dan
 * availability-state.ts, supaya logika langkah bisa diuji `npm run test:unit`
 * yang hanya menjalankan berkas .ts.
 */

export const WIZARD_STEPS = [
  "usaha",
  "layanan",
  "jam",
  "identitas",
  "sukses",
  "profil",
  "kebutuhan",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

/**
 * Hanya empat langkah ini yang dihitung progres. Kalau progres menyebut tujuh
 * langkah lalu tiga di antaranya opsional, merchant yang melewatinya merasa
 * meninggalkan pekerjaan setengah jadi -- lihat spec bagian 5.2.
 */
export const REQUIRED_STEPS = ["usaha", "layanan", "jam", "identitas"] as const;
export const REQUIRED_STEP_COUNT = REQUIRED_STEPS.length;

export type WizardServiceAnswer = {
  name: string;
  durationMinutes: number;
  /** String karena berasal langsung dari <input>; divalidasi Zod saat kirim. */
  price: string;
};

export type WizardHoursAnswer = {
  days: number[];
  startTime: string;
  endTime: string;
};

export type WizardAnswers = {
  category: BusinessCategory | null;
  typeSlug: string | null;
  service: WizardServiceAnswer | null;
  hours: WizardHoursAnswer | null;
};

export const EMPTY_ANSWERS: WizardAnswers = {
  category: null,
  typeSlug: null,
  service: null,
  hours: null,
};

export type HoursPresetId = "kerja" | "senin-sabtu" | "setiap-hari";

export const HOURS_PRESETS: readonly {
  id: HoursPresetId;
  label: string;
  description: string;
  days: DayOfWeek[];
  startTime: string;
  endTime: string;
}[] = [
  {
    id: "kerja",
    label: "Senin - Jumat",
    description: "09.00 - 17.00",
    days: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "17:00",
  },
  {
    id: "senin-sabtu",
    label: "Senin - Sabtu",
    description: "09.00 - 18.00",
    days: [1, 2, 3, 4, 5, 6],
    startTime: "09:00",
    endTime: "18:00",
  },
  {
    id: "setiap-hari",
    label: "Setiap hari",
    description: "10.00 - 20.00",
    days: [1, 2, 3, 4, 5, 6, 7],
    startTime: "10:00",
    endTime: "20:00",
  },
];

export function requiredStepNumber(step: WizardStep): number | null {
  const index = (REQUIRED_STEPS as readonly WizardStep[]).indexOf(step);
  return index === -1 ? null : index + 1;
}

/**
 * Langkah 1 selalu terbuka. Langkah berikutnya terbuka hanya bila seluruh
 * jawaban sebelumnya sudah ada. Kategori LAINNYA sengaja tanpa sub-kategori,
 * jadi `typeSlug` null di sana bukan berarti belum terjawab.
 */
export function isStepUnlocked(step: WizardStep, answers: WizardAnswers): boolean {
  const usahaTerjawab =
    answers.category !== null &&
    (answers.category === "LAINNYA" || answers.typeSlug !== null);

  switch (step) {
    case "usaha":
      return true;
    case "layanan":
      return usahaTerjawab;
    case "jam":
      return usahaTerjawab && answers.service !== null;
    case "identitas":
      return usahaTerjawab && answers.service !== null && answers.hours !== null;
    // Layar sukses dan blok opsional hanya dicapai lewat penyimpanan yang
    // berhasil, tidak pernah lewat tautan langsung.
    case "sukses":
    case "profil":
    case "kebutuhan":
      return false;
  }
}

/**
 * Memetakan `?langkah=` ke langkah yang benar-benar boleh ditampilkan. Bila
 * prasyaratnya belum terjawab -- tautan langsung, atau state klien yang hilang
 * -- kembalikan langkah valid TERAKHIR, bukan langkah pertama secara buta.
 */
export function resolveStep(
  requested: string | null,
  answers: WizardAnswers,
): WizardStep {
  const step = (WIZARD_STEPS as readonly string[]).includes(requested ?? "")
    ? (requested as WizardStep)
    : "usaha";

  if (isStepUnlocked(step, answers)) return step;

  const terbuka = (REQUIRED_STEPS as readonly WizardStep[]).filter((candidate) =>
    isStepUnlocked(candidate, answers),
  );

  return terbuka.at(-1) ?? "usaha";
}

export function nextStep(step: WizardStep): WizardStep | null {
  const index = WIZARD_STEPS.indexOf(step);
  return WIZARD_STEPS[index + 1] ?? null;
}

/**
 * Mundur hanya berlaku di dalam langkah wajib. Dari layar sukses tidak ada
 * jalan kembali ke identitas: akun sudah tersimpan, dan mengirim ulang form
 * itu hanya akan menabrak username miliknya sendiri.
 */
export function previousStep(step: WizardStep): WizardStep | null {
  const index = (REQUIRED_STEPS as readonly WizardStep[]).indexOf(step);
  if (index <= 0) return null;
  return REQUIRED_STEPS[index - 1];
}

export function hoursToRows(hours: WizardHoursAnswer): {
  day_of_week: number;
  start_time: string;
  end_time: string;
}[] {
  return [...hours.days]
    .sort((a, b) => a - b)
    .map((day) => ({
      day_of_week: day,
      start_time: hours.startTime,
      end_time: hours.endTime,
    }));
}

/**
 * Kunci menyertakan id user supaya akun lain di perangkat yang sama tidak
 * mewarisi jawaban orang sebelumnya.
 */
export function storageKey(userId: string): string {
  return `booka:onboarding:${userId}`;
}

/** Isi cadangan tidak dipercaya: apa pun yang tidak berbentuk benar jadi kosong. */
export function parseStoredAnswers(raw: string | null): WizardAnswers {
  if (!raw) return EMPTY_ANSWERS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_ANSWERS;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return EMPTY_ANSWERS;
  }

  const value = parsed as Record<string, unknown>;

  const category =
    typeof value.category === "string" ? (value.category as BusinessCategory) : null;
  const typeSlug = typeof value.typeSlug === "string" ? value.typeSlug : null;

  const service =
    typeof value.service === "object" && value.service !== null
      ? (value.service as WizardServiceAnswer)
      : null;
  const hours =
    typeof value.hours === "object" && value.hours !== null
      ? (value.hours as WizardHoursAnswer)
      : null;

  if (value.category !== undefined && value.category !== null && category === null) {
    return EMPTY_ANSWERS;
  }

  return { category, typeSlug, service, hours };
}
```

- [ ] **Step 4: Jalankan uji, pastikan lulus**

Run: `npm run test:unit`
Expected: seluruh uji di `wizard-state.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/onboarding/wizard-state.ts src/app/onboarding/wizard-state.test.ts
git commit -m "Tambahkan mesin langkah wizard onboarding"
```

---

## Task 5: Komponen pilihan dan kerangka wizard

**Files:**
- Create: `src/components/ui/option-card.tsx`
- Create: `src/components/ui/option-check-card.tsx`
- Create: `src/components/onboarding/wizard-shell.tsx`
- Create: `src/components/onboarding/wizard-progress.tsx`

**Interfaces:**
- Consumes: `cn` dari `@/lib/utils`; `Button` dari `@/components/ui/button`; `REQUIRED_STEP_COUNT` dari `@/app/onboarding/wizard-state`
- Produces: `<OptionCard>`, `<OptionCardGroup>`, `<OptionCheckCard>`, `<WizardShell>`, `<WizardProgress>`

Repo ini tidak punya test runner untuk komponen React — `test:unit` hanya menjalankan `src/**/*.test.ts`. Gerbang tugas ini adalah `npm run check`. Jangan menambahkan runner baru.

- [ ] **Step 1: Periksa konvensi komponen yang sudah ada**

Baca `src/components/ui/button.tsx` dan `src/components/ui/field.tsx` untuk melihat cara repo ini memakai `cva`, `data-slot`, dan `cn`. Ikuti pola yang sama persis — jangan memperkenalkan gaya baru.

- [ ] **Step 2: Tulis `option-card.tsx`**

```tsx
"use client";

import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Kartu pilih-satu. Berbasis <input type="radio"> tersembunyi, BUKAN <button>
 * dengan aria-checked manual: radio asli memberi navigasi panah, pengelompokan
 * lewat `name`, dan pengumuman screen reader secara gratis dan benar.
 */
export function OptionCardGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="option-card-group"
      className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}
      {...props}
    />
  );
}

export function OptionCard({
  name,
  value,
  checked,
  onSelect,
  icon,
  label,
  description,
  disabled,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  icon?: React.ReactNode;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      data-slot="option-card"
      data-checked={checked || undefined}
      className={cn(
        // min-h menjaga target ketuk tetap nyaman di ponsel.
        "relative flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border p-4",
        "transition-colors hover:bg-accent/50",
        "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
        "data-[checked]:border-primary data-[checked]:bg-primary/5",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      {icon ? <span className="text-muted-foreground shrink-0">{icon}</span> : null}
      <span className="flex flex-col gap-0.5">
        <span className="text-sm leading-none font-medium">{label}</span>
        {description ? (
          <span className="text-muted-foreground text-sm">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
```

- [ ] **Step 3: Tulis `option-check-card.tsx`**

Sama seperti `OptionCard` tetapi `type="checkbox"`, dengan prop `onToggle: (value: string, checked: boolean) => void`. Saat batas maksimum tercapai, komponen pemanggil mengirim `disabled` untuk pilihan yang belum tercentang — pilihan dinonaktifkan, BUKAN memunculkan pesan error.

```tsx
"use client";

import type * as React from "react";

import { cn } from "@/lib/utils";

export function OptionCheckCard({
  name,
  value,
  checked,
  onToggle,
  label,
  description,
  disabled,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onToggle: (value: string, checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      data-slot="option-check-card"
      data-checked={checked || undefined}
      className={cn(
        "relative flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border p-4",
        "transition-colors hover:bg-accent/50",
        "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
        "data-[checked]:border-primary data-[checked]:bg-primary/5",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onToggle(value, event.target.checked)}
        className="sr-only"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm leading-none font-medium">{label}</span>
        {description ? (
          <span className="text-muted-foreground text-sm">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
```

- [ ] **Step 4: Tulis `wizard-progress.tsx`**

```tsx
import { REQUIRED_STEP_COUNT } from "@/app/onboarding/wizard-state";

/**
 * Progres HANYA menghitung langkah wajib. `current` null berarti merchant sudah
 * melewati garis finis (layar sukses / blok opsional) dan barnya penuh.
 */
export function WizardProgress({ current }: { current: number | null }) {
  const selesai = current ?? REQUIRED_STEP_COUNT;
  const persen = Math.round((selesai / REQUIRED_STEP_COUNT) * 100);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={REQUIRED_STEP_COUNT}
        aria-valuenow={selesai}
        aria-label="Kemajuan pengaturan awal"
      >
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${persen}%` }}
        />
      </div>
      {current === null ? null : (
        <p className="text-muted-foreground text-xs">
          Langkah {current} dari {REQUIRED_STEP_COUNT}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Tulis `wizard-shell.tsx`**

Kerangka layar penuh: area progres di atas, judul + deskripsi, konten, dan footer lengket berisi tombol kembali/lanjut. Terima props `progress`, `title`, `description`, `children`, `footer`. Mobile-first: satu kolom, `max-w-2xl`, padding aman, footer `sticky bottom-0` dengan latar solid supaya konten yang tergulir tidak menembusnya. Transisi antar langkah memakai `motion-reduce:transition-none` seperti pada `wizard-progress.tsx`.

```tsx
import type * as React from "react";

import { WizardProgress } from "./wizard-progress";

export function WizardShell({
  progress,
  title,
  description,
  children,
  footer,
}: {
  progress: number | null;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col px-4 py-8">
      <WizardProgress current={progress} />

      <header className="mt-8 flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </header>

      <main className="mt-6 flex-1">{children}</main>

      {footer ? (
        <footer className="bg-background sticky bottom-0 mt-8 flex items-center justify-between gap-3 border-t py-4">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Verifikasi**

Run: `npm run check`
Expected: typecheck, lint, unit test, dan build lulus semua.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/option-card.tsx src/components/ui/option-check-card.tsx src/components/onboarding/
git commit -m "Tambahkan komponen pilihan dan kerangka wizard onboarding"
```

---

## Task 6: Server action onboarding

**Files:**
- Modify: `src/app/onboarding/actions.ts` (ganti `completeOnboarding`, pertahankan `checkUsernameAvailability` apa adanya)

**Interfaces:**
- Consumes: `completeOnboardingSchema`, `optionalProfileSchema` dari `@/lib/validations/onboarding`; `hoursToRows` dari `./wizard-state`; `createClient` dari `@/lib/supabase/server`; `ROUTES` dari `@/lib/routes`
- Produces: `OnboardingState` (diperluas), `completeOnboarding(prevState, formData)`, `saveOptionalProfile(prevState, formData)`, `skipOptionalProfile()`

- [ ] **Step 1: Ganti `completeOnboarding` agar memanggil RPC**

`checkUsernameAvailability` TIDAK diubah. `completeOnboarding` sekarang menerima seluruh jawaban wizard lewat `FormData` (jawaban langkah 1–3 dikirim sebagai satu field JSON `answers`, identitas sebagai field biasa), memvalidasi dengan `completeOnboardingSchema`, lalu memanggil RPC.

Perluas `OnboardingState` dengan `fieldErrors` untuk `service` dan `hours`, dan tambahkan status `"success"`:

```ts
export type OnboardingState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<
    Record<"full_name" | "username" | "whatsapp_number" | "service" | "hours", string>
  >;
};
```

Inti pemanggilan RPC:

```ts
  const { error } = await supabase.rpc("complete_onboarding", {
    p_full_name: parsed.data.full_name,
    p_username: parsed.data.username,
    p_whatsapp_number: parsed.data.whatsapp_number,
    p_business_category: parsed.data.business_category,
    p_business_type_slug: parsed.data.business_type_slug,
    p_service_name: parsed.data.service.name,
    p_service_duration_minutes: parsed.data.service.duration_minutes,
    p_service_price: parsed.data.service.price,
    p_availability: hoursToRows({
      days: parsed.data.hours.days,
      startTime: parsed.data.hours.start_time,
      endTime: parsed.data.hours.end_time,
    }),
  });
```

Penerjemahan error — pertahankan pesan yang sudah ada, tambahkan yang baru:

```ts
  if (error) {
    // 23505 unique_violation -- dua merchant mengirim username sama bersamaan;
    // validasi optimistis di form bisa kalah cepat dari constraint.
    if (error.code === "23505") {
      return {
        status: "error",
        message: "Username baru saja diambil orang lain. Coba yang lain.",
        fieldErrors: { username: "Username sudah dipakai" },
      };
    }
    // 23514 check_violation dipakai trigger reject_reserved_username.
    if (error.code === "23514") {
      return {
        status: "error",
        message: "Username tidak dapat digunakan.",
        fieldErrors: { username: "Username ini dipakai sistem" },
      };
    }
    // 23P01 exclusion_violation -- jam kerja tumpang tindih.
    if (error.code === "23P01") {
      return {
        status: "error",
        message: "Jam kerja yang dipilih tumpang tindih. Periksa kembali.",
        fieldErrors: { hours: "Jam kerja tumpang tindih" },
      };
    }
    return { status: "error", message: "Gagal menyimpan data. Coba lagi." };
  }
```

PENTING: jangan `redirect()` ke dashboard di akhir. Wizard perlu menampilkan layar sukses lebih dulu. Kembalikan `{ status: "success" }` dan panggil `revalidatePath(ROUTES.dashboard)`.

- [ ] **Step 2: Tambahkan `saveOptionalProfile` dan `skipOptionalProfile`**

Keduanya berjalan setelah akun jadi, jadi tidak butuh atomicity dengan apa pun — cukup `update` biasa yang dijaga RLS.

```ts
export async function saveOptionalProfile(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = optionalProfileSchema.safeParse({
    team_size: formData.get("team_size") || null,
    province: formData.get("province") || null,
    current_channels: formData.getAll("current_channels"),
    goals: formData.getAll("goals"),
    acquisition_source: formData.get("acquisition_source") || null,
  });

  if (!parsed.success) {
    return { status: "error", message: "Periksa kembali pilihan Anda" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  // optional_skipped_at dikosongkan: constraint
  // merchant_profiles_optional_exclusive menolak keduanya terisi bersamaan,
  // dan merchant yang tadinya melewati lalu kembali menjawab sudah bukan
  // "melewati" lagi.
  const { error } = await supabase
    .from("merchant_profiles")
    .update({
      ...parsed.data,
      optional_answered_at: new Date().toISOString(),
      optional_skipped_at: null,
    })
    .eq("merchant_id", user.id);

  if (error) {
    return { status: "error", message: "Gagal menyimpan. Coba lagi." };
  }

  revalidatePath(ROUTES.dashboard);
  return { status: "success" };
}
```

`skipOptionalProfile()` melakukan hal yang sama tetapi hanya menyetel
`optional_skipped_at: new Date().toISOString()` dan `optional_answered_at: null`,
lalu `redirect(ROUTES.dashboard)`.

- [ ] **Step 3: Verifikasi**

Run: `npm run check`
Expected: lulus. Bila typecheck mengeluh tentang tipe `rpc("complete_onboarding", ...)`, periksa entri Functions yang ditambahkan di Task 1 — perbaiki tipe di sana, JANGAN memakai `as any`.

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/actions.ts
git commit -m "Simpan hasil wizard onboarding lewat RPC complete_onboarding"
```

---

## Task 7: Wizard dan langkah 1-4

**Files:**
- Create: `src/app/onboarding/wizard.tsx`
- Create: `src/app/onboarding/steps/step-usaha.tsx`
- Create: `src/app/onboarding/steps/step-layanan.tsx`
- Create: `src/app/onboarding/steps/step-jam.tsx`
- Create: `src/app/onboarding/steps/step-sukses.tsx`
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/app/onboarding/onboarding-form.tsx`

**Interfaces:**
- Consumes: seluruh ekspor `./wizard-state`; `BUSINESS_CATEGORIES`, `typesForCategory`, `findBusinessType` dari `@/lib/business/catalog`; `completeOnboarding` dari `./actions`; komponen dari Task 5
- Produces: `<OnboardingWizard userId appUrl defaultFullName defaultUsername />`

- [ ] **Step 1: Ubah `page.tsx` agar meneruskan `userId` dan merender wizard**

Penjaga sesi yang sudah ada dipertahankan persis. Yang berubah hanya: teruskan `user.id` sebagai `userId` dan render `<OnboardingWizard>` alih-alih `<Card><OnboardingForm/></Card>`. Wizard mengelola kerangkanya sendiri lewat `WizardShell`, jadi `Card` pembungkus dilepas.

- [ ] **Step 2: Tulis `wizard.tsx`**

Komponen klien yang memegang `WizardAnswers`, menyinkronkan langkah ke `?langkah=`, dan mencadangkan jawaban ke `sessionStorage`.

Ketentuan yang mengikat:

- Baca langkah dari `useSearchParams()`, lalu lewatkan melalui `resolveStep(requested, answers)`.
- Berpindah langkah memakai `window.history.pushState(null, "", `?langkah=${step}`)` — tersinkron dengan `useSearchParams` di Next 16 (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`). JANGAN memakai `router.push`.
- Bila `resolveStep` memundurkan langkah karena prasyarat belum terjawab, tulis ulang URL dengan `window.history.replaceState`, BUKAN `pushState` — supaya tombol Back tidak terjebak memantul.
- Pulihkan cadangan di `useEffect` pertama: `parseStoredAnswers(sessionStorage.getItem(storageKey(userId)))`. Simpan pada setiap perubahan `answers`. Hapus kunci begitu penyimpanan berhasil.
- `sessionStorage` hanya ada di browser — seluruh akses dibungkus `useEffect`, jangan pernah dipanggil saat render.
- Maju otomatis HANYA di langkah `usaha` (setelah sub-kategori dipilih, atau setelah kategori LAINNYA dipilih) dan `jam` (setelah preset dipilih). Langkah `layanan` dan pilihan jam kustom maju lewat tombol.
- `useSearchParams` menuntut `<Suspense>` di atasnya saat prerender. Bungkus `<OnboardingWizard>` dengan `<Suspense>` di `page.tsx`, atau pastikan `export const dynamic = "force-dynamic"` yang sudah ada di `page.tsx` cukup — verifikasi lewat `npm run check`, dan tambahkan `<Suspense>` bila build mengeluh.

- [ ] **Step 3: Tulis `steps/step-usaha.tsx`**

Grid `OptionCardGroup` berisi 10 `OptionCard` dari `BUSINESS_CATEGORIES`. Ikon dipetakan dari nama string di katalog ke komponen `lucide-react` lewat peta lokal di berkas ini — katalog tetap murni.

Setelah kategori dipilih, render chip sub-kategori dari `typesForCategory(category)` DI LAYAR YANG SAMA, bukan langkah baru. Memilih sub-kategori memanggil `onDone`. Kategori `LAINNYA` (tanpa sub-kategori) langsung memanggil `onDone` dengan `typeSlug: null`.

- [ ] **Step 4: Tulis `steps/step-layanan.tsx`**

Kartu template dari `findBusinessType(typeSlug)?.templates ?? []`, plus kartu "Tulis sendiri". Memilih template mengisi `name` dan `durationMinutes`; kolom harga TETAP KOSONG dengan `priceHint` template sebagai `FieldDescription`. Kategori `LAINNYA` tidak punya template, jadi langsung tampilkan form kosong.

Nama, durasi, dan harga bisa disunting. Tombol "Lanjut" dinonaktifkan sampai `wizardServiceSchema` lolos. Langkah ini TIDAK PERNAH maju otomatis.

- [ ] **Step 5: Tulis `steps/step-jam.tsx`**

Tiga `OptionCard` dari `HOURS_PRESETS` — memilih salah satunya memanggil `onDone` dan maju otomatis. Kartu keempat "Atur sendiri" mengembang di tempat: tujuh tombol hari (`OptionCheckCard`) plus dua `<input type="time">`, dengan tombol "Lanjut" yang dinonaktifkan sampai `hoursStepSchema` lolos.

- [ ] **Step 6: Sesuaikan `onboarding-form.tsx` sebagai langkah identitas**

Perubahan seminimal mungkin. Logika cek username, debounce, dan penanganan balapannya TIDAK diubah — sudah matang. Yang berubah:

- Terima prop `answers: WizardAnswers` dan sertakan jawaban langkah 1–3 sebagai `<input type="hidden" name="answers" value={JSON.stringify(...)} />`.
- Terima prop `onSuccess: () => void` dan panggil saat `state.status === "success"` (lewat `useEffect`), supaya wizard berpindah ke layar sukses.
- Teks tombol tetap, tetapi ganti label menjadi "Selesai" agar cocok dengan garis finis langkah 4.

- [ ] **Step 7: Tulis `steps/step-sukses.tsx`**

Tampilkan `{appUrl}/{username}` dengan tombol salin (`navigator.clipboard.writeText`, dengan fallback diam bila tidak tersedia). Dua aksi: "Lanjut, 30 detik" menuju langkah `profil`, dan "Lewati" yang memanggil `skipOptionalProfile()`. Keduanya harus SAMA MENONJOL secara visual — lihat spec bagian 5.2.

- [ ] **Step 8: Verifikasi**

Run: `npm run check`
Expected: lulus seluruhnya.

- [ ] **Step 9: Commit**

```bash
git add src/app/onboarding/
git commit -m "Ubah onboarding menjadi wizard empat langkah"
```

---

## Task 8: Blok opsional dan tawaran untuk merchant lama

**Files:**
- Create: `src/app/onboarding/steps/step-profil.tsx`
- Create: `src/app/onboarding/steps/step-kebutuhan.tsx`
- Create: `src/lib/business/labels.ts`
- Create: `src/app/dashboard/profile-nudge.tsx`
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/onboarding/actions.ts` (tambah `saveProfileFromDashboard`)

**Interfaces:**
- Consumes: `saveOptionalProfile`, `skipOptionalProfile` dari `@/app/onboarding/actions`; konstanta enum dari `@/lib/validations/onboarding`; `OptionCard`, `OptionCheckCard`; `requireMerchant` dari `@/lib/auth/session`
- Produces: `<StepProfil>`, `<StepKebutuhan>`, `<ProfileNudge>`, `saveProfileFromDashboard(prevState, formData)`, peta label di `@/lib/business/labels`

- [ ] **Step 1: Tulis label Indonesia untuk setiap nilai enum**

Buat peta label di `src/lib/business/labels.ts` supaya dipakai bersama oleh wizard dan `ProfileNudge` — jangan menulis label yang sama dua kali:

```ts
import type {
  AcquisitionSource,
  BookingChannel,
  IdProvince,
  MerchantGoal,
  TeamSize,
} from "@/types/database";

export const TEAM_SIZE_LABELS: Record<TeamSize, string> = {
  SENDIRI: "Saya sendiri",
  KECIL_2_5: "2-5 orang",
  MENENGAH_6_15: "6-15 orang",
  BESAR_15_PLUS: "Lebih dari 15 orang",
};

export const BOOKING_CHANNEL_LABELS: Record<BookingChannel, string> = {
  WHATSAPP: "Chat WhatsApp",
  INSTAGRAM_DM: "DM Instagram",
  TELEPON: "Telepon",
  DATANG_LANGSUNG: "Datang langsung",
  APLIKASI_LAIN: "Aplikasi atau website lain",
  BELUM_ADA: "Belum menerima pesanan",
};

export const MERCHANT_GOAL_LABELS: Record<MerchantGoal, string> = {
  NO_SHOW: "Pelanggan batal atau tidak datang",
  DP_SULIT: "Susah meminta DP di depan",
  JADWAL_BENTROK: "Jadwal bentrok atau dobel",
  CHAT_BERULANG: "Capek membalas pertanyaan yang sama",
  HALAMAN_RAPI: "Belum punya halaman rapi untuk dibagikan",
  LAPORAN_PEMASUKAN: "Sulit melihat pemasukan",
};

export const ACQUISITION_SOURCE_LABELS: Record<AcquisitionSource, string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  TEMAN: "Teman atau rekomendasi",
  GOOGLE: "Pencarian Google",
  KOMUNITAS: "Komunitas atau grup",
  LAINNYA: "Lainnya",
};

/** Label provinsi. Kunci harus lengkap 38 -- Record memaksanya saat typecheck. */
export const ID_PROVINCE_LABELS: Record<IdProvince, string> = {
  ACEH: "Aceh",
  SUMATERA_UTARA: "Sumatera Utara",
  // ... lengkapi seluruh 38 provinsi
};
```

Tipe `Record<IdProvince, string>` membuat typecheck gagal bila ada provinsi yang terlewat — itulah penjaganya, jadi jangan melonggarkannya menjadi `Partial`.

- [ ] **Step 2: Tulis `steps/step-profil.tsx`**

Ukuran tim sebagai empat `OptionCard`, provinsi sebagai `<Select>` dari `@/components/ui/select` berisi 38 opsi terurut abjad. Tombol "Lanjut" menuju langkah `kebutuhan`; tombol "Lewati" memanggil `skipOptionalProfile()`.

Sesuai spec bagian 5.3: "Lewati" di sini langsung menuju dashboard dan TIDAK menurunkan merchant ke langkah `kebutuhan`.

- [ ] **Step 3: Tulis `steps/step-kebutuhan.tsx`**

Tiga pertanyaan dalam satu `<form action={saveOptionalProfile}>`:
- `current_channels` — `OptionCheckCard` multi, maksimal 6
- `goals` — `OptionCheckCard` multi, maksimal 3; saat 3 tercapai, pilihan yang belum tercentang diberi `disabled` (bukan pesan error)
- `acquisition_source` — `OptionCard` pilih satu

Field tersembunyi meneruskan pilihan langkah `profil` (ukuran tim, provinsi) agar satu submit menyimpan keduanya. Setelah sukses, `redirect` ke dashboard dilakukan komponen lewat `router.replace(ROUTES.dashboard)`.

- [ ] **Step 4: Tulis `profile-nudge.tsx`**

Server Component async, seperti `setup-alerts.tsx`. Memakai `requireMerchant()` dan `createClient()`, membaca satu baris `merchant_profiles`.

Tampilkan kartu HANYA bila baris tidak ada, ATAU `optional_answered_at` dan `optional_skipped_at` keduanya `null`. Kartu membuka `Dialog` berisi pertanyaan yang sama, memakai komponen yang sama. "Nanti saja" memanggil `skipOptionalProfile()`.

Bila baris `merchant_profiles` belum ada sama sekali (merchant dari sebelum kuesioner), dialog juga menanyakan kategori usaha — dan aksinya harus `insert` baris baru, bukan `update` yang mengenai nol baris. Tangani ini dengan action terpisah `saveProfileFromDashboard` di `actions.ts` yang memakai `upsert` pada `merchant_profiles` (tabel ini TIDAK punya masalah grant kolom `id` seperti `merchants`, karena `authenticated` punya `insert` penuh dan `update` mencakup semua kolom non-kunci — jadi `upsert` aman di sini).

- [ ] **Step 5: Pasang di dashboard**

Di `src/app/dashboard/page.tsx`, tambahkan `<Suspense fallback={null}><ProfileNudge /></Suspense>` SETELAH `<SetupAlerts />`. Fallback `null` mengikuti alasan yang sudah tertulis di komentar `page.tsx`: bentuknya dinamis (nol atau satu kartu), jadi skeleton apa pun akan menyesatkan atau memicu layout shift.

`ProfileNudge` terpisah dari `SetupAlerts` dengan sengaja — `SetupAlerts` mengurus kesiapan halaman booking, `ProfileNudge` mengurus pengenalan usaha. Jangan menggabungkannya.

- [ ] **Step 6: Verifikasi**

Run: `npm run check`
Expected: lulus seluruhnya.

- [ ] **Step 7: Verifikasi akhir skema**

Run: `npm run docker:test`
Expected: seluruh kasus 27a-27k tetap `OK`, tidak ada `FAIL` di seluruh keluaran.

- [ ] **Step 8: Commit**

```bash
git add src/lib/business/labels.ts src/app/onboarding/steps/ src/app/dashboard/profile-nudge.tsx src/app/dashboard/page.tsx
git commit -m "Tambahkan blok pertanyaan opsional dan tawaran untuk merchant lama"
```

---

## Catatan penutup untuk implementer

- **Dokumentasikan penyimpangan.** Spec ini tidak menyimpang dari PRD, jadi `docs/DECISIONS.md` tidak perlu diubah. Bila implementasi memaksa penyimpangan baru, catat di sana.
- **Perbarui `AGENTS.md` bagian Status** setelah Task 8: sebutkan bahwa onboarding kini berupa wizard berkuesioner. Lakukan ini di commit Task 8.
- **Jangan menambah dependensi baru.** Seluruh kebutuhan sudah ada: Zod, lucide-react, shadcn/ui, Tailwind v4.
