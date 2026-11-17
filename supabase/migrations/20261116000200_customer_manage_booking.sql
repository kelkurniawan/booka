-- ===========================================================================
-- F4: kebijakan ubah jadwal/batal, kontak, dan pengaturan pengingat merchant,
-- plus RPC pelanggan untuk mengubah jadwal dan membatalkan lewat access_token.
--
-- Errcode baru:
--   BK040 booking tidak bisa dikelola pelanggan (token tidak dikenal, status
--         tidak sesuai, kehadiran sudah dicatat)
--   BK041 ubah jadwal tidak diizinkan merchant
--   BK042 batas waktu ubah jadwal lewat
--   BK043 kesempatan ubah jadwal habis
--   BK044 batal tidak diizinkan merchant
--   BK045 batas waktu batal lewat
--   BK046 jadwal baru kurang dari reschedule_min_hours jam dari sekarang
-- Dipakai ulang: P0006 (jam sudah lewat), BK001 (di luar jam kerja),
-- BK003 (staf nonaktif), 23P01 (bentrok, dari bookings_no_overlap).
--
-- Pemindahan slot dipusatkan di move_booking_slot, dipakai jadwal ulang oleh
-- merchant (F3) dan oleh pelanggan. Batas anti-spam merchant (BK036) tetap
-- di reschedule_booking_by_merchant; penghitung pelanggan (reschedule_count)
-- terpisah dari merchant_reschedule_count.
-- ===========================================================================

create type public.contact_channel as enum ('WHATSAPP', 'PHONE', 'EMAIL', 'INSTAGRAM', 'THREADS', 'X', 'TIKTOK');

