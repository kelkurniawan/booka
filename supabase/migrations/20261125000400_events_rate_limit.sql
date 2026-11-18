-- Batas laju POST /api/events dan satu VIEW per sesi.
-- Tabel jejak berisi hash IP saja, sama dengan booking_attempts/voucher_attempts.
create table public.event_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index event_attempts_created_idx on public.event_attempts (created_at);
create index event_attempts_lookup_idx on public.event_attempts (ip_hash, merchant_id, created_at desc);
alter table public.event_attempts enable row level security;
revoke all on public.event_attempts from anon, authenticated;

-- 120 kejadian per menit per ip+merchant; satu kunjungan mengirim beberapa kejadian.
create or replace function public.check_event_rate_limit(p_ip_hash text, p_merchant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent integer;
begin
  -- Global, bukan per ip: IP yang tidak kembali tidak boleh meninggalkan baris selamanya.
  delete from public.event_attempts where created_at < now() - interval '1 hour';

  insert into public.event_attempts (ip_hash, merchant_id) values (p_ip_hash, p_merchant_id);

  select count(*) into v_recent
  from public.event_attempts
  where ip_hash = p_ip_hash
    and merchant_id = p_merchant_id
    and created_at > now() - interval '1 minute';

  return v_recent <= 120;
end;
$$;
revoke execute on function public.check_event_rate_limit(text, uuid) from public, anon, authenticated;
grant execute on function public.check_event_rate_limit(text, uuid) to service_role;

-- VIEW kedua untuk sesi yang sama ditolak di basis data (route memetakan 23505 ke 204).
create unique index funnel_events_view_once_key on public.funnel_events (merchant_id, session_id)
  where kind = 'VIEW';

notify pgrst, 'reload schema';
