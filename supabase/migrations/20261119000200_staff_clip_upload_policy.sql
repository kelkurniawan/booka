-- F7: perketat unggahan klip mentah. Policy lama hanya mencocokkan folder
-- pertama, sehingga merchant paket apa pun bisa mengisi bucket privat dengan
-- berkas yang tidak pernah diproses. Kini unggahan hanya boleh untuk merchant
-- Studio, ke folder staf miliknya sendiri, dengan nama dan ekstensi yang sama
-- dengan yang diterima /api/staff/clip (isClipUploadPath).

drop policy if exists "staff_clip_uploads_insert_own" on storage.objects;

create policy "staff_clip_uploads_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'staff-clip-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9-]+\.(gif|mp4|webm|mov)$'
    and exists (
      select 1 from public.merchants m
      where m.id = (select auth.uid()) and m.subscription_tier = 'STUDIO'
    )
    and exists (
      select 1 from public.staff s
      where s.merchant_id = (select auth.uid())
        -- objects.name ditulis lengkap: di dalam subquery ini `name` akan merujuk staff.name.
        and s.id::text = (storage.foldername(objects.name))[2]
    )
  );

notify pgrst, 'reload schema';
