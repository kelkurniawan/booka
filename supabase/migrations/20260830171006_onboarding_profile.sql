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
