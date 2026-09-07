-- ============================================================================
-- Stage 5: administering access to a register
--
-- Three changes, one of them a reversal.
--
-- 1. THE INVITES TABLE IS DROPPED. 20260907090000 created register_invites with
--    a hashed token, for a click-to-accept flow. Building the rest of the stage
--    made it clear that was ceremony without a purpose: this project already
--    invites people to TraineeHQ by creating their account and assigning the
--    role outright (supabase/functions/invite-user), and being added to a
--    register you help run is not a thing anyone needs to consent to twice.
--
--    The direct add gives the same audit trail — register_members.granted_by
--    records who added whom — and anyone added can leave on their own, since
--    remove_register_member() lets a member remove themselves. Dropping the
--    table also removes the token_hash surface entirely rather than leaving an
--    unused credential store in the schema. The table has never held a row: it
--    was created in the same unreleased branch.
--
-- 2. Member roles change through an RPC, not a policy. The RLS policy added in
--    20260907090000 would let the only owner demote themselves to editor,
--    leaving a register nobody can administer — the same trap
--    remove_register_member() already refuses, arrived at by a different route.
--
-- 3. Admitting someone becomes one rule. 20260907090000 let any member approve a
--    join request but only an owner add someone directly — two answers to the
--    same question, which is how a codebase ends up with a rule nobody can state.
--    Both are now "any member". Promoting, demoting and removing stay with
--    owners.
--
-- 4. A narrow directory of the people connected to one register, so the access
--    screen can show names and addresses instead of raw user ids.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. The invites table
-- ----------------------------------------------------------------------------
drop table if exists public.register_invites;

-- ----------------------------------------------------------------------------
-- 2. Role changes
-- ----------------------------------------------------------------------------

-- Direct updates are withdrawn: the last-owner rule cannot be expressed as a
-- row predicate, because it depends on how many other rows exist.
drop policy if exists "owners change member roles" on public.register_members;
revoke update on public.register_members from authenticated;

create or replace function public.set_register_member_role(
  _register_id uuid,
  _user_id     uuid,
  _role        public.register_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller      uuid := auth.uid();
  _current     public.register_role;
  _owner_count integer;
begin
  if _caller is null then
    raise exception 'You must be signed in';
  end if;

  if not public.is_register_owner(_caller, _register_id) then
    raise exception 'Only an owner can change what someone can do in this register';
  end if;

  select role into _current
    from public.register_members
   where register_id = _register_id and user_id = _user_id;

  if _current is null then
    raise exception 'That person is not a member of this register';
  end if;

  if _current = _role then
    return;
  end if;

  -- The mirror of the rule in remove_register_member(): a register with no owner
  -- can never have its membership managed again, and no super_admin can quietly
  -- step in to fix it.
  if _current = 'owner' and _role <> 'owner' then
    select count(*) into _owner_count
      from public.register_members
     where register_id = _register_id and role = 'owner';

    if _owner_count <= 1 then
      raise exception 'This is the register''s only owner'
        using hint = 'Make somebody else an owner first.';
    end if;
  end if;

  update public.register_members
     set role = _role
   where register_id = _register_id and user_id = _user_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Admitting someone
-- ----------------------------------------------------------------------------

-- Any member may admit another person, matching decide_register_access(), which
-- any member may already call. Inviting somebody and approving their request are
-- the same act arrived at from opposite ends; they should not have had different
-- answers.
--
-- The role is constrained here rather than left open: admitting someone straight
-- to owner would be a way around set_register_member_role()'s owner-only rule.
drop policy if exists "owners add members" on public.register_members;
drop policy if exists "members admit others" on public.register_members;
create policy "members admit others"
  on public.register_members for insert to authenticated
  with check (
    public.is_register_member(auth.uid(), register_id)
    and (role = 'editor' or public.is_register_owner(auth.uid(), register_id))
  );

-- ----------------------------------------------------------------------------
-- 4. Who is connected to this register
-- ----------------------------------------------------------------------------

-- Names and addresses for the people a register's access screen has to show:
-- its members, and anyone who has asked to join it.
--
-- A security-definer function rather than a policy on `profiles`, because the
-- reader may be an owner with no TraineeHQ admin role, and profiles is readable
-- only by its owner and by admins. This widens nothing else: it answers only for
-- one register, only to a member of that register, and only about people already
-- connected to it.
create or replace function public.register_people(_register_id uuid)
returns table (
  user_id    uuid,
  first_name text,
  last_name  text,
  email      text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, p.first_name, p.last_name, p.email
    from public.profiles p
   where public.is_register_member(auth.uid(), _register_id)
     and (
       exists (
         select 1 from public.register_members m
          where m.register_id = _register_id and m.user_id = p.user_id
       )
       or exists (
         select 1 from public.register_access_requests r
          where r.register_id = _register_id and r.user_id = p.user_id
       )
     );
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
revoke execute on function public.set_register_member_role(uuid, uuid, public.register_role)
  from public, anon;
revoke execute on function public.register_people(uuid) from public, anon;

grant execute on function public.set_register_member_role(uuid, uuid, public.register_role)
  to authenticated;
grant execute on function public.register_people(uuid) to authenticated;

commit;
