-- F6 tampilan: logo, sampul, gaya tombol, susunan halaman, latar bergerak.
-- Keputusan 3 (susunan = permutasi tiga kunci lewat constraint), 5 (paket),
-- 6 (trigger menolak perubahan, bukan nilai lama), 7 (path logo/sampul).

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

alter table public.merchant_themes
  add constraint merchant_themes_logo_path_scoped check (
    logo_path is null
    or (logo_path ~ ('^' || merchant_id::text || '/[A-Za-z0-9._/-]+$') and logo_path !~ '\.\.')),
  add constraint merchant_themes_cover_path_scoped check (
    cover_path is null
    or (cover_path ~ ('^' || merchant_id::text || '/[A-Za-z0-9._/-]+$') and cover_path !~ '\.\.')),
  add constraint merchant_themes_section_order_valid check (
    array_ndims(section_order) = 1 and cardinality(section_order) = 3
    and section_order <@ array['PROMO', 'SERVICES', 'FAQ']
    and section_order @> array['PROMO', 'SERVICES', 'FAQ']),
  add constraint merchant_themes_hidden_sections_valid check (
    coalesce(array_ndims(hidden_sections), 1) = 1
    and hidden_sections <@ array['PROMO', 'FAQ']);

-- Salinan badan lama (20260820000100) plus dua aturan baru.
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

  -- Hanya perubahan yang ditolak: merchant yang turun paket tetap bisa
  -- menyimpan bagian lain tanpa menghapus sampulnya (Keputusan 6).
  if new.cover_path is not null
     and (tg_op = 'INSERT' or new.cover_path is distinct from old.cover_path) then
    raise exception 'Foto sampul hanya tersedia untuk paket Pro.'
      using errcode = 'P0001';
  end if;
  if new.button_style <> 'FILLED'
     and (tg_op = 'INSERT' or new.button_style is distinct from old.button_style) then
    raise exception 'Gaya tombol hanya tersedia untuk paket Pro.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_theme_tier() from public, anon, authenticated;

-- Tanpa grant baru: tabel ini memakai grant tingkat tabel (seluruh isinya
-- publik), jadi kolom baru ikut grant itu.

notify pgrst, 'reload schema';
