-- The seed migration applied to a project where its operator account does not
-- exist. It must apply cleanly, grant nothing, and leave the project alone.
--
-- Run at the end of scenario A in scripts/verify-register-schema.sh, against the
-- database the tenancy assertions have already populated — so "changed nothing"
-- is checked against a project that already holds a register.

\set ON_ERROR_STOP on

do $$
begin
  if (select count(*) from public.registers) <> 1 then
    raise exception 'FAIL: the seed migration changed a project it should have skipped';
  end if;

  if (select slug from public.registers) <> 'mersey-ent' then
    raise exception 'FAIL: the existing register was replaced';
  end if;

  if exists (
    select 1
      from public.user_roles ur
      join auth.users u on u.id = ur.user_id
     where lower(u.email) = 'mabdelaziz@outlook.com'
  ) then
    raise exception 'FAIL: a role was granted to an account that does not exist';
  end if;

  raise notice 'ok     seed migration no-ops without its operator account';
end $$;
