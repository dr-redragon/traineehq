-- Only a register's owners decide who may read it.
--
-- 20260907110000 made admitting somebody "any member": any editor could add
-- any account as an editor, and approve any join request. Editors are often
-- trainees themselves, and admission is transitive — every person admitted can
-- admit the next — so the circle of people who can read a register's absence,
-- sickness and leave records had no owner-shaped edge at all. Combined with
-- get_profile_display_names() (every user id on the platform) and
-- register_people() (names and addresses of everyone connected to a
-- register), an editor could add any user and then read their address.
--
-- Admitting is now an owner's act, by every route: a direct insert into
-- register_members, approving a request, and the register-invite function
-- (which checks the same rule in code, since it runs as the service role).
-- Editors keep everything an editor does: recording attendance, running the
-- teaching day, sending feedback links and chasers.
--
-- ALTER rather than DROP/CREATE: on the live project DROP and CREATE POLICY
-- from a migration hang, while ALTER is immediate.

begin;

do $$
begin
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'register_members'
                and policyname = 'members admit others') then
    alter policy "members admit others" on public.register_members
      rename to "owners admit others";
  end if;
end $$;

alter policy "owners admit others" on public.register_members
  with check (public.is_register_owner(auth.uid(), register_id));

create or replace function public.decide_register_access(
  _request_id uuid,
  _approve    boolean,
  _note       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
  _req    public.register_access_requests;
begin
  if _caller is null then
    raise exception 'You must be signed in to decide a request';
  end if;

  select * into _req from public.register_access_requests where id = _request_id;

  if _req.id is null then
    raise exception 'That request no longer exists';
  end if;

  if _req.status <> 'pending' then
    raise exception 'That request has already been decided';
  end if;

  if not public.is_register_owner(_caller, _req.register_id) then
    raise exception 'Only an owner of that register can decide who joins it';
  end if;

  -- Without this, anyone who could see their own pending row could approve it.
  if _req.user_id = _caller then
    raise exception 'You cannot approve your own request for access';
  end if;

  if _approve then
    insert into public.register_members (register_id, user_id, role, granted_by)
    values (_req.register_id, _req.user_id, 'editor', _caller)
    on conflict (register_id, user_id) do nothing;
  end if;

  update public.register_access_requests
     set status        = case when _approve then 'approved' else 'rejected' end::public.request_status,
         decided_by    = _caller,
         decided_at    = now(),
         decision_note = nullif(btrim(_note), '')
   where id = _request_id;
end;
$$;

revoke execute on function public.decide_register_access(uuid, boolean, text) from public, anon;
grant execute on function public.decide_register_access(uuid, boolean, text) to authenticated;

commit;
