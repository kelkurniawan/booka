-- ===========================================================================
-- Berkas metadata Next.js (opengraph-image, sitemap, robots, ikon) dilayani
-- di segmen URL teratas -- satu ruang nama dengan /[username]. Tanpa ini,
-- merchant bisa mengklaim "opengraph-image" dan halaman booking-nya tertutup
-- gambar pratinjau situs.
--
-- `sitemap.xml` dan `robots.txt` sudah mustahil diklaim karena titik tidak
-- lolos merchants_username_format, tapi bentuk tanpa ekstensinya tetap
-- dicadangkan supaya tidak pernah membingungkan.
-- ===========================================================================

insert into public.reserved_usernames (name) values
  ('opengraph-image'), ('twitter-image'), ('icon'), ('apple-icon'),
  ('sitemap'), ('robots'), ('manifest'), ('favicon')
on conflict (name) do nothing;
