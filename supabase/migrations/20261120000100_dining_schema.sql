-- F8 Restoran, bagian 1: skema denah meja, kolom reservasi, dan hak akses.
--
-- table_mode = cara menghitung kapasitas layanan reservasi:
--   NONE  (default) fitur mati; setiap booking tetap slot eksklusif per staf.
--   AREA  "Total kursi per jam": semua reservasi berbagi seats_per_slot kursi.
--   TABLE "Pakai denah meja": tiap reservasi memegang satu meja (atau dua digabung).
-- Layanan reservasi = services.seat_duration_minutes terisi. Layanan lain
-- milik restoran tetap slot eksklusif walau punya party_min/party_max.
-- bookings.capacity_mode menyimpan cara booking itu memakai tempat, jadi
-- pergantian mode tidak mengubah booking lama.
-- Denah ditulis HANYA lewat RPC (migration berikutnya); authenticated tidak
-- diberi INSERT/UPDATE/DELETE pada dining_areas dan dining_tables.

create type public.table_mode as enum ('NONE', 'AREA', 'TABLE');
create type public.dining_table_shape as enum ('ROUND', 'RECT');

alter table public.services
  add column party_min smallint,
  add column party_max smallint,
  add column seat_duration_minutes smallint,
  add constraint services_party_pair check ((party_min is null) = (party_max is null)),
  add constraint services_party_range check (
    party_min is null or (party_min >= 1 and party_min <= party_max and party_max <= 200)),
  add constraint services_seat_duration_range check (
    seat_duration_minutes is null or seat_duration_minutes between 15 and 480),
  add constraint services_seat_needs_party check (
    seat_duration_minutes is null or party_max is not null);

alter table public.merchant_settings
  add column table_mode public.table_mode not null default 'NONE',
  add column seats_per_slot integer,
  add column table_hold_minutes smallint not null default 15,
  add column auto_join_tables boolean not null default true,
  add constraint merchant_settings_seats_per_slot_check check (
    seats_per_slot is null or seats_per_slot between 1 and 1000),
  add constraint merchant_settings_area_needs_seats_check check (
    table_mode <> 'AREA' or seats_per_slot is not null),
  add constraint merchant_settings_table_hold_minutes_check check (
    table_hold_minutes between 0 and 120);

create table public.dining_areas (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, merchant_id)
);

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  area_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 20),
  min_seats smallint not null default 1,
  max_seats smallint not null,
  shape public.dining_table_shape not null default 'RECT',
  grid_x smallint not null,
  grid_y smallint not null,
  grid_w smallint not null default 3,
  grid_h smallint not null default 3,
  note text check (note is null or char_length(note) between 1 and 60),
  bookable_online boolean not null default true,
  joinable_with uuid[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Area wajib milik merchant yang sama.
  foreign key (area_id, merchant_id) references public.dining_areas (id, merchant_id) on delete cascade,
  constraint dining_tables_seats check (min_seats >= 1 and min_seats <= max_seats and max_seats <= 50),
  constraint dining_tables_grid check (
    grid_x >= 0 and grid_y >= 0 and grid_w between 3 and 12 and grid_h between 3 and 12
    and grid_x + grid_w <= 24 and grid_y + grid_h <= 22),
  constraint dining_tables_not_self_join check (not (id = any (joinable_with))),
  constraint dining_tables_join_count check (cardinality(joinable_with) <= 8)
);

alter table public.bookings
  add column party_size smallint,
  add column area_id uuid references public.dining_areas (id) on delete set null,
  add column table_id uuid references public.dining_tables (id) on delete set null,
  add column joined_table_id uuid references public.dining_tables (id) on delete set null,
  add column table_label text,
  add column customer_note text,
  add column capacity_mode public.table_mode not null default 'NONE',
  add constraint bookings_party_size_range check (party_size is null or party_size between 1 and 200),
  add constraint bookings_customer_note_length check (
    customer_note is null or char_length(customer_note) between 1 and 300),
  add constraint bookings_capacity_party check (capacity_mode = 'NONE' or party_size is not null),
  add constraint bookings_tables_only_table_mode check (
    capacity_mode = 'TABLE' or (table_id is null and joined_table_id is null)),
  add constraint bookings_joined_table_distinct check (
    joined_table_id is null or joined_table_id is distinct from table_id);

create index dining_areas_merchant_idx on public.dining_areas (merchant_id);
create index dining_tables_merchant_area_idx on public.dining_tables (merchant_id, area_id);
create index bookings_joined_table_idx on public.bookings (joined_table_id)
  where joined_table_id is not null;
create index bookings_capacity_start_idx on public.bookings (merchant_id, start_datetime)
  where capacity_mode <> 'NONE';

create trigger dining_tables_set_updated_at
  before update on public.dining_tables
  for each row execute function public.set_updated_at();

alter table public.dining_areas enable row level security;
alter table public.dining_tables enable row level security;
revoke all on public.dining_areas, public.dining_tables from anon, authenticated;

grant select (id, merchant_id, name, sort_order) on public.dining_areas to anon;
grant select (id, merchant_id, area_id, name, min_seats, max_seats, shape,
              grid_x, grid_y, grid_w, grid_h, note, sort_order)
  on public.dining_tables to anon;
grant select on public.dining_areas, public.dining_tables to authenticated;

-- anon hanya melihat denah merchant ber-username yang memakai mode TABLE.
create policy "dining_areas_public_read"
  on public.dining_areas for select to anon
  using (
    exists (select 1 from public.merchants m
            where m.id = dining_areas.merchant_id and m.username is not null)
    and exists (select 1 from public.merchant_settings ms
                where ms.merchant_id = dining_areas.merchant_id and ms.table_mode = 'TABLE')
  );

create policy "dining_tables_public_read"
  on public.dining_tables for select to anon
  using (
    dining_tables.bookable_online
    and exists (select 1 from public.merchants m
                where m.id = dining_tables.merchant_id and m.username is not null)
    and exists (select 1 from public.merchant_settings ms
                where ms.merchant_id = dining_tables.merchant_id and ms.table_mode = 'TABLE')
  );

create policy "dining_areas_read_own"
  on public.dining_areas for select to authenticated
  using ((select auth.uid()) = merchant_id);

create policy "dining_tables_read_own"
  on public.dining_tables for select to authenticated
  using ((select auth.uid()) = merchant_id);

grant select (table_mode, table_hold_minutes) on public.merchant_settings to anon;
grant update (table_mode, seats_per_slot, table_hold_minutes, auto_join_tables)
  on public.merchant_settings to authenticated;

notify pgrst, 'reload schema';
