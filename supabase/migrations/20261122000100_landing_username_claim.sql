-- ===========================================================================
-- Landing: segmen /untuk dicadangkan dan RPC cek ketersediaan username publik.
--
-- Cek username dibuka untuk publik (formulir klaim di beranda). Risiko panen
-- username tidak relevan karena setiap username merchant sudah publik lewat
-- /<username> dan sitemap. Yang dijaga adalah beban database: 30 cek per hash
-- IP per 10 menit, dengan pola yang sama dengan check_booking_rate_limit.
-- ===========================================================================

do $$
begin
  if exists (select 1 from public.merchants where username = 'untuk') then
    raise exception 'Merchant dengan username untuk sudah ada. Ganti username-nya dulu sebelum migration ini dijalankan, kalau tidak akun itu terkunci.';
  end if;
end $$;

insert into public.reserved_usernames (name) values ('untuk')
on conflict (name) do nothing;

-- Disimpan sebagai hash, BUKAN alamat IP mentah: nilainya hanya dicocokkan,
-- tidak pernah dibaca balik, jadi menyimpan IP mentah berarti menyimpan data
-- pribadi tanpa alasan.
create table public.username_check_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index username_check_attempts_lookup_idx
  on public.username_check_attempts (ip_hash, created_at desc);
create index username_check_attempts_created_idx
  on public.username_check_attempts (created_at);

-- Hanya disentuh service role lewat fungsi di bawah.
revoke all on public.username_check_attempts from anon, authenticated;
alter table public.username_check_attempts enable row level security;

/**
 * Mencatat satu cek, menegakkan batas, lalu melaporkan status username:
 * 'rate_limited' | 'reserved' | 'taken' | 'available'.
 * Validasi format dilakukan di aplikasi sebelum RPC ini dipanggil.
 */
create or replace function public.check_username_claim(
  p_username text,
  p_ip_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window constant interval := interval '10 minutes';
  v_max constant integer := 30;
  v_recent integer;
begin
  -- Tanpa identitas pemanggil, batas tidak bisa ditegakkan: dibiarkan lewat
  -- (tanpa mencatat baris) tapi diberi peringatan, seperti rate limit booking.
  if p_ip_hash is null or p_ip_hash = '' then
    raise warning 'check_username_claim dipanggil tanpa ip_hash';
  else
    delete from public.username_check_attempts
    where created_at < now() - v_window;

    insert into public.username_check_attempts (ip_hash) values (p_ip_hash);

    select count(*) into v_recent
    from public.username_check_attempts
    where ip_hash = p_ip_hash
      and created_at > now() - v_window;

    if v_recent > v_max then
      return 'rate_limited';
    end if;
  end if;

  if exists (select 1 from public.reserved_usernames where name = p_username) then
    return 'reserved';
  end if;
  if exists (select 1 from public.merchants where username = p_username) then
    return 'taken';
  end if;
  return 'available';
end;
$$;

revoke execute on function public.check_username_claim(text, text)
  from public, anon, authenticated;
grant execute on function public.check_username_claim(text, text) to service_role;

notify pgrst, 'reload schema';
