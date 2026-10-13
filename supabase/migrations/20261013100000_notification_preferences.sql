-- What an administrator wants to be emailed about.
--
-- Every admin of a request's deanery, every global admin and every super admin
-- was emailed about every account request and every specialty request. For a
-- super admin that is the whole platform's queue in their inbox. This lets each
-- person turn each kind off, and lets them narrow it to some deaneries.
--
-- No row means the defaults: everything on, every deanery. So nobody stops
-- getting an email they relied on until they choose to.
--
-- access-request-email reads this with the service role when it picks who to
-- notify. People only ever read and write their own row.

begin;

create table if not exists public.notification_preferences (
  user_id                    uuid primary key references auth.users(id) on delete cascade,
  account_requests           boolean not null default true,
  register_account_requests  boolean not null default true,
  specialty_requests         boolean not null default true,
  -- null = every deanery the person reviews; otherwise only requests for these.
  deanery_ids                uuid[],
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;

drop policy if exists "owner reads" on public.notification_preferences;
create policy "owner reads" on public.notification_preferences
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "owner writes" on public.notification_preferences;
create policy "owner writes" on public.notification_preferences
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.notification_preferences from anon;
grant select, insert, update, delete on public.notification_preferences to authenticated;

drop trigger if exists set_updated_at on public.notification_preferences;
create trigger set_updated_at before update on public.notification_preferences
  for each row execute function public.update_updated_at_column();

commit;
