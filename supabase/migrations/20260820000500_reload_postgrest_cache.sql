-- ===========================================================================
-- Menyegarkan schema cache PostgREST.
--
-- PostgREST menyimpan bentuk skema di memori dan hanya membacanya ulang saat
-- menerima NOTIFY di kanal `pgrst`. Supabase biasanya memasang event trigger
-- DDL yang mengirimkannya otomatis, tapi di project ini trigger itu tidak
-- menyala: setelah 20260820000100..000400 diterapkan, `merchant_themes`,
-- `service_media`, dan `merchant_faqs` tetap dijawab PGRST205 ("Could not find
-- the table ... in the schema cache") selama lebih dari tiga menit.
--
-- Migration ini mengirim notifikasinya secara eksplisit. Aman dijalankan ulang
-- dan tidak berpengaruh apa-apa di harness docker:test, yang tidak menjalankan
-- PostgREST sama sekali.
--
-- Untuk perubahan skema berikutnya, tambahkan baris yang sama di akhir
-- migration-nya alih-alih membuat migration terpisah seperti ini.
-- ===========================================================================

notify pgrst, 'reload schema';
