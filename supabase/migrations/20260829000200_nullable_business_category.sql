-- ===========================================================================
-- business_category pada merchant_profiles menjadi NULLABLE.
--
-- Sebelumnya, merchant lama (tanpa baris merchant_profiles sama sekali) yang
-- menekan "Nanti saja" dipaksa mendapat business_category = 'LAINNYA'
-- semata-mata supaya memenuhi NOT NULL -- padahal LAINNYA adalah jawaban SAH
-- yang bisa dipilih sendiri oleh merchant yang usahanya memang tidak masuk
-- kategori lain. Akibatnya baris "menolak menjawab" dan baris "sungguh-
-- sungguh menjawab LAINNYA lalu melewati sisanya" identik persis -- kolom
-- sama, NULL sama, optional_skipped_at sama -- tidak ada satu pun yang
-- membedakan keduanya. Analisis demografi jenis usaha yang memakai Booka
-- adalah salah satu dari empat tujuan fitur kuesioner ini; sentinel itu
-- diam-diam menggembungkan kategori LAINNYA dengan merchant yang tidak
-- pernah benar-benar menjawab, mencemari angka itu.
--
-- Perbaikannya: business_category boleh NULL, dan NULL di sini punya arti
-- eksplisit -- "ditawari kuesioner, memilih tidak menjawab" -- bukan jawaban
-- apa pun, apalagi LAINNYA. Constraint di bawah menjaga arah sebaliknya:
-- begitu ADA jawaban kuesioner apa pun tersimpan (optional_answered_at
-- terisi, atau salah satu dari team_size/province/current_channels/goals/
-- acquisition_source/business_type_slug terisi), business_category WAJIB
-- ikut terisi -- baris "sudah menjawab tapi bidang usahanya tidak diketahui"
-- tidak boleh ada. optional_skipped_at SENGAJA TIDAK ikut dalam daftar
-- pemicu itu: dialah penanda dismissal yang sah, kasus utama yang membuat
-- perubahan ini diperlukan -- baris dismissal murni (hanya merchant_id +
-- optional_skipped_at, semua yang lain NULL) harus tetap bisa punya
-- business_category NULL tanpa ditolak constraint ini.
--
-- Spesifikasi: docs/superpowers/specs/2026-08-29-onboarding-kuesioner-design.md
-- ===========================================================================

alter table public.merchant_profiles
  alter column business_category drop not null;

alter table public.merchant_profiles
  add constraint merchant_profiles_category_required_with_answers check (
    business_category is not null
    or (
      optional_answered_at is null
      and team_size is null
      and province is null
      and current_channels is null
      and goals is null
      and acquisition_source is null
      and business_type_slug is null
    )
  );

notify pgrst, 'reload schema';
