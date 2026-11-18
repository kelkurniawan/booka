-- ===========================================================================
-- Funnel iklan, Task 1: tautan iklan, ID pixel, dan link-in-bio.
--
-- Errcode baru: BK080 batas 8 tautan link-in-bio, BK081 payload tautan tidak valid.
-- Pola regex ID pixel dan URL harus sama dengan Zod (src/lib/funnel/*).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- ad_links
-- ---------------------------------------------------------------------------
create table public.ad_links (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  slug text not null,
  name text not null,
  channel public.ad_channel not null,
  service_id uuid,
  voucher_code text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ad_links_slug_format check (slug ~ '^[a-z0-9-]{3,40}$'),
  constraint ad_links_name_length check (char_length(btrim(name)) between 1 and 60),
  constraint ad_links_voucher_length check (voucher_code is null or char_length(voucher_code) between 1 and 40),
  constraint ad_links_merchant_slug_key unique (merchant_id, slug),
  -- Dipakai FK gabungan dari funnel_events dan bookings (Task 2).
  constraint ad_links_id_merchant_key unique (id, merchant_id),
  constraint ad_links_service_fk foreign key (service_id, merchant_id)
    references public.services (id, merchant_id) on delete set null (service_id)
);

create index ad_links_service_idx on public.ad_links (service_id, merchant_id) where service_id is not null;

alter table public.ad_links enable row level security;
revoke all on public.ad_links from anon, authenticated;
grant select on public.ad_links to authenticated;
grant insert (merchant_id, slug, name, channel, service_id, voucher_code) on public.ad_links to authenticated;
grant update (name, channel, service_id, voucher_code, archived_at) on public.ad_links to authenticated;

create policy "ad_links_select_own" on public.ad_links for select to authenticated
  using ((select auth.uid()) = merchant_id);
create policy "ad_links_insert_own" on public.ad_links for insert to authenticated
  with check ((select auth.uid()) = merchant_id);
create policy "ad_links_update_own" on public.ad_links for update to authenticated
  using ((select auth.uid()) = merchant_id)
  with check ((select auth.uid()) = merchant_id);

-- anon me-resolve ?t= hanya lewat fungsi ini; tabelnya tidak terbaca langsung.
create function public.resolve_ad_link(p_username text, p_slug text)
returns table (id uuid, service_id uuid, voucher_code text, channel public.ad_channel)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.service_id, l.voucher_code, l.channel
  from public.ad_links l
  join public.merchants m on m.id = l.merchant_id
  where m.username = p_username
    and l.slug = p_slug
    and l.archived_at is null;
$$;
revoke execute on function public.resolve_ad_link(text, text) from public, anon, authenticated;
grant execute on function public.resolve_ad_link(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- merchant_tracking
-- ---------------------------------------------------------------------------
create table public.merchant_tracking (
  merchant_id uuid primary key references public.merchants (id) on delete cascade,
  meta_pixel_id text,
  tiktok_pixel_id text,
  ga4_measurement_id text,
  meta_enabled boolean not null default false,
  tiktok_enabled boolean not null default false,
  ga4_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_tracking_meta_format check (meta_pixel_id is null or meta_pixel_id ~ '^\d{15,16}$'),
  constraint merchant_tracking_tiktok_format check (tiktok_pixel_id is null or tiktok_pixel_id ~ '^[A-Z0-9]{20}$'),
  constraint merchant_tracking_ga4_format check (ga4_measurement_id is null or ga4_measurement_id ~ '^G-[A-Z0-9]{6,12}$'),
  constraint merchant_tracking_enabled_has_id check (
    (not meta_enabled or meta_pixel_id is not null)
    and (not tiktok_enabled or tiktok_pixel_id is not null)
    and (not ga4_enabled or ga4_measurement_id is not null))
);

create trigger merchant_tracking_set_updated_at
  before update on public.merchant_tracking
  for each row execute function public.set_updated_at();

alter table public.merchant_tracking enable row level security;
revoke all on public.merchant_tracking from anon, authenticated;
grant select on public.merchant_tracking to authenticated;
grant insert (merchant_id, meta_pixel_id, tiktok_pixel_id, ga4_measurement_id, meta_enabled, tiktok_enabled, ga4_enabled)
  on public.merchant_tracking to authenticated;
grant update (meta_pixel_id, tiktok_pixel_id, ga4_measurement_id, meta_enabled, tiktok_enabled, ga4_enabled)
  on public.merchant_tracking to authenticated;

create policy "merchant_tracking_select_own" on public.merchant_tracking for select to authenticated
  using ((select auth.uid()) = merchant_id);
create policy "merchant_tracking_insert_own" on public.merchant_tracking for insert to authenticated
  with check ((select auth.uid()) = merchant_id);
create policy "merchant_tracking_update_own" on public.merchant_tracking for update to authenticated
  using ((select auth.uid()) = merchant_id)
  with check ((select auth.uid()) = merchant_id);

-- ID yang dimatikan tidak keluar. Merchant tanpa username (halaman belum publik) tidak mengembalikan baris.
create function public.get_public_tracking(p_merchant_id uuid)
returns table (meta_pixel_id text, tiktok_pixel_id text, ga4_measurement_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when t.meta_enabled then t.meta_pixel_id end,
    case when t.tiktok_enabled then t.tiktok_pixel_id end,
    case when t.ga4_enabled then t.ga4_measurement_id end
  from public.merchant_tracking t
  join public.merchants m on m.id = t.merchant_id
  where t.merchant_id = p_merchant_id and m.username is not null;
$$;
revoke execute on function public.get_public_tracking(uuid) from public, anon, authenticated;
grant execute on function public.get_public_tracking(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- merchant_links (link-in-bio)
-- ---------------------------------------------------------------------------
create table public.merchant_links (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  label text not null,
  url text not null,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  constraint merchant_links_label_length check (char_length(btrim(label)) between 1 and 40),
  constraint merchant_links_url_https check (char_length(url) <= 500 and url ~ '^https://[^[:space:]]+$')
);

create index merchant_links_merchant_idx on public.merchant_links (merchant_id, sort_order);

-- Maksimal 8 per merchant, di bawah kunci merchant (pola banner, DECISIONS #34).
create function public.enforce_merchant_links_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('links:' || new.merchant_id::text));
  -- Upsert menyunting baris yang sudah ada: BEFORE INSERT tetap jalan, jangan dihitung sebagai tautan baru.
  if exists (select 1 from public.merchant_links l where l.id = new.id) then
    return new;
  end if;
  if (select count(*) from public.merchant_links l where l.merchant_id = new.merchant_id) >= 8 then
    raise exception 'Maksimal 8 tautan' using errcode = 'BK080';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_merchant_links_limit() from public, anon, authenticated;

create trigger merchant_links_limit
  before insert on public.merchant_links
  for each row execute function public.enforce_merchant_links_limit();

alter table public.merchant_links enable row level security;
revoke all on public.merchant_links from anon, authenticated;
grant select (id, merchant_id, label, url, sort_order) on public.merchant_links to anon;
grant select, delete on public.merchant_links to authenticated;
grant insert (id, merchant_id, label, url, sort_order, is_visible) on public.merchant_links to authenticated;
grant update (label, url, sort_order, is_visible) on public.merchant_links to authenticated;

create policy "merchant_links_public_read" on public.merchant_links for select to anon
  using (
    is_visible
    and exists (select 1 from public.merchants m
                where m.id = merchant_links.merchant_id and m.username is not null)
  );
create policy "merchant_links_select_own" on public.merchant_links for select to authenticated
  using ((select auth.uid()) = merchant_id);
create policy "merchant_links_insert_own" on public.merchant_links for insert to authenticated
  with check ((select auth.uid()) = merchant_id);
create policy "merchant_links_update_own" on public.merchant_links for update to authenticated
  using ((select auth.uid()) = merchant_id)
  with check ((select auth.uid()) = merchant_id);
create policy "merchant_links_delete_own" on public.merchant_links for delete to authenticated
  using ((select auth.uid()) = merchant_id);

-- Ikon sosial di link-in-bio: kontak dibaca anon hanya lewat fungsi ini, tanpa grant
-- kolom merchant_settings, supaya kontak yang disembunyikan (contact_hidden) tidak bocor.
-- WhatsApp = merchants.whatsapp_number (sama dengan contactLinks di src/lib/booking/contact.ts);
-- contact_phone adalah kanal PHONE terpisah dan sengaja tidak dikembalikan.
create function public.get_public_contacts(p_merchant_id uuid)
returns table (instagram text, tiktok text, whatsapp text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when not ('INSTAGRAM' = any (coalesce(s.contact_hidden, '{}'))) then s.contact_instagram end,
    case when not ('TIKTOK' = any (coalesce(s.contact_hidden, '{}'))) then s.contact_tiktok end,
    case when not ('WHATSAPP' = any (coalesce(s.contact_hidden, '{}'))) then m.whatsapp_number end
  from public.merchants m
  left join public.merchant_settings s on s.merchant_id = m.id
  where m.id = p_merchant_id and m.username is not null;
$$;
revoke execute on function public.get_public_contacts(uuid) from public, anon, authenticated;
grant execute on function public.get_public_contacts(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- merchant_themes: bagian LINKS dan tombol ikon sosial
-- ---------------------------------------------------------------------------
alter table public.merchant_themes
  add column show_social_icons boolean not null default true;

alter table public.merchant_themes
  drop constraint merchant_themes_section_order_valid,
  drop constraint merchant_themes_hidden_sections_valid;

alter table public.merchant_themes
  alter column section_order set default array['LINKS', 'PROMO', 'SERVICES', 'FAQ'];

update public.merchant_themes set section_order = array['LINKS'] || section_order;

alter table public.merchant_themes
  add constraint merchant_themes_section_order_valid check (
    array_ndims(section_order) = 1 and cardinality(section_order) = 4
    and section_order <@ array['LINKS', 'PROMO', 'SERVICES', 'FAQ']
    and section_order @> array['LINKS', 'PROMO', 'SERVICES', 'FAQ']),
  add constraint merchant_themes_hidden_sections_valid check (
    coalesce(array_ndims(hidden_sections), 1) = 1
    and hidden_sections <@ array['LINKS', 'PROMO', 'FAQ']);

-- ---------------------------------------------------------------------------
-- save_merchant_links: simpan seluruh daftar tautan + dua pengaturan tema dalam
-- satu transaksi di bawah kunci merchant. Yang tidak ada di payload dihapus.
-- Hapus dulu, upsert sesudahnya: batas 8 di trigger dihitung dari baris yang
-- ada, jadi mengganti tautan saat sudah penuh tidak boleh tersangkut.
-- ---------------------------------------------------------------------------
create function public.save_merchant_links(
  p_links jsonb,
  p_show_social_icons boolean,
  p_section_order text[]
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_merchant_id uuid := auth.uid();
  v_ids uuid[];
  v_count integer;
  v_bad boolean;
begin
  if v_merchant_id is null then
    raise exception 'Harus masuk' using errcode = '42501';
  end if;

  p_links := coalesce(p_links, '[]'::jsonb);
  if jsonb_typeof(p_links) <> 'array' or p_show_social_icons is null
     or p_section_order is null
     or array_ndims(p_section_order) is distinct from 1
     or cardinality(p_section_order) <> 4
     or not (p_section_order <@ array['LINKS', 'PROMO', 'SERVICES', 'FAQ']
             and p_section_order @> array['LINKS', 'PROMO', 'SERVICES', 'FAQ']) then
    raise exception 'Tautan tidak valid' using errcode = 'BK081';
  end if;

  perform pg_advisory_xact_lock(hashtext('links:' || v_merchant_id::text));

  select coalesce(array_agg(l.id), '{}'),
         count(*) > 8 or count(distinct l.id) <> count(*) or bool_or(l.id is null)
           or bool_or(l.url is null or l.url !~ '^https://[^[:space:]]+$' or char_length(l.url) > 500)
           or bool_or(l.label is null or char_length(btrim(l.label)) not between 1 and 40)
    into v_ids, v_bad
    from jsonb_to_recordset(p_links) as l(id uuid, label text, url text);
  if v_bad then
    raise exception 'Tautan tidak valid' using errcode = 'BK081';
  end if;

  if exists (select 1 from public.merchant_links x
             where x.id = any (v_ids) and x.merchant_id <> v_merchant_id) then
    raise exception 'Tautan milik merchant lain' using errcode = '42501';
  end if;

  delete from public.merchant_links x
    where x.merchant_id = v_merchant_id and not (x.id = any (v_ids));

  insert into public.merchant_links (id, merchant_id, label, url, sort_order, is_visible)
  select l.id, v_merchant_id, btrim(l.label), l.url, l.sort_order, coalesce(l.is_visible, true)
    from jsonb_to_recordset(p_links) as l(id uuid, label text, url text, sort_order integer, is_visible boolean)
  on conflict (id) do update
    set label = excluded.label, url = excluded.url,
        sort_order = excluded.sort_order, is_visible = excluded.is_visible
    where public.merchant_links.merchant_id = v_merchant_id;
  get diagnostics v_count = row_count;
  if v_count <> cardinality(v_ids) then
    raise exception 'Tautan milik merchant lain' using errcode = '42501';
  end if;

  insert into public.merchant_themes (merchant_id, show_social_icons, section_order)
  values (v_merchant_id, p_show_social_icons, p_section_order)
  on conflict (merchant_id) do update
    set show_social_icons = excluded.show_social_icons, section_order = excluded.section_order;
end;
$$;
revoke execute on function public.save_merchant_links(jsonb, boolean, text[]) from public, anon, authenticated;
grant execute on function public.save_merchant_links(jsonb, boolean, text[]) to authenticated;

notify pgrst, 'reload schema';
