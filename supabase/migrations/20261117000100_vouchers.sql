-- ===========================================================================
-- F5: voucher. Skema, aturan kelayakan, dan pembaca.
--
-- Keputusan rencana F5 (docs/superpowers/plans/2026-11-15-marky-f5-promosi.md):
--   2.  Tanpa tabel penebusan. Booking adalah buku besarnya: pemakaian voucher =
--       booking dengan voucher_id itu yang booking_holds_slot(status, expires_at).
--       create_booking menghitungnya di bawah advisory lock merchant.
--   3.  Pembatalan dan kedaluwarsa membebaskan pemakaian dengan sendirinya karena
--       hitungannya turunan; PAID dan CONFIRMED dihitung selamanya.
--   4.  Diskon PERCENT = round(harga * value / 100), dibatasi max_discount;
--       FIXED = value; keduanya dibatasi harga. Harga akhir 1..1499 dinaikkan
--       ke 1500 supaya QRIS tetap bisa dibuat (BK022).
--   10. Anon tidak punya hak apa pun ke tabel vouchers; daftar publik hanya
--       lewat public_vouchers().
--   11. Kode rahasia hanya divalidasi dengan kode persis lewat check_voucher
--       (service_role, dibatasi check_voucher_rate_limit) atau create_booking.
-- ===========================================================================

create type public.voucher_kind as enum ('PERCENT', 'FIXED');
create type public.voucher_visibility as enum ('PUBLIC', 'PRIVATE');

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  code text not null,
  kind public.voucher_kind not null,
  value integer not null,
  max_discount integer,
  min_spend integer,
  service_ids uuid[],
  quota integer,
  per_phone_limit integer,
  new_customer_only boolean not null default false,
  visibility public.voucher_visibility not null default 'PUBLIC',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vouchers_code_format check (code ~ '^[A-Z0-9]{4,16}$'),
  -- Kode rahasia minimal 6 karakter supaya sulit ditebak.
  constraint vouchers_private_code_length check (visibility = 'PUBLIC' or char_length(code) >= 6),
  constraint vouchers_merchant_code_unique unique (merchant_id, code),
  constraint vouchers_value_range check (
    (kind = 'PERCENT' and value between 1 and 100)
    or (kind = 'FIXED' and value between 1 and 100000000)),
  constraint vouchers_max_discount check (max_discount is null or (kind = 'PERCENT' and max_discount >= 1)),
  constraint vouchers_min_spend check (min_spend is null or min_spend >= 1),
  constraint vouchers_service_ids check (service_ids is null or cardinality(service_ids) between 1 and 50),
  constraint vouchers_quota_range check (quota is null or quota between 1 and 100000),
  constraint vouchers_per_phone_range check (per_phone_limit is null or per_phone_limit between 1 and 100),
  constraint vouchers_window check (starts_at is null or ends_at is null or ends_at > starts_at)
);

alter table public.bookings
  add column voucher_id uuid references public.vouchers (id) on delete set null,
  add column voucher_code text,
  add column discount_amount numeric(12, 2) not null default 0;
alter table public.bookings
  drop constraint bookings_amount_split,
  add constraint bookings_amount_split check (
    amount_due_now >= 0 and amount_due_on_site >= 0 and discount_amount >= 0
    and amount_due_now + amount_due_on_site + discount_amount = service_price),
  -- voucher_code adalah salinan: tetap ada walau vouchernya dihapus (voucher_id jadi null).
  add constraint bookings_voucher_snapshot check (
    voucher_code is not null or (voucher_id is null and discount_amount = 0));
create index bookings_voucher_idx on public.bookings (voucher_id) where voucher_id is not null;

-- ---------------------------------------------------------------------------
-- Tier: Starter tidak bisa membuat promosi (Task 3 memasangnya juga di banner).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_promo_tier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select m.subscription_tier from public.merchants m where m.id = new.merchant_id) = 'STARTER' then
    raise exception 'Promosi hanya tersedia untuk paket Pro.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_promo_tier() from public, anon, authenticated;

create trigger vouchers_set_updated_at
  before update on public.vouchers
  for each row execute function public.set_updated_at();

create trigger vouchers_enforce_tier
  before insert on public.vouchers
  for each row execute function public.enforce_promo_tier();

-- ---------------------------------------------------------------------------
-- Hak akses vouchers: hanya pemiliknya; anon tidak punya hak apa pun.
-- ---------------------------------------------------------------------------
alter table public.vouchers enable row level security;
revoke all on public.vouchers from anon, authenticated;
grant select, delete on public.vouchers to authenticated;
grant insert (merchant_id, code, kind, value, max_discount, min_spend, service_ids, quota,
  per_phone_limit, new_customer_only, visibility, starts_at, ends_at) on public.vouchers to authenticated;
