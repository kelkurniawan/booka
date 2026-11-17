-- ===========================================================================
-- F9: progres panduan merchant.
--
-- Satu baris per merchant, dibuat malas oleh RPC tulis. Hanya langkah yang
-- tidak bisa dibuktikan data (PAGE, SHARE) dan status UI (tur yang sudah
-- dilihat, checklist disembunyikan) yang disimpan; langkah lain dihitung ulang
-- dari data lewat onboarding_state().
-- ===========================================================================

create table public.merchant_onboarding_progress (
  merchant_id uuid primary key references public.merchants (id) on delete cascade,
  steps_completed text[] not null default '{}',
  tours_seen text[] not null default '{}',
  checklist_dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint merchant_onboarding_progress_steps
    check (steps_completed <@ array['PAGE', 'SHARE']::text[]),
  constraint merchant_onboarding_progress_tours
    check (tours_seen <@ array['today', 'bookings', 'analytics', 'services', 'availability',
      'floor_plan', 'staff', 'payments', 'appearance', 'promo', 'domain', 'billing', 'settings']::text[])
);

alter table public.merchant_onboarding_progress enable row level security;

-- Supabase memberi ALL secara default; cabut dulu, lalu grant per kolom.
-- Tanpa grant tulis: penulisan hanya lewat save_onboarding_progress.
revoke all on table public.merchant_onboarding_progress from anon, authenticated;
grant select (merchant_id, steps_completed, tours_seen, checklist_dismissed_at, created_at, updated_at)
  on public.merchant_onboarding_progress to authenticated;

create policy merchant_onboarding_progress_select_own
  on public.merchant_onboarding_progress
  for select to authenticated
  using ((select auth.uid()) = merchant_id);

create trigger merchant_onboarding_progress_set_updated_at
  before update on public.merchant_onboarding_progress
  for each row execute function public.set_updated_at();

-- --- Tulis progres -----------------------------------------------------------
-- Argumen null tidak mengubah kolomnya. Nilai di luar daftar ditolak constraint.
create function public.save_onboarding_progress(
  p_step text default null,
  p_tour text default null,
  p_dismissed boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant uuid := (select auth.uid());
begin
  if v_merchant is null then
    raise exception 'Harus masuk dulu' using errcode = '42501';
  end if;

  insert into public.merchant_onboarding_progress as p
    (merchant_id, steps_completed, tours_seen, checklist_dismissed_at)
  values (
    v_merchant,
    case when p_step is null then '{}'::text[] else array[p_step] end,
    case when p_tour is null then '{}'::text[] else array[p_tour] end,
    case when p_dismissed is true then now() end
  )
  on conflict (merchant_id) do update set
    steps_completed = case
      when p_step is null or p_step = any (p.steps_completed) then p.steps_completed
      else p.steps_completed || p_step end,
    tours_seen = case
      when p_tour is null or p_tour = any (p.tours_seen) then p.tours_seen
      else p.tours_seen || p_tour end,
    checklist_dismissed_at = case
      when p_dismissed is null then p.checklist_dismissed_at
      when p_dismissed then coalesce(p.checklist_dismissed_at, now())
      else null end;
end;
$$;

revoke execute on function public.save_onboarding_progress(text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.save_onboarding_progress(text, text, boolean) to authenticated;

-- --- Baca fakta kesiapan + progres -------------------------------------------
-- security invoker: RLS merchant_id berlaku. Aturan PAYMENT dihitung di TypeScript.
create function public.onboarding_state()
returns table (
  has_service boolean,
  has_hours boolean,
  has_active_payment boolean,
  needs_online_payment boolean,
  page_customized boolean,
  has_online_booking boolean,
  steps_completed text[],
  tours_seen text[],
  checklist_dismissed_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    exists (select 1 from public.services s
            where s.merchant_id = u.id and s.is_active),
    exists (select 1 from public.availability a where a.merchant_id = u.id)
      or exists (select 1 from public.staff_availability sa where sa.merchant_id = u.id),
    exists (select 1 from public.payment_connections pc
            where pc.merchant_id = u.id and pc.status = 'ACTIVE'),
    exists (select 1 from public.services s
            where s.merchant_id = u.id and s.is_active
              and s.payment_mode <> 'ON_SITE' and s.price > 0),
    exists (select 1 from public.merchant_themes t where t.merchant_id = u.id)
      or exists (select 1 from public.merchants m
                 where m.id = u.id and m.avatar_url is not null),
    exists (select 1 from public.bookings b
            where b.merchant_id = u.id and b.source = 'ONLINE'),
    coalesce(p.steps_completed, '{}'::text[]),
    coalesce(p.tours_seen, '{}'::text[]),
    p.checklist_dismissed_at
  from (select (select auth.uid()) as id) u
  left join public.merchant_onboarding_progress p on p.merchant_id = u.id
  where u.id is not null;
$$;

revoke execute on function public.onboarding_state() from public, anon, authenticated;
grant execute on function public.onboarding_state() to authenticated;

notify pgrst, 'reload schema';
