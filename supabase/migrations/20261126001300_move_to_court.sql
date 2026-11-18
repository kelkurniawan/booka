-- ===========================================================================
-- Pindah booking lapangan ke lapangan pilihan merchant (Task 7, putaran 2).
--
--   - move_booking_slot gains p_court_id (default null). Null = perilaku lama:
--     lapangan sendiri dipertahankan atau dipilihkan otomatis (BK072).
--     Terisi = lapangan itu wajib aktif, milik merchant ini, terkait layanan
--     booking, dan kosong di jam baru, selain itu BK070. Jam dan grid tetap
--     lewat court_slot_fits (BK001); harga tidak dihitung ulang; court_name
--     ikut diperbarui.
--   - reschedule_booking_by_merchant meneruskan p_court_id. Jadwal ulang
--     pelanggan (reschedule_booking) tidak berubah dan tidak bisa memilih.
-- Badan disalin dari 20261126000700 (move_booking_slot) dan
-- 20261116000200 (reschedule_booking_by_merchant).
-- ===========================================================================

drop function public.move_booking_slot(uuid, uuid, timestamptz);

create function public.move_booking_slot(
  p_booking_id uuid, p_merchant_id uuid, p_new_start timestamptz, p_court_id uuid default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_duration integer;
  v_staff_id uuid;
  v_end timestamptz;
  v_uses_staff boolean;
  v_capacity_mode public.table_mode;
  v_party integer;
  v_table_id uuid;
  v_joined_table_id uuid;
  v_area_id uuid;
  v_table_label text;
  v_source public.booking_source;
  v_seats_per_slot integer;
  v_court_id uuid;
  v_court_name text;
  v_service_id uuid;
  v_target_name text;
begin
  if p_new_start <= now() then
    raise exception 'Jam tersebut sudah lewat' using errcode = 'P0006';
  end if;

  select x.duration_minutes, x.staff_id,
         x.capacity_mode, x.party_size, x.table_id, x.joined_table_id, x.area_id, x.table_label, x.source,
         x.court_id, x.court_name, x.service_id
    into v_duration, v_staff_id,
         v_capacity_mode, v_party, v_table_id, v_joined_table_id, v_area_id, v_table_label, v_source,
         v_court_id, v_court_name, v_service_id
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

  -- Booking lapangan: jam dan grid sama dengan create_booking. Layanan yang
  -- sudah dihapus (service_id null) hanya diperiksa jam kerjanya.
  if v_court_id is not null then
    if not public.court_slot_fits(p_merchant_id, p_new_start, v_duration,
         (select s.court_unit_minutes from public.services s
           where s.id = v_service_id and s.merchant_id = p_merchant_id)) then
      raise exception 'Slot di luar jam kerja atau grid lapangan' using errcode = 'BK001';
    end if;
  elsif not public.slot_within_hours(
       p_merchant_id,
       case when coalesce(v_uses_staff, false) then v_staff_id end,
       extract(isodow from (p_new_start at time zone 'Asia/Jakarta'))::integer,
       (p_new_start at time zone 'Asia/Jakarta')::time,
       (v_end at time zone 'Asia/Jakarta')::time) then
    raise exception 'Slot di luar jam kerja' using errcode = 'BK001';
  end if;

  -- Pemanggil sudah memegang kunci merchant dan sudah reap (Keputusan 6).
  -- p_booking_id dikecualikan: baris ini tidak bentrok dengan dirinya sendiri.
  if v_capacity_mode = 'AREA' then
    -- Null karena mode sudah berganti = tidak dibatasi.
    select ms.seats_per_slot into v_seats_per_slot
      from public.merchant_settings ms where ms.merchant_id = p_merchant_id;
    if v_party + public.seats_in_use(p_merchant_id, p_new_start, v_end, p_booking_id) > v_seats_per_slot then
      raise exception 'Kapasitas di jam ini sudah penuh' using errcode = 'BK060';
    end if;
  elsif v_capacity_mode = 'TABLE' then
    -- Meja lama dipertahankan bila masih kosong; selain itu cari meja lain di area yang sama.
    if v_table_id is null
       or public.dining_table_busy(v_table_id, p_new_start, v_end, p_booking_id)
       or (v_joined_table_id is not null
           and public.dining_table_busy(v_joined_table_id, p_new_start, v_end, p_booking_id)) then
      select p.table_id, p.joined_table_id, p.area_id, p.table_label
        into v_table_id, v_joined_table_id, v_area_id, v_table_label
        from public.pick_dining_tables(p_merchant_id, p_new_start, v_end, v_party,
                                       v_area_id, null, v_source = 'ONLINE', p_booking_id) p;
      if not found then
        raise exception 'Kapasitas di jam ini sudah penuh' using errcode = 'BK060';
      end if;
    end if;
  end if;

  -- Booking lapangan: lapangan dan durasi dipertahankan bila lapangan itu
  -- masih aktif dan kosong di jam baru, walau layanannya sudah dihapus atau
  -- tautannya dilepas. Selain itu lapangan aktif lain yang terkait layanan
  -- (urut sort_order lalu nama); tidak ada = BK072. Harga tidak dihitung ulang.
  if p_court_id is not null then
    -- Lapangan tujuan pilihan merchant: harus lapangan aktif merchant ini yang
    -- terkait layanan booking dan kosong di jam baru. Selain itu BK070.
    -- Booking non-sewa tidak punya lapangan, jadi lapangan tujuan ditolak.
    if v_court_id is null then
      raise exception 'Booking ini bukan sewa lapangan' using errcode = 'BK070';
    end if;
    select c.name into v_target_name
      from public.courts c
      join public.service_courts sc on sc.court_id = c.id and sc.merchant_id = c.merchant_id
      where c.id = p_court_id and c.merchant_id = p_merchant_id and c.is_active
        and sc.service_id = v_service_id;
    if v_target_name is null
       or exists (select 1 from public.bookings b
                  where b.court_id = p_court_id
                    and b.id <> p_booking_id
                    and public.booking_holds_slot(b.status, b.expires_at)
                    and tstzrange(b.start_datetime, b.end_datetime, '[)') && tstzrange(p_new_start, v_end, '[)')) then
      raise exception 'Lapangan yang dipilih tidak tersedia' using errcode = 'BK070';
    end if;
    v_court_id := p_court_id;
    v_court_name := v_target_name;
  elsif v_court_id is not null and (
       not exists (select 1 from public.courts c
                   where c.id = v_court_id and c.merchant_id = p_merchant_id and c.is_active)
       or exists (select 1 from public.bookings b
                  where b.court_id = v_court_id
                    and b.id <> p_booking_id
                    and public.booking_holds_slot(b.status, b.expires_at)
                    and tstzrange(b.start_datetime, b.end_datetime, '[)') && tstzrange(p_new_start, v_end, '[)'))) then
    select p.court_id, p.court_name into v_court_id, v_court_name
      from public.pick_court(p_merchant_id, v_service_id, p_new_start, v_end, v_court_id, p_booking_id) p;
    if v_court_id is null then
      raise exception 'Tidak ada lapangan kosong di jam ini' using errcode = 'BK072';
    end if;
  end if;

  -- Booking NONE: bentrok dengan booking lain ditangkap bookings_no_overlap (23P01);
  -- baris yang sedang diubah tidak bentrok dengan dirinya sendiri.
  update public.bookings
    set start_datetime = p_new_start, end_datetime = v_end,
        table_id = v_table_id, joined_table_id = v_joined_table_id,
        area_id = v_area_id, table_label = v_table_label,
        court_id = v_court_id, court_name = v_court_name
    where id = p_booking_id and merchant_id = p_merchant_id;

  -- Log idempoten per (booking, kind, channel): hapus supaya pengingat dan
  -- pemberitahuan ubah jadwal terkirim lagi untuk jam baru.
  delete from public.notification_log
    where booking_id = p_booking_id
      and kind in ('REMINDER_CUSTOMER', 'REMINDER_CUSTOMER_SAME_DAY', 'BOOKING_RESCHEDULED_MERCHANT');
end;
$$;

revoke execute on function public.move_booking_slot(uuid, uuid, timestamptz, uuid) from public, anon, authenticated;

drop function public.reschedule_booking_by_merchant(uuid, timestamptz);

create function public.reschedule_booking_by_merchant(
  p_booking_id uuid, p_new_start timestamptz, p_court_id uuid default null
)
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

  perform public.move_booking_slot(b.id, v_merchant, p_new_start, p_court_id);

  -- Pindah yang gagal membatalkan seluruh panggilan, jadi penghitung hanya
  -- naik untuk jadwal ulang yang berhasil.
  update public.bookings
    set merchant_reschedule_count = merchant_reschedule_count + 1
    where id = b.id and merchant_id = v_merchant;
end;
$$;

revoke execute on function public.reschedule_booking_by_merchant(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.reschedule_booking_by_merchant(uuid, timestamptz, uuid) to authenticated;