grant update (code, kind, value, max_discount, min_spend, service_ids, quota,
  per_phone_limit, new_customer_only, visibility, starts_at, ends_at) on public.vouchers to authenticated;

create policy "vouchers_select_own" on public.vouchers for select to authenticated
  using ((select auth.uid()) = merchant_id);
create policy "vouchers_insert_own" on public.vouchers for insert to authenticated
  with check ((select auth.uid()) = merchant_id);
create policy "vouchers_update_own" on public.vouchers for update to authenticated
  using ((select auth.uid()) = merchant_id)
  with check ((select auth.uid()) = merchant_id);
create policy "vouchers_delete_own" on public.vouchers for delete to authenticated
  using ((select auth.uid()) = merchant_id);

-- ---------------------------------------------------------------------------
-- Satu-satunya aturan kelayakan. Internal: pemanggilnya fungsi definer.
-- Selalu satu baris; reason null = layak, selain itu errcode (BK050..BK056,
-- P0005) dan kolom lain null.
-- ---------------------------------------------------------------------------
create or replace function public.evaluate_voucher(
  p_merchant_id uuid,
  p_code text,
  p_service_id uuid,
  p_customer_whatsapp text
)
returns table (voucher_id uuid, code text, discount numeric, reason text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v public.vouchers;
  v_code text := upper(btrim(p_code));
  v_price numeric;
  v_discount numeric;
begin
  -- Merchant Starter diperlakukan seperti kode yang tidak ada (Keputusan 1).
  select vo.* into v
  from public.vouchers vo
  join public.merchants m on m.id = vo.merchant_id
  where vo.merchant_id = p_merchant_id
    and vo.code = v_code
    and m.subscription_tier <> 'STARTER';
  if not found then
    reason := 'BK050';
    return next;
    return;
  end if;

  if v.starts_at > now() or v.ends_at <= now() then
    reason := 'BK051';
    return next;
    return;
  end if;

  select s.price into v_price
  from public.services s
  where s.id = p_service_id and s.merchant_id = p_merchant_id and s.is_active;
  if not found then
    reason := 'P0005';
    return next;
    return;
  end if;
  if v.service_ids is not null and not (p_service_id = any (v.service_ids)) then
    reason := 'BK055';
    return next;
    return;
  end if;

  if v.min_spend is not null and v_price < v.min_spend then
    reason := 'BK054';
    return next;
    return;
  end if;

  if v.quota is not null and (
    select count(*) from public.bookings b
    where b.voucher_id = v.id and public.booking_holds_slot(b.status, b.expires_at)
  ) >= v.quota then
    reason := 'BK052';
    return next;
    return;
  end if;

  if p_customer_whatsapp is not null then
    if v.per_phone_limit is not null and (
      select count(*) from public.bookings b
      where b.voucher_id = v.id
        and b.customer_whatsapp = p_customer_whatsapp
        and public.booking_holds_slot(b.status, b.expires_at)
    ) >= v.per_phone_limit then
      reason := 'BK053';
      return next;
      return;
    end if;

    if v.new_customer_only and exists (
      select 1 from public.bookings b
      where b.merchant_id = p_merchant_id
        and b.customer_whatsapp = p_customer_whatsapp
        and public.booking_holds_slot(b.status, b.expires_at)
    ) then
      reason := 'BK056';
      return next;
      return;
    end if;
  end if;

  v_discount := case when v.kind = 'PERCENT' then round(v_price * v.value / 100.0) else v.value end;
  if v.kind = 'PERCENT' and v.max_discount is not null then v_discount := least(v_discount, v.max_discount); end if;
  v_discount := least(v_discount, v_price);
  -- Harga akhir 1..1499 tidak bisa ditagih QRIS (BK022): diskon dipotong sampai harga akhir 1500.
  if v_price >= 1500 and v_price - v_discount between 1 and 1499 then v_discount := v_price - 1500; end if;

  voucher_id := v.id;
  code := v.code;
  discount := v_discount;
  return next;
end;
$$;
revoke execute on function public.evaluate_voucher(uuid, text, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Daftar voucher publik untuk pemilih di halaman booking (Keputusan 10).
-- Hanya kolom yang dibutuhkan pemilih; quota dan visibility tidak dibuka.
-- ---------------------------------------------------------------------------
create or replace function public.public_vouchers(p_merchant_id uuid)
returns table (
  id uuid,
  code text,
  kind public.voucher_kind,
  value integer,
  max_discount integer,
  min_spend integer,
  service_ids uuid[],
  ends_at timestamptz,
  per_phone_limit integer,
  new_customer_only boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.code, v.kind, v.value, v.max_discount, v.min_spend, v.service_ids, v.ends_at,
         v.per_phone_limit, v.new_customer_only
  from public.vouchers v
  join public.merchants m on m.id = v.merchant_id
  where v.merchant_id = p_merchant_id
    and m.username is not null
    and m.subscription_tier <> 'STARTER'
    and v.visibility = 'PUBLIC'
    and (v.starts_at is null or v.starts_at <= now())
    and (v.ends_at is null or v.ends_at > now())
    and (v.quota is null or (
      select count(*) from public.bookings b
      where b.voucher_id = v.id and public.booking_holds_slot(b.status, b.expires_at)
    ) < v.quota)
  order by v.created_at;
$$;
revoke execute on function public.public_vouchers(uuid) from public;
grant execute on function public.public_vouchers(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Cek kode untuk POST /api/vouchers/check (Keputusan 11). Tanpa nomor
-- WhatsApp, supaya tidak bisa dipakai menebak riwayat pelanggan. Syarat
-- voucher hanya dibuka bila kodenya layak.
-- ---------------------------------------------------------------------------
create or replace function public.check_voucher(p_merchant_id uuid, p_code text, p_service_id uuid)
returns table (
  code text,
  kind public.voucher_kind,
  value integer,
  max_discount integer,
  min_spend integer,
  service_ids uuid[],
  discount numeric,
  reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
begin
  select * into r from public.evaluate_voucher(p_merchant_id, p_code, p_service_id, null);
  if r.reason is not null then
    reason := r.reason;
    return next;
    return;
  end if;

  return query
  select v.code, v.kind, v.value, v.max_discount, v.min_spend, v.service_ids, r.discount, null::text
  from public.vouchers v
  where v.id = r.voucher_id;
end;
$$;
revoke execute on function public.check_voucher(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.check_voucher(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Statistik dashboard: pemakaian per voucher dan ringkasan bulan WIB berjalan.
-- ---------------------------------------------------------------------------
create or replace function public.voucher_stats()
returns table (voucher_id uuid, used integer, month_discount numeric, month_bookings integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_merchant uuid := (select auth.uid());
  v_month_start timestamptz :=
    date_trunc('month', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
begin
  if v_merchant is null then
    raise exception 'Perlu login' using errcode = '42501';
  end if;

  return query
  select v.id,
         count(b.id)::integer,
         coalesce(sum(b.discount_amount) filter (where b.created_at >= v_month_start), 0),
         (count(b.id) filter (where b.created_at >= v_month_start))::integer
  from public.vouchers v
  left join public.bookings b
    on b.voucher_id = v.id and public.booking_holds_slot(b.status, b.expires_at)
  where v.merchant_id = v_merchant
  group by v.id;
end;
$$;
revoke execute on function public.voucher_stats() from public, anon;
grant execute on function public.voucher_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- Rate limit cek kode: 10 per (hash IP, merchant) per 15 menit. Hash, bukan
-- IP mentah, sama dengan booking_attempts.
-- ---------------------------------------------------------------------------
create table public.voucher_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index voucher_attempts_lookup_idx
  on public.voucher_attempts (ip_hash, merchant_id, created_at desc);
alter table public.voucher_attempts enable row level security;
revoke all on public.voucher_attempts from anon, authenticated;

create or replace function public.check_voucher_rate_limit(p_ip_hash text, p_merchant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent integer;
begin
  -- Jejak lama ip ini dibuang di sini, jadi tabelnya tidak tumbuh untuk ip yang kembali.
  delete from public.voucher_attempts
  where ip_hash = p_ip_hash and created_at < now() - interval '1 hour';

  insert into public.voucher_attempts (ip_hash, merchant_id) values (p_ip_hash, p_merchant_id);

  select count(*) into v_recent
  from public.voucher_attempts
  where ip_hash = p_ip_hash
    and merchant_id = p_merchant_id
    and created_at > now() - interval '15 minutes';

  return v_recent <= 10;
end;
$$;
revoke execute on function public.check_voucher_rate_limit(text, uuid) from public, anon, authenticated;
grant execute on function public.check_voucher_rate_limit(text, uuid) to service_role;

notify pgrst, 'reload schema';
