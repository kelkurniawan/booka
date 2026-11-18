-- Perbaikan review akhir funnel iklan: celah deploy section_order (I1) dan ikon
-- WhatsApp publik harus opt-in (I3).

-- I1. Terima urutan 3 bagian (aplikasi lama, tanpa LINKS) atau 4 bagian (dengan LINKS).
alter table public.merchant_themes
  drop constraint merchant_themes_section_order_valid;

alter table public.merchant_themes
  alter column section_order set default array['PROMO', 'SERVICES', 'FAQ'];

-- LINKS di depan = anggapan aplikasi saat LINKS tidak ada, jadi tidak ada yang hilang.
update public.merchant_themes set section_order = array_remove(section_order, 'LINKS')
  where section_order[1] = 'LINKS';

alter table public.merchant_themes
  add constraint merchant_themes_section_order_valid check (
    array_ndims(section_order) = 1
    and (
      (cardinality(section_order) = 3
        and section_order <@ array['PROMO', 'SERVICES', 'FAQ']
        and section_order @> array['PROMO', 'SERVICES', 'FAQ'])
      or
      (cardinality(section_order) = 4
        and section_order <@ array['LINKS', 'PROMO', 'SERVICES', 'FAQ']
        and section_order @> array['LINKS', 'PROMO', 'SERVICES', 'FAQ'])
    ));

-- I3. Nomor WhatsApp merchant tidak publik kecuali merchant memilih menampilkannya.
-- Tanpa grant baru: merchant_themes memakai grant tingkat tabel.
alter table public.merchant_themes
  add column public_whatsapp boolean not null default false;

create or replace function public.get_public_contacts(p_merchant_id uuid)
returns table (instagram text, tiktok text, whatsapp text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when not ('INSTAGRAM' = any (coalesce(s.contact_hidden, '{}'))) then s.contact_instagram end,
    case when not ('TIKTOK' = any (coalesce(s.contact_hidden, '{}'))) then s.contact_tiktok end,
    case when coalesce(t.public_whatsapp, false)
          and not ('WHATSAPP' = any (coalesce(s.contact_hidden, '{}'))) then m.whatsapp_number end
  from public.merchants m
  left join public.merchant_settings s on s.merchant_id = m.id
  left join public.merchant_themes t on t.merchant_id = m.id
  where m.id = p_merchant_id and m.username is not null;
$$;

-- save_merchant_links: tambah p_public_whatsapp (null = biarkan nilai lama).
drop function public.save_merchant_links(jsonb, boolean, text[]);
create function public.save_merchant_links(
  p_links jsonb,
  p_show_social_icons boolean,
  p_section_order text[],
  p_public_whatsapp boolean default null
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

  insert into public.merchant_themes (merchant_id, show_social_icons, section_order, public_whatsapp)
  values (v_merchant_id, p_show_social_icons, p_section_order, coalesce(p_public_whatsapp, false))
  on conflict (merchant_id) do update
    set show_social_icons = excluded.show_social_icons, section_order = excluded.section_order,
        public_whatsapp = coalesce(p_public_whatsapp, public.merchant_themes.public_whatsapp);
end;
$$;
revoke execute on function public.save_merchant_links(jsonb, boolean, text[], boolean) from public, anon, authenticated;
grant execute on function public.save_merchant_links(jsonb, boolean, text[], boolean) to authenticated;

notify pgrst, 'reload schema';
