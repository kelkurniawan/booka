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

  -- Paket diperiksa SEBELUM batas jumlah, supaya merchant STARTER yang mencoba
  -- mengunggah video mendapat pesan tentang paketnya, bukan tentang kuota.
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
