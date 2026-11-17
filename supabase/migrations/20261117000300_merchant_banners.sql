-- ===========================================================================
-- F5: banner promosi di halaman booking.
--
-- Keputusan rencana F5 (docs/superpowers/plans/2026-11-15-marky-f5-promosi.md):
--   15. Maksimal 3 banner tayang bersamaan, dihitung per titik waktu di jendela
--       tayangnya, bukan jumlah baris published. Ditegakkan trigger di bawah
--       advisory lock per merchant supaya dua simpan serentak tidak lolos berdua.
-- ===========================================================================

create type public.banner_source as enum ('TEMPLATE', 'IMAGE');
create type public.banner_color as enum ('ACCENT', 'DARK', 'SOFT');
create type public.banner_target as enum ('VOUCHER', 'SERVICE', 'URL');

create table public.merchant_banners (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  source public.banner_source not null,
  tag_text text,
  title text,
  body text,
  color public.banner_color not null default 'ACCENT',
  image_path text,
  alt_text text,
  cta_text text,
  target_kind public.banner_target,
  target_voucher_id uuid references public.vouchers (id) on delete set null,
  target_service_id uuid references public.services (id) on delete set null,
  target_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_banners_tag_length check (char_length(tag_text) <= 24),
  constraint merchant_banners_title_length check (char_length(title) <= 60 and char_length(btrim(title)) >= 1),
  constraint merchant_banners_body_length check (char_length(body) <= 90),
  constraint merchant_banners_alt_length check (char_length(alt_text) between 1 and 140),
  constraint merchant_banners_cta_length check (char_length(cta_text) between 1 and 20),
  constraint merchant_banners_source_fields check (
    (source = 'TEMPLATE' and title is not null and image_path is null and alt_text is null)
    or (source = 'IMAGE' and image_path is not null and alt_text is not null
        and tag_text is null and title is null and body is null)),
  -- Gambar hanya dari folder banner milik merchant sendiri di Storage.
  constraint merchant_banners_image_path check (image_path is null or (
    image_path ~ ('^' || merchant_id::text || '/banner/[A-Za-z0-9._-]+$')
    and position('..' in image_path) = 0)),
  constraint merchant_banners_cta_target check ((cta_text is null) = (target_kind is null)),
  -- Pola URL harus sama dengan BANNER_URL_PATTERN di src/lib/promo/banner.ts.
  constraint merchant_banners_target_url check (
    (target_url is not null) = (target_kind is not distinct from 'URL')
    and (target_url is null or (char_length(target_url) <= 500
      and target_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^[:space:]]*)?$'))),
  -- Id target boleh null walau target_kind-nya cocok: on delete set null saat targetnya dihapus.
  constraint merchant_banners_target_voucher check (target_voucher_id is null or target_kind = 'VOUCHER'),
  constraint merchant_banners_target_service check (target_service_id is null or target_kind = 'SERVICE'),
  constraint merchant_banners_window check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create index merchant_banners_merchant_idx on public.merchant_banners (merchant_id, sort_order);
create index merchant_banners_voucher_idx on public.merchant_banners (target_voucher_id)
  where target_voucher_id is not null;
create index merchant_banners_service_idx on public.merchant_banners (target_service_id)
  where target_service_id is not null;

-- ---------------------------------------------------------------------------
-- Batas 3 tayang bersamaan (Keputusan 15). VOLATILE (bawaan) supaya query
-- sesudah lock melihat baris yang baru di-commit sesi lain.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_banner_live_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new tstzrange;
  v_peak bigint;
begin
  if not new.published or (new.ends_at is not null and new.ends_at <= now()) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('banner:' || new.merchant_id::text));

  v_new := tstzrange(greatest(coalesce(new.starts_at, '-infinity'), now()), coalesce(new.ends_at, 'infinity'), '[)');

  -- Puncak tumpang tindih selalu terjadi di awal salah satu jendela di dalam v_new.
  with others as (
    select tstzrange(coalesce(b.starts_at, '-infinity'), coalesce(b.ends_at, 'infinity'), '[)') r
    from public.merchant_banners b
    where b.merchant_id = new.merchant_id and b.published and b.id <> new.id
  ), points as (
    select lower(v_new) p
    union
    select lower(o.r) from others o where v_new @> lower(o.r)
  )
  select max((select count(*) from others o where o.r @> pt.p)) into v_peak from points pt;

  if coalesce(v_peak, 0) >= 3 then
    raise exception 'Maksimal 3 banner tayang bersamaan' using errcode = 'PR001';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_banner_live_limit() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Target banner harus milik merchant yang sama, dan voucher harus PUBLIC:
-- halaman publik tidak boleh menuntun ke voucher rahasia atau data merchant lain.
-- Invoker cukup: pemilik hanya melihat voucher dan layanannya sendiri.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_banner_target()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.target_voucher_id is not null and not exists (
    select 1 from public.vouchers v
    where v.id = new.target_voucher_id and v.merchant_id = new.merchant_id and v.visibility = 'PUBLIC'
  ) then
    raise exception 'Target voucher banner tidak valid' using errcode = 'BK057';
  end if;
  if new.target_service_id is not null and not exists (
    select 1 from public.services s
    where s.id = new.target_service_id and s.merchant_id = new.merchant_id
  ) then
    raise exception 'Target layanan banner tidak valid' using errcode = 'BK057';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_banner_target() from public, anon, authenticated;

create trigger merchant_banners_check_target
  before insert or update on public.merchant_banners
  for each row execute function public.enforce_banner_target();

-- Arah sebaliknya: voucher yang dituju banner tidak boleh dijadikan PRIVATE.
-- Ditolak, bukan diam-diam melepas target, supaya CTA banner tayang tidak hilang tanpa sepengetahuan merchant.
create or replace function public.guard_banner_voucher_visibility()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visibility = 'PRIVATE' and exists (
    select 1 from public.merchant_banners b where b.target_voucher_id = new.id
  ) then
    raise exception 'Voucher dipakai banner' using errcode = 'BK058';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_banner_voucher_visibility() from public, anon, authenticated;

create trigger vouchers_banner_visibility
  before update of visibility on public.vouchers
  for each row execute function public.guard_banner_voucher_visibility();

create trigger merchant_banners_enforce_tier
  before insert on public.merchant_banners
  for each row execute function public.enforce_promo_tier();

create trigger merchant_banners_live_limit
  before insert or update of published, starts_at, ends_at on public.merchant_banners
  for each row execute function public.enforce_banner_live_limit();

create trigger merchant_banners_set_updated_at
  before update on public.merchant_banners
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Hak akses. Anon hanya membaca banner yang sedang tayang milik merchant
-- berbayar yang punya username; published dan timestamp tidak dibuka.
-- ---------------------------------------------------------------------------
alter table public.merchant_banners enable row level security;
revoke all on public.merchant_banners from anon, authenticated;
grant select (id, merchant_id, source, tag_text, title, body, color, image_path, alt_text, cta_text,
  target_kind, target_voucher_id, target_service_id, target_url, starts_at, ends_at, sort_order)
  on public.merchant_banners to anon;
grant select, delete on public.merchant_banners to authenticated;
grant insert (merchant_id, source, tag_text, title, body, color, image_path, alt_text, cta_text,
  target_kind, target_voucher_id, target_service_id, target_url, starts_at, ends_at, sort_order, published)
  on public.merchant_banners to authenticated;
grant update (source, tag_text, title, body, color, image_path, alt_text, cta_text,
  target_kind, target_voucher_id, target_service_id, target_url, starts_at, ends_at, sort_order, published)
  on public.merchant_banners to authenticated;

create policy "merchant_banners_public_read" on public.merchant_banners for select to anon
  using (
    published
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
    and exists (
      select 1 from public.merchants m
      where m.id = merchant_banners.merchant_id
        and m.username is not null
        and m.subscription_tier <> 'STARTER'
    )
  );
create policy "merchant_banners_select_own" on public.merchant_banners for select to authenticated
  using ((select auth.uid()) = merchant_id);
create policy "merchant_banners_insert_own" on public.merchant_banners for insert to authenticated
  with check ((select auth.uid()) = merchant_id);
create policy "merchant_banners_update_own" on public.merchant_banners for update to authenticated
  using ((select auth.uid()) = merchant_id)
  with check ((select auth.uid()) = merchant_id);
create policy "merchant_banners_delete_own" on public.merchant_banners for delete to authenticated
  using ((select auth.uid()) = merchant_id);

notify pgrst, 'reload schema';
