-- Booking lapangan, bagian 1: skema lapangan, foto, aturan harga jam ramai,
-- denah venue, dan penanda layanan sewa.
--
-- Semua tabel baru ditutup total dari anon dan authenticated, lalu dibuka per
-- kolom. anon TIDAK punya hak langsung pada satu pun tabel di sini: ia membaca
-- lewat RPC definer (migration berikutnya). Posisi denah dan aturan harga
-- ditulis hanya lewat RPC (save_venue_layout, save_court_pricing).
--
-- Berkas foto ada di bucket merchant-media pada {merchant_id}/court/; policy
-- Storage yang ada sudah membatasi folder pertama ke auth.uid(), jadi tidak
-- ada policy baru. Pembersihan berkas saat lapangan dihapus dilakukan
-- aplikasi, sama seperti layanan (DECISIONS #26).

-- --- Penanda layanan sewa ----------------------------------------------------
alter table public.services
  add column court_unit_minutes smallint,
  add column court_max_minutes smallint,
  add constraint services_court_unit_check check (
    court_unit_minutes is null or court_unit_minutes in (30, 60)),
  add constraint services_court_max_needs_unit check (
    court_unit_minutes is not null or court_max_minutes is null),
  -- Lama main minimum (duration_minutes) dan maksimum kelipatan unit,
  -- maksimum tidak di bawah minimum dan paling lama 8 jam.
  add constraint services_court_range check (
    court_unit_minutes is null
    or (court_max_minutes is not null
        and court_max_minutes <= 480
        and court_max_minutes % court_unit_minutes = 0
        and duration_minutes % court_unit_minutes = 0
        and court_max_minutes >= duration_minutes)),
  add constraint services_court_xor_seat check (
    court_unit_minutes is null or seat_duration_minutes is null);

-- --- Lapangan ----------------------------------------------------------------
create type public.court_sport as enum ('PADEL', 'FUTSAL', 'MINI_SOCCER', 'BADMINTON', 'TENIS');
create type public.court_environment as enum ('INDOOR', 'OUTDOOR', 'OUTDOOR_BERATAP');

-- Subquery tidak boleh di CHECK, jadi panjang tiap ciri (1-40) lewat fungsi
-- murni. Butuh EXECUTE untuk authenticated karena CHECK berjalan sebagai
-- penulisnya.
create function public.court_features_valid(p_features text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (select 1 from unnest(p_features) f where char_length(f) not between 1 and 40);
$$;
revoke execute on function public.court_features_valid(text[]) from public, anon, authenticated;
grant execute on function public.court_features_valid(text[]) to authenticated;

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  sport public.court_sport not null default 'PADEL',
  environment public.court_environment not null default 'INDOOR',
  surface text,
  description text,
  features text[] not null default '{}',
  -- Posisi di denah (satuan piksel kanvas editor); null = belum ditempatkan.
  pos_x integer,
  pos_y integer,
  rotation smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (id, merchant_id),
  constraint courts_name_unique unique (merchant_id, name),
  constraint courts_name_length check (char_length(btrim(name)) between 1 and 40),
  constraint courts_surface_length check (surface is null or char_length(surface) <= 60),
  constraint courts_description_length check (description is null or char_length(description) <= 280),
  constraint courts_features_count check (cardinality(features) <= 5),
  constraint courts_features_length check (public.court_features_valid(features)),
  constraint courts_rotation check (rotation in (0, 90)),
  constraint courts_pos_pair check ((pos_x is null) = (pos_y is null)),
  constraint courts_pos_range check (
    pos_x is null or (pos_x between 0 and 4000 and pos_y between 0 and 4000))
);

create table public.service_courts (
  service_id uuid not null,
  court_id uuid not null,
  merchant_id uuid not null,
  primary key (service_id, court_id),
  -- FK gabungan: layanan dan lapangan wajib milik merchant yang sama.
  foreign key (service_id, merchant_id) references public.services (id, merchant_id) on delete cascade,
  foreign key (court_id, merchant_id) references public.courts (id, merchant_id) on delete cascade
);

create table public.court_price_rules (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null,
  service_id uuid not null,
  day_of_week smallint not null,
  start_time time not null,
  end_time time not null,
  price_per_hour numeric(12, 2) not null,
  foreign key (service_id, merchant_id) references public.services (id, merchant_id) on delete cascade,
  constraint court_price_rules_day check (day_of_week between 1 and 7),
  constraint court_price_rules_time check (start_time < end_time),
  constraint court_price_rules_price check (price_per_hour >= 0),
  -- Tanpa tumpang tindih per layanan dan hari. Rentang '[)' sehingga 17-22
  -- dan 22-23 boleh bersambung. Tanggal acuan hanya untuk membentuk tsrange.
  constraint court_price_rules_no_overlap exclude using gist (
    service_id with =,
    day_of_week with =,
    tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time) with &&)
);

create table public.court_media (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null,
  merchant_id uuid not null,
  path text not null,
  -- Boleh kosong di database (editor menandainya); foto tanpa alt tidak
  -- pernah ditampilkan di halaman publik.
  alt_text text,
  width smallint not null,
  height smallint not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (court_id, merchant_id) references public.courts (id, merchant_id) on delete cascade,
  constraint court_media_alt_length check (alt_text is null or char_length(alt_text) <= 140),
  constraint court_media_dimensions check (width between 1 and 4096 and height between 1 and 4096),
  -- Hanya folder court milik merchant sendiri; charset sempit seperti service_media.
  constraint court_media_path_scoped check (
    path ~ ('^' || merchant_id::text || '/court/[A-Za-z0-9._-]+$') and path !~ '\.\.')
);

