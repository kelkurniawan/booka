-- ===========================================================================
-- Menambal user yang tidak punya baris `merchants`.
--
-- Trigger `handle_new_user` baru ada sejak migration pertama. User yang
-- mendaftar sebelum itu — atau selama jendela waktu apa pun ketika trigger
-- gagal — punya baris di `auth.users` tanpa pasangannya di `public.merchants`.
--
-- Akibatnya fatal dan senyap: proxy melihat `username` NULL lalu memaksa user
-- ke /onboarding, sementara server action onboarding menjalankan UPDATE yang
-- mengenai 0 baris dan melapor "berhasil". User terpantul bolak-balik ke
-- /onboarding tanpa pernah bisa masuk.
--
-- Pada database yang sehat, migration ini tidak mengubah apa pun.
-- ===========================================================================

insert into public.merchants (id, full_name, avatar_url)
select
  u.id,
  nullif(trim(coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    ''
  )), ''),
  nullif(trim(coalesce(
    u.raw_user_meta_data ->> 'avatar_url',
    u.raw_user_meta_data ->> 'picture',
    ''
  )), '')
from auth.users u
where not exists (
  select 1 from public.merchants m where m.id = u.id
)
on conflict (id) do nothing;
