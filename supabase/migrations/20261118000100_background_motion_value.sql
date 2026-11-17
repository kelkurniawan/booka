-- Nilai enum baru tidak bisa dipakai di transaksi yang menambahkannya, jadi
-- berkas ini sendiri; kolom yang memakainya ada di 20261118000200.
alter type public.background_style add value if not exists 'MOTION';

notify pgrst, 'reload schema';
