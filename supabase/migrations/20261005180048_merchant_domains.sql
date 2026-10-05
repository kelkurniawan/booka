-- ===========================================================================
-- Domain sendiri untuk halaman booking (paket Studio).
--
-- Satu merchant, satu domain. Alurnya:
--   1. Merchant mendaftarkan domain -> baris PENDING + token verifikasi acak.
--   2. Merchant memasang dua record DNS: CNAME/A ke Vercel (supaya traffic
--      sampai) dan TXT `_booka.<domain>` = `booka-verify=<token>` (bukti bahwa
--      DIA yang menguasai DNS domain itu).
--   3. Server memeriksa keduanya lalu menandai ACTIVE lewat service role.
--
-- Kenapa TXT wajib: tanpa itu, merchant A bisa mendaftarkan domain milik
-- merchant B lebih dulu dan menekan "Periksa" begitu B memasang CNAME --
-- halaman A yang tayang di domain B. Token per merchant membuat hanya pemilik
-- DNS yang bisa mengaktifkan.
--
-- Unik hanya untuk domain ACTIVE: banyak merchant boleh punya klaim PENDING
-- atas nama yang sama tanpa saling memblokir; yang lolos verifikasi menang.
-- ===========================================================================

create type public.domain_status as enum ('PENDING', 'ACTIVE');

create table public.merchant_domains (
  merchant_id uuid primary key references public.merchants (id) on delete cascade,
  domain text not null,
  status public.domain_status not null default 'PENDING',
  verification_token text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint merchant_domains_format check (
    char_length(domain) between 4 and 253
    and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
  )
);

create unique index merchant_domains_active_unique
  on public.merchant_domains (domain) where status = 'ACTIVE';

create trigger merchant_domains_set_updated_at
  before update on public.merchant_domains
  for each row execute function public.set_updated_at();

create or replace function public.enforce_domain_tier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select m.subscription_tier from public.merchants m where m.id = new.merchant_id)
     is distinct from 'STUDIO' then
    raise exception 'Domain sendiri khusus paket Studio' using errcode = 'BK010';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_domain_tier() from public;

create trigger merchant_domains_enforce_tier
  before insert on public.merchant_domains
  for each row execute function public.enforce_domain_tier();

alter table public.merchant_domains enable row level security;
revoke all on public.merchant_domains from anon, authenticated;

-- Merchant mendaftarkan dan melepas domainnya sendiri. Status, token, dan
-- verified_at TIDAK bisa ditulis authenticated -- hanya service role setelah
-- DNS diperiksa.
grant select on public.merchant_domains to authenticated;
grant insert (merchant_id, domain) on public.merchant_domains to authenticated;
grant delete on public.merchant_domains to authenticated;

create policy "merchant_domains_read_own"
  on public.merchant_domains for select to authenticated
  using ((select auth.uid()) = merchant_id);

create policy "merchant_domains_insert_own"
  on public.merchant_domains for insert to authenticated
  with check ((select auth.uid()) = merchant_id);

create policy "merchant_domains_delete_own"
  on public.merchant_domains for delete to authenticated
  using ((select auth.uid()) = merchant_id);

/**
 * Host -> username, untuk proxy. Hanya domain ACTIVE milik merchant yang
 * MASIH Studio: turun paket langsung mematikan domain tanpa menghapus
 * barisnya.
 */
create or replace function public.resolve_custom_domain(p_host text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.username
  from public.merchant_domains d
  join public.merchants m on m.id = d.merchant_id
  where d.domain = lower(p_host)
    and d.status = 'ACTIVE'
    and m.subscription_tier = 'STUDIO'
    and m.username is not null;
$$;

revoke execute on function public.resolve_custom_domain(text) from public;
grant execute on function public.resolve_custom_domain(text) to anon, authenticated;

notify pgrst, 'reload schema';
