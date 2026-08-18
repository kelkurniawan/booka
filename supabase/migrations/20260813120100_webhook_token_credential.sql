-- ===========================================================================
-- Token verifikasi webhook yang terpisah dari kredensial charge.
--
-- MASALAH YANG DIPERBAIKI
-- Adapter Xendit memverifikasi webhook dengan membandingkan header
-- `x-callback-token` terhadap Secret Key API merchant. Itu asumsi yang keliru:
-- callback token Xendit adalah nilai TERSENDIRI yang merchant atur di
-- dashboard Xendit (Settings -> Webhooks), sama sekali bukan turunan Secret
-- Key. Akibatnya setiap webhook Xendit yang asli SELALU gagal verifikasi
-- (401), sehingga booking lewat Xendit tidak pernah berpindah ke PAID.
--
-- Midtrans tidak terpengaruh: signature-nya memang SHA-512 dari
-- order_id + status_code + gross_amount + Server Key, jadi kredensial charge
-- memang benda yang tepat untuk memverifikasinya.
--
-- Kolom ini opsional. Untuk Midtrans dibiarkan NULL, dan adapter Midtrans
-- tetap memakai Server Key seperti sebelumnya.
-- ===========================================================================

alter table private.payment_credentials
  add column webhook_token_encrypted text;

comment on column private.payment_credentials.webhook_token_encrypted is
  'Token verifikasi webhook, terenkripsi. Dipakai Xendit (callback token dari '
  'dashboard Xendit, berbeda dari Secret Key API). NULL untuk Midtrans, yang '
  'memverifikasi lewat signature SHA-512 berbasis Server Key.';


-- --- Baca kredensial: ikutkan webhook token --------------------------------
-- DROP dulu, bukan CREATE OR REPLACE: fungsinya bertambah satu kolom hasil,
-- dan Postgres menolak perubahan tipe kembalian lewat REPLACE
-- ("cannot change return type of existing function"). Hak akses dipasang
-- ulang di bagian Grants karena DROP menghapus ACL lama.
drop function if exists public.get_payment_credential(uuid, public.payment_provider);

create function public.get_payment_credential(
  p_merchant_id uuid,
  p_provider public.payment_provider
)
returns table (
  access_token_encrypted text,
  refresh_token_encrypted text,
  webhook_token_encrypted text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.access_token_encrypted,
    c.refresh_token_encrypted,
    c.webhook_token_encrypted
  from private.payment_credentials c
  join public.payment_connections pc on pc.id = c.connection_id
  where pc.merchant_id = p_merchant_id
    and pc.provider = p_provider
    and pc.status = 'ACTIVE';
$$;


-- --- Simpan kredensial: terima webhook token opsional ----------------------
create or replace function public.upsert_payment_credential(
  p_merchant_id uuid,
  p_provider public.payment_provider,
  p_access_token_encrypted text,
  p_refresh_token_encrypted text default null,
  p_webhook_token_encrypted text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection_id uuid;
begin
  -- Kepemilikan diverifikasi lewat merchant_id + provider, bukan dari
  -- connection_id yang dikirim pemanggil.
  select pc.id into v_connection_id
  from public.payment_connections pc
  where pc.merchant_id = p_merchant_id
    and pc.provider = p_provider;

  if v_connection_id is null then
    raise exception 'Koneksi pembayaran tidak ditemukan untuk merchant ini'
      using errcode = 'BK002';
  end if;

  insert into private.payment_credentials (
    connection_id,
    access_token_encrypted,
    refresh_token_encrypted,
    webhook_token_encrypted
  )
  values (
    v_connection_id,
    p_access_token_encrypted,
    p_refresh_token_encrypted,
    p_webhook_token_encrypted
  )
  on conflict (connection_id) do update
    set access_token_encrypted = excluded.access_token_encrypted,
        refresh_token_encrypted = excluded.refresh_token_encrypted,
        -- NULL pada update berarti "jangan ubah", supaya menyimpan ulang
        -- Server Key tidak diam-diam menghapus callback token yang sudah ada.
        webhook_token_encrypted = coalesce(
          excluded.webhook_token_encrypted,
          private.payment_credentials.webhook_token_encrypted
        ),
        updated_at = now();
end;
$$;


-- ---------------------------------------------------------------------------
-- Grants. Tanda tangan fungsi berubah, jadi hak akses harus dipasang ulang --
-- CREATE OR REPLACE hanya mempertahankan ACL untuk tanda tangan yang persis
-- sama, dan `upsert_payment_credential` kini punya parameter tambahan.
-- ---------------------------------------------------------------------------
revoke execute on function public.get_payment_credential(uuid, public.payment_provider) from public;
grant execute on function public.get_payment_credential(uuid, public.payment_provider) to service_role;

revoke execute on function public.upsert_payment_credential(
  uuid, public.payment_provider, text, text, text
) from public;
grant execute on function public.upsert_payment_credential(
  uuid, public.payment_provider, text, text, text
) to service_role;

-- Tanda tangan lama (4 parameter) ditinggalkan supaya tidak ada dua versi
-- fungsi yang bisa dipanggil, yang lamanya tanpa dukungan webhook token.
drop function if exists public.upsert_payment_credential(
  uuid, public.payment_provider, text, text
);
