-- ===========================================================================
-- Fungsi RPC untuk private.payment_credentials.
--
-- Schema `private` sengaja TIDAK didaftarkan sebagai exposed schema di
-- Supabase (docs/SETUP.md bagian 4) -- PostgREST menolak query ke schema
-- yang tidak ada di daftar itu untuk PERAN APA PUN, termasuk service_role.
-- Tanpa fungsi ini, createAdminClient() (klien service_role, tetap lewat
-- PostgREST) sama sekali tidak punya jalan membaca atau menulis
-- private.payment_credentials -- pola yang sama dengan get_booked_ranges
-- yang menyembunyikan tabel bookings dari anon.
--
-- Kedua fungsi SECURITY DEFINER ini menerima merchant_id + provider (bukan
-- connection_id) dan memverifikasi kepemilikan baris payment_connections
-- SENDIRI lewat unique constraint payment_connections_unique_provider,
-- bukan cuma mempercayai connection_id dari pemanggil -- pola yang sama
-- dengan "filter merchant_id eksplisit" yang dipakai di seluruh kode admin
-- client lain (lihat AGENTS.md).
-- ===========================================================================

create or replace function public.get_payment_credential(
  p_merchant_id uuid,
  p_provider public.payment_provider
)
returns table (access_token_encrypted text, refresh_token_encrypted text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.access_token_encrypted, c.refresh_token_encrypted
  from private.payment_credentials c
  join public.payment_connections pc on pc.id = c.connection_id
  where pc.merchant_id = p_merchant_id
    and pc.provider = p_provider;
$$;

create or replace function public.upsert_payment_credential(
  p_merchant_id uuid,
  p_provider public.payment_provider,
  p_access_token_encrypted text,
  p_refresh_token_encrypted text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection_id uuid;
begin
  select id into v_connection_id
  from public.payment_connections
  where merchant_id = p_merchant_id and provider = p_provider;

  if v_connection_id is null then
    raise exception
      'payment_connections belum ada untuk merchant % provider % -- buat barisnya dulu sebelum menyimpan kredensial',
      p_merchant_id, p_provider
      using errcode = 'P0003';
  end if;

  insert into private.payment_credentials
    (connection_id, access_token_encrypted, refresh_token_encrypted)
  values
    (v_connection_id, p_access_token_encrypted, p_refresh_token_encrypted)
  on conflict (connection_id) do update
    set access_token_encrypted = excluded.access_token_encrypted,
        refresh_token_encrypted = excluded.refresh_token_encrypted;
end;
$$;

-- Tertutup secara default sejak 20260730000300, tapi tetap direvoke dari
-- PUBLIC eksplisit di sini (mengikuti pola get_booked_ranges) supaya tidak
-- diam-diam bergantung pada urutan migration.
revoke execute on function public.get_payment_credential(uuid, public.payment_provider) from public;
revoke execute on function public.upsert_payment_credential(uuid, public.payment_provider, text, text) from public;

grant execute on function public.get_payment_credential(uuid, public.payment_provider) to service_role;
grant execute on function public.upsert_payment_credential(uuid, public.payment_provider, text, text) to service_role;
