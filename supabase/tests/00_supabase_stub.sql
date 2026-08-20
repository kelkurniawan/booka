-- Tiruan minimal lingkungan Supabase untuk memvalidasi migration secara lokal.
create schema if not exists extensions;
create schema if not exists auth;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- Supabase memberi ALL pada tabel baru di public ke anon/authenticated.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

-- --- Tiruan Storage ---------------------------------------------------------
-- Supabase menyediakan schema `storage` di luar migration kita. Harness ini
-- Postgres polos, jadi bentuk minimalnya dibuat di sini supaya migration yang
-- memasang policy pada storage.objects bisa ikut diuji, bukan jadi satu-satunya
-- bagian keamanan yang tidak pernah dijalankan.
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

grant select on storage.objects to anon;
grant select, insert, update, delete on storage.objects to authenticated;

-- Mengembalikan segmen folder tanpa nama berkas, sama seperti milik Supabase:
-- 'uuid/svc/id/x.webp' -> {uuid,svc,id}
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[
    1 : array_length(string_to_array(name, '/'), 1) - 1
  ];
$$;