alter table public.merchant_settings
  add column allow_customer_reschedule boolean not null default false,
  add column reschedule_min_hours integer not null default 24
    constraint merchant_settings_reschedule_min_hours_check check (reschedule_min_hours between 0 and 168),
  add column max_reschedules integer not null default 1
    constraint merchant_settings_max_reschedules_check check (max_reschedules between 1 and 5),
  add column allow_customer_cancel boolean not null default false,
  add column cancel_min_hours integer not null default 24
    constraint merchant_settings_cancel_min_hours_check check (cancel_min_hours between 0 and 168),
  add column policy_text text
    constraint merchant_settings_policy_text_check check (char_length(policy_text) <= 500),
  add column contact_phone text
    constraint merchant_settings_contact_phone_check check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  add column contact_email text
    constraint merchant_settings_contact_email_check
      check (char_length(contact_email) <= 254 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column contact_instagram text
    constraint merchant_settings_contact_instagram_check check (contact_instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  add column contact_threads text
    constraint merchant_settings_contact_threads_check check (contact_threads ~ '^[A-Za-z0-9._]{1,30}$'),
  add column contact_x text
    constraint merchant_settings_contact_x_check check (contact_x ~ '^[A-Za-z0-9._]{1,30}$'),
  add column contact_tiktok text
    constraint merchant_settings_contact_tiktok_check check (contact_tiktok ~ '^[A-Za-z0-9._]{1,30}$'),
  add column contact_hidden public.contact_channel[] not null default '{}',
  add column reply_from time,
  add column reply_until time,
  add column reminder_whatsapp boolean not null default true,
  add column reminder_email boolean not null default true,
  add column reminder_push boolean not null default true,
  add column reminder_day_before boolean not null default true,
  add column reminder_same_day boolean not null default false,
  add constraint merchant_settings_reply_hours_check check (
    (reply_from is null and reply_until is null)
    or (reply_from is not null and reply_until is not null and reply_from < reply_until));

-- Tanpa grant anon (Keputusan 8). authenticated sudah punya select tingkat tabel.
grant update (
  allow_customer_reschedule, reschedule_min_hours, max_reschedules,
  allow_customer_cancel, cancel_min_hours, policy_text,
  contact_phone, contact_email, contact_instagram, contact_threads, contact_x, contact_tiktok,
  contact_hidden, reply_from, reply_until,
  reminder_whatsapp, reminder_email, reminder_push, reminder_day_before, reminder_same_day
) on public.merchant_settings to authenticated;

-- Ubah jadwal oleh pelanggan. Tanpa grant UPDATE ke authenticated.
alter table public.bookings add column reschedule_count integer not null default 0
  constraint bookings_reschedule_count_nonneg check (reschedule_count >= 0);

insert into public.reserved_usernames (name) values ('sw') on conflict (name) do nothing;

-- Internal (tanpa grant). Pemanggil sudah memegang advisory lock merchant dan
-- baris booking FOR UPDATE. Staf, layanan, dan durasi tetap.
create or replace function public.move_booking_slot(p_booking_id uuid, p_merchant_id uuid, p_new_start timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_duration integer;
  v_staff_id uuid;
  v_end timestamptz;
  v_uses_staff boolean;
begin
  if p_new_start <= now() then
    raise exception 'Jam tersebut sudah lewat' using errcode = 'P0006';
  end if;

  select x.duration_minutes, x.staff_id into v_duration, v_staff_id
    from public.bookings x
    where x.id = p_booking_id and x.merchant_id = p_merchant_id;

  v_end := p_new_start + (v_duration || ' minutes')::interval;

  -- Sama dengan create_booking: kalender per staf hanya untuk STUDIO yang punya staf aktif.
  select m.subscription_tier = 'STUDIO'
         and exists (
           select 1 from public.staff st
           where st.merchant_id = p_merchant_id and st.is_active
         )
    into v_uses_staff
    from public.merchants m
    where m.id = p_merchant_id;

  if coalesce(v_uses_staff, false) and v_staff_id is not null and not exists (
       select 1 from public.staff st
       where st.id = v_staff_id and st.merchant_id = p_merchant_id and st.is_active) then
    raise exception 'Staf tidak tersedia' using errcode = 'BK003';
  end if;

  if not public.slot_within_hours(
       p_merchant_id,
       case when coalesce(v_uses_staff, false) then v_staff_id end,
       extract(isodow from (p_new_start at time zone 'Asia/Jakarta'))::integer,
       (p_new_start at time zone 'Asia/Jakarta')::time,
       (v_end at time zone 'Asia/Jakarta')::time) then
    raise exception 'Slot di luar jam kerja' using errcode = 'BK001';
  end if;

  -- Bentrok dengan booking lain ditangkap bookings_no_overlap (23P01);
  -- baris yang sedang diubah tidak bentrok dengan dirinya sendiri.
  update public.bookings
    set start_datetime = p_new_start, end_datetime = v_end
    where id = p_booking_id and merchant_id = p_merchant_id;

  -- Log idempoten per (booking, kind, channel): hapus supaya pengingat dan
  -- pemberitahuan ubah jadwal terkirim lagi untuk jam baru.
  delete from public.notification_log
    where booking_id = p_booking_id
      and kind in ('REMINDER_CUSTOMER', 'REMINDER_CUSTOMER_SAME_DAY', 'BOOKING_RESCHEDULED_MERCHANT');
end;
$$;

revoke execute on function public.move_booking_slot(uuid, uuid, timestamptz) from public, anon, authenticated;

-- Pindah jam booking yang sudah pasti (PAID/CONFIRMED) dan belum dicatat
-- kehadirannya. Badan F3 (20261115000600) sampai cek BK036; sisanya lewat
-- move_booking_slot.
create or replace function public.reschedule_booking_by_merchant(p_booking_id uuid, p_new_start timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant uuid;
  b public.bookings;
begin
  v_merchant := (select auth.uid());
  if v_merchant is null then
    raise exception 'Perlu login' using errcode = '42501';
  end if;

  -- Kunci yang sama dengan create_booking: jadwal ulang dan booking baru tidak bisa balapan.
  perform pg_advisory_xact_lock(hashtext(v_merchant::text));
  perform public.reap_expired_bookings_for(v_merchant);

  select * into b from public.bookings x
    where x.id = p_booking_id and x.merchant_id = v_merchant
      and x.status in ('PAID', 'CONFIRMED')
      and x.attended_at is null and x.no_show_at is null
    for update;
  if not found then
    raise exception 'Booking tidak bisa dijadwal ulang' using errcode = 'BK034';
  end if;

  if b.merchant_reschedule_count >= 3 then
    raise exception 'Booking sudah dijadwal ulang 3 kali' using errcode = 'BK036';
  end if;

  perform public.move_booking_slot(b.id, v_merchant, p_new_start);

  -- Pindah yang gagal (P0006, BK001, 23P01) membatalkan seluruh panggilan,
  -- jadi penghitung hanya naik untuk jadwal ulang yang berhasil.
  update public.bookings
    set merchant_reschedule_count = merchant_reschedule_count + 1
    where id = b.id and merchant_id = v_merchant;
end;
$$;

revoke execute on function public.reschedule_booking_by_merchant(uuid, timestamptz) from public, anon;
grant execute on function public.reschedule_booking_by_merchant(uuid, timestamptz) to authenticated;

-- Ubah jadwal oleh pelanggan lewat access_token. Dipanggil route handler
-- dengan service role; notifikasi dikirim dari TS.
create or replace function public.reschedule_booking(p_token text, p_new_start timestamptz)
returns table (booking_id uuid, old_start timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant uuid;
  b public.bookings;
  s public.merchant_settings;
begin
  select x.merchant_id into v_merchant from public.bookings x where x.access_token = p_token;
  if not found then
    raise exception 'Booking tidak ditemukan' using errcode = 'BK040';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_merchant::text));
  perform public.reap_expired_bookings_for(v_merchant);

  select * into b from public.bookings x
    where x.access_token = p_token and x.merchant_id = v_merchant
    for update;
  select * into s from public.merchant_settings ms where ms.merchant_id = v_merchant;

  if b.status not in ('PAID', 'CONFIRMED') or b.attended_at is not null or b.no_show_at is not null then
    raise exception 'Booking tidak bisa diubah' using errcode = 'BK040';
  end if;

  if not coalesce(s.allow_customer_reschedule, false) then
    raise exception 'Merchant tidak mengizinkan ubah jadwal' using errcode = 'BK041';
  end if;

  if now() > b.start_datetime - make_interval(hours => s.reschedule_min_hours) then
    raise exception 'Batas waktu ubah jadwal sudah lewat' using errcode = 'BK042';
  end if;

  if b.reschedule_count >= s.max_reschedules then
    raise exception 'Kesempatan ubah jadwal sudah habis' using errcode = 'BK043';
  end if;

  if s.reschedule_min_hours > 0 and p_new_start < now() + make_interval(hours => s.reschedule_min_hours) then
    raise exception 'Jadwal baru terlalu dekat' using errcode = 'BK046';
  end if;

  perform public.move_booking_slot(b.id, v_merchant, p_new_start);

  update public.bookings x set reschedule_count = x.reschedule_count + 1 where x.id = b.id;

  return query select b.id, b.start_datetime;
end;
$$;

revoke execute on function public.reschedule_booking(text, timestamptz) from public, anon, authenticated;
grant execute on function public.reschedule_booking(text, timestamptz) to service_role;

-- Batal oleh pelanggan lewat access_token. REQUESTED yang belum mulai selalu
-- boleh dibatalkan (belum ada uang masuk); PAID/CONFIRMED mengikuti kebijakan.
create or replace function public.cancel_booking_by_customer(p_token text)
returns table (booking_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant uuid;
  b public.bookings;
  s public.merchant_settings;
begin
  select x.merchant_id into v_merchant from public.bookings x where x.access_token = p_token;
  if not found then
    raise exception 'Booking tidak ditemukan' using errcode = 'BK040';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_merchant::text));
  perform public.reap_expired_bookings_for(v_merchant);

  select * into b from public.bookings x
    where x.access_token = p_token and x.merchant_id = v_merchant
    for update;
  select * into s from public.merchant_settings ms where ms.merchant_id = v_merchant;

  if b.status = 'REQUESTED' and b.start_datetime > now() then
    null;
  elsif b.status in ('PAID', 'CONFIRMED') and b.attended_at is null and b.no_show_at is null then
    if not coalesce(s.allow_customer_cancel, false) then
      raise exception 'Merchant tidak mengizinkan batal' using errcode = 'BK044';
    end if;
    if now() > b.start_datetime - make_interval(hours => s.cancel_min_hours) then
      raise exception 'Batas waktu batal sudah lewat' using errcode = 'BK045';
    end if;
  else
    raise exception 'Booking tidak bisa dibatalkan' using errcode = 'BK040';
  end if;

  update public.bookings x
    set status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'Dibatalkan pelanggan'
    where x.id = b.id;

  return query select b.id;
end;
$$;

revoke execute on function public.cancel_booking_by_customer(text) from public, anon, authenticated;
grant execute on function public.cancel_booking_by_customer(text) to service_role;

notify pgrst, 'reload schema';
