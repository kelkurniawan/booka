-- Kategori usaha Olahraga (booking lapangan). Migration terpisah karena nilai
-- enum baru tidak boleh dipakai di transaksi yang sama dengan penambahannya.
--
-- CHECK merchant_profiles_category_required_with_answers
-- (20260830171027_nullable_business_category.sql) diperiksa ulang: ia hanya
-- menuntut business_category tidak null bila ada jawaban kuesioner, tidak
-- menyebut daftar nilai. Jadi tidak perlu diubah.
alter type public.business_category add value if not exists 'OLAHRAGA';
