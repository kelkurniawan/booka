-- ===========================================================================
-- FAQ halaman publik merchant.
--
-- Terbuka untuk semua paket, bukan fitur Pro: FAQ mengurangi pertanyaan
-- berulang yang masuk ke WhatsApp merchant, dan halaman merchant STARTER
-- adalah halaman yang membawa watermark Booka. Lihat docs/DECISIONS.md.
-- ===========================================================================

create table public.merchant_faqs (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint merchant_faqs_question_length check (
    char_length(trim(question)) between 3 and 200
  ),
  constraint merchant_faqs_answer_length check (
    char_length(trim(answer)) between 1 and 1000
  )
);

create index merchant_faqs_merchant_idx
  on public.merchant_faqs (merchant_id, sort_order);

create trigger merchant_faqs_set_updated_at
  before update on public.merchant_faqs
  for each row execute function public.set_updated_at();

-- Sepuluh pertanyaan sudah lebih panjang dari yang mau dibaca siapa pun di
-- ponsel. Batas ini menjaga halaman, bukan menjaga biaya.
create or replace function public.enforce_faq_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  select count(*) into current_count
  from public.merchant_faqs f
  where f.merchant_id = new.merchant_id;

  if current_count >= 10 then
    raise exception 'Maksimal 10 pertanyaan pada FAQ.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger merchant_faqs_enforce_limit
  before insert on public.merchant_faqs
  for each row execute function public.enforce_faq_limit();

-- --- Hak akses --------------------------------------------------------------
revoke all on public.merchant_faqs from anon, authenticated;

grant select on public.merchant_faqs to anon;
grant select, insert, update, delete on public.merchant_faqs to authenticated;

alter table public.merchant_faqs enable row level security;

create policy "merchant_faqs_public_read"
  on public.merchant_faqs
  for select
  to anon
  using (
    exists (
      select 1
      from public.merchants m
      where m.id = merchant_faqs.merchant_id
        and m.username is not null
    )
  );

create policy "merchant_faqs_read_own"
  on public.merchant_faqs
  for select
  to authenticated
  using ((select auth.uid()) = merchant_id);

create policy "merchant_faqs_insert_own"
  on public.merchant_faqs
  for insert
  to authenticated
  with check ((select auth.uid()) = merchant_id);

create policy "merchant_faqs_update_own"
  on public.merchant_faqs
  for update
  to authenticated
  using ((select auth.uid()) = merchant_id)
  with check ((select auth.uid()) = merchant_id);

create policy "merchant_faqs_delete_own"
  on public.merchant_faqs
  for delete
  to authenticated
  using ((select auth.uid()) = merchant_id);

revoke execute on function public.enforce_faq_limit() from public;
