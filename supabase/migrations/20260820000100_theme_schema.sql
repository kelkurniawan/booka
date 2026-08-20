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
-- Paket STARTER hanya boleh memilih salah satu dari tiga preset gratis, plus
-- gaya sudut. Perhatikan: trigger ini TIDAK menyala saat merchant PRO turun ke
-- STARTER, karena tidak ada UPDATE pada tabel ini yang terjadi. Kasus itu
-- ditangani resolveTheme() di src/lib/theme/resolve.ts, yang memangkas nilai
-- premium saat dibaca.
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