-- Satuan piksel kanvas editor, sama dengan pos_x/pos_y lapangan.
create table public.venue_areas (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 30),
  pos_x integer not null check (pos_x between 0 and 4000),
  pos_y integer not null check (pos_y between 0 and 4000),
  width integer not null check (width between 20 and 4000),
  height integer not null check (height between 20 and 4000),
  sort_order integer not null default 0
);

create table public.venue_markers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 30),
  pos_x integer not null check (pos_x between 0 and 4000),
  pos_y integer not null check (pos_y between 0 and 4000),
  width integer not null check (width between 20 and 4000),
  height integer not null check (height between 20 and 4000),
  sort_order integer not null default 0
);

-- Indeks penutup FK (pola 20261124000100).
create index service_courts_court_idx on public.service_courts (court_id, merchant_id);
create index service_courts_service_idx on public.service_courts (service_id, merchant_id);
create index court_price_rules_service_idx on public.court_price_rules (service_id, merchant_id);
create index court_media_court_idx on public.court_media (court_id, merchant_id, sort_order);
create index venue_areas_merchant_idx on public.venue_areas (merchant_id);
create index venue_markers_merchant_idx on public.venue_markers (merchant_id);

-- --- Batas 5 foto per lapangan ----------------------------------------------
create function public.enforce_court_media_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Kunci per lapangan supaya dua unggahan serentak tidak sama-sama lolos.
  perform pg_advisory_xact_lock(hashtext('court_media:' || new.court_id::text));
  if (select count(*) from public.court_media cm
       where cm.court_id = new.court_id and cm.id is distinct from new.id) >= 5 then
    raise exception 'Satu lapangan maksimal 5 foto.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_court_media_limit() from public;

create trigger court_media_enforce_limit
  before insert or update on public.court_media
  for each row execute function public.enforce_court_media_limit();

-- --- Hak akses dan RLS -------------------------------------------------------
alter table public.courts enable row level security;
alter table public.service_courts enable row level security;
alter table public.court_price_rules enable row level security;
alter table public.court_media enable row level security;
alter table public.venue_areas enable row level security;
alter table public.venue_markers enable row level security;

revoke all on public.courts, public.service_courts, public.court_price_rules,
  public.court_media, public.venue_areas, public.venue_markers from anon, authenticated;

grant select on public.courts, public.service_courts, public.court_price_rules,
  public.court_media, public.venue_areas, public.venue_markers to authenticated;

-- pos_x, pos_y, rotation sengaja di luar grant: hanya save_venue_layout.
grant insert (merchant_id, name, sort_order, is_active, sport, environment, surface, description, features)
  on public.courts to authenticated;
grant update (name, sort_order, is_active, sport, environment, surface, description, features)
  on public.courts to authenticated;
grant delete on public.courts to authenticated;

grant insert (service_id, court_id, merchant_id), delete on public.service_courts to authenticated;

grant insert (court_id, merchant_id, path, alt_text, width, height, sort_order)
  on public.court_media to authenticated;
grant update (alt_text, sort_order) on public.court_media to authenticated;
grant delete on public.court_media to authenticated;

create policy "courts_read_own" on public.courts for select to authenticated
  using ((select auth.uid()) = merchant_id);
create policy "courts_insert_own" on public.courts for insert to authenticated
  with check ((select auth.uid()) = merchant_id);
create policy "courts_update_own" on public.courts for update to authenticated
  using ((select auth.uid()) = merchant_id) with check ((select auth.uid()) = merchant_id);
create policy "courts_delete_own" on public.courts for delete to authenticated
  using ((select auth.uid()) = merchant_id);

create policy "service_courts_read_own" on public.service_courts for select to authenticated
  using ((select auth.uid()) = merchant_id);
create policy "service_courts_insert_own" on public.service_courts for insert to authenticated
  with check ((select auth.uid()) = merchant_id);
create policy "service_courts_delete_own" on public.service_courts for delete to authenticated
  using ((select auth.uid()) = merchant_id);

create policy "court_price_rules_read_own" on public.court_price_rules for select to authenticated
  using ((select auth.uid()) = merchant_id);

create policy "court_media_read_own" on public.court_media for select to authenticated
  using ((select auth.uid()) = merchant_id);
create policy "court_media_insert_own" on public.court_media for insert to authenticated
  with check ((select auth.uid()) = merchant_id);
create policy "court_media_update_own" on public.court_media for update to authenticated
  using ((select auth.uid()) = merchant_id) with check ((select auth.uid()) = merchant_id);
create policy "court_media_delete_own" on public.court_media for delete to authenticated
  using ((select auth.uid()) = merchant_id);

create policy "venue_areas_read_own" on public.venue_areas for select to authenticated
  using ((select auth.uid()) = merchant_id);
create policy "venue_markers_read_own" on public.venue_markers for select to authenticated
  using ((select auth.uid()) = merchant_id);

-- Kolom services baru ikut terbaca anon lewat grant tingkat tabel
-- (20260729000100), sehingga tidak perlu grant tambahan.

notify pgrst, 'reload schema';
