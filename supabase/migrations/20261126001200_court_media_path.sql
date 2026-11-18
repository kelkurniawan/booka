-- Path foto lapangan: `{merchant_id}/court/{court_id}/{berkas}`. Constraint
-- lama tidak mengizinkan subfolder (charset tanpa "/"), jadi semua unggahan
-- ditolak. Versi baru mengikat folder ke lapangan barisnya sendiri.
alter table public.court_media drop constraint court_media_path_scoped;
alter table public.court_media add constraint court_media_path_scoped check (
  path ~ ('^' || merchant_id::text || '/court/' || court_id::text || '/[A-Za-z0-9._-]+$')
  and path !~ '\.\.');
