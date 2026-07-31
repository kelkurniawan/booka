-- ===========================================================================
-- Menutup celah EXECUTE pada fungsi.
--
-- Supabase memasang ALTER DEFAULT PRIVILEGES yang memberi EXECUTE pada fungsi
-- baru di schema `public` kepada anon & authenticated — persis seperti
-- privilege ALL yang diberikan pada tabel baru. Migration sebelumnya sudah
-- menangani ini untuk TABEL, tapi keliru hanya melakukan
-- `revoke execute ... from public` untuk fungsi: itu tidak menyentuh grant
-- langsung ke anon/authenticated yang dipasang lewat default privileges.
--
-- Dampak nyata sebelum migration ini: `count_bookings_this_month(uuid)` bisa
-- dipanggil siapa pun tanpa sesi lewat /rest/v1/rpc/count_bookings_this_month,
-- membocorkan jumlah transaksi bulan berjalan milik merchant mana pun kalau
-- UUID-nya diketahui.
-- ===========================================================================

-- --- Cabut grant langsung ke anon & authenticated ---------------------------
-- Fungsi trigger: secara teknis sudah terlindungi Postgres sendiri (menolak
-- dipanggil di luar konteks trigger), tapi tetap ditutup — tidak boleh muncul
-- di /rest/v1/rpc/ sama sekali.
revoke execute on function public.set_updated_at() from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.reject_reserved_username() from anon, authenticated;
revoke execute on function public.enforce_service_limit() from anon, authenticated;
revoke execute on function public.enforce_booking_quota() from anon, authenticated;

-- Fungsi non-trigger yang benar-benar bisa dipanggil siapa pun sebelum ini.
revoke execute on function public.count_bookings_this_month(uuid) from anon, authenticated;
revoke execute on function public.booking_quota_for_tier(public.subscription_tier)
  from anon, authenticated;

-- my_quota_usage() hanya untuk merchant yang sedang login. Bagi anon,
-- auth.uid() bernilai NULL sehingga hasilnya kosong — tidak bisa
-- dieksploitasi — tapi tetap dicabut supaya sesuai niatnya.
revoke execute on function public.my_quota_usage() from anon;

-- get_booked_ranges() TIDAK disentuh: memang dirancang publik dan hanya
-- mengembalikan rentang waktu, tanpa data pribadi.

-- --- Cegah kelas bug yang sama terulang ------------------------------------
-- Fungsi baru di schema public tidak lagi otomatis dapat EXECUTE dari
-- anon/authenticated. Setiap fungsi yang memang harus publik wajib di-GRANT
-- eksplisit setelah dibuat.
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;

-- --- Perbaikan search_path pada fungsi milik sendiri ------------------------
-- Ditemukan Supabase security advisor (function_search_path_mutable).
-- public.timerange / public.timemultirange tidak disentuh: keduanya fungsi
-- `internal` bawaan Postgres hasil auto-generate dari CREATE TYPE ... AS
-- RANGE, dan tidak melakukan resolusi SQL dinamis lewat search_path.
alter function public.set_updated_at() set search_path = '';
alter function public.booking_quota_for_tier(public.subscription_tier) set search_path = '';
