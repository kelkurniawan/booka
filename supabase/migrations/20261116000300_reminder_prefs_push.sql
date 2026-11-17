-- ===========================================================================
-- F4: preferensi pengingat per booking dan langganan web push.
-- Keduanya hanya diakses service_role (RLS aktif tanpa policy). Kunci langganan
-- push disimpan terenkripsi (secret-box), bukan teks polos.
-- ===========================================================================

create table public.booking_reminder_prefs (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  whatsapp boolean not null default true,
  -- null = email mati.
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  -- null = ikut merchant_settings.
  day_before boolean,
  same_day boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger booking_reminder_prefs_set_updated_at
  before update on public.booking_reminder_prefs
  for each row execute function public.set_updated_at();

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  endpoint_hash text not null check (endpoint_hash ~ '^[0-9a-f]{64}$'),
  subscription_enc text not null check (char_length(subscription_enc) <= 4000),
  created_at timestamptz not null default now(),
  constraint push_subscriptions_once unique (booking_id, endpoint_hash)
);

create index push_subscriptions_merchant_idx on public.push_subscriptions (merchant_id);

alter table public.booking_reminder_prefs enable row level security;
alter table public.push_subscriptions enable row level security;
revoke all on public.booking_reminder_prefs from anon, authenticated;
revoke all on public.push_subscriptions from anon, authenticated;

-- Hapus langganan booking CANCELLED atau yang selesai lebih dari 1 hari lalu.
create function public.prune_push_subscriptions()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.push_subscriptions s
    using public.bookings b
    where b.id = s.booking_id
      and (b.status = 'CANCELLED' or b.end_datetime < now() - interval '1 day')
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke execute on function public.prune_push_subscriptions() from public, anon, authenticated;
grant execute on function public.prune_push_subscriptions() to service_role;
