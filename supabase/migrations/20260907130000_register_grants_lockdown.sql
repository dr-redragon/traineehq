-- ============================================================================
-- Close the grants Supabase hands out by default
--
-- A Supabase project ships with
--
--     alter default privileges in schema public
--       grant all on tables to anon, authenticated, service_role;
--
-- so every table created afterwards is granted to both browser roles unless a
-- migration says otherwise. The three register migrations each granted the
-- privileges they wanted and said "anon gets nothing at all here" — but granting
-- SELECT to `authenticated` does not take away the ALL that the default already
-- handed to both roles. On the live project anon and authenticated held
-- select/insert/update/delete on all eight register tables.
--
-- NOTHING WAS EXPOSED. Row-level security is enabled and forced on every one of
-- them, and none has a policy for anon or for the write paths, so a browser got
-- zero rows and changed zero rows. But the whole design rests on two layers —
-- PostgREST checks grants before RLS — and only one was doing any work. In
-- particular `save_register()`'s version guard was documented as impossible to
-- sidestep, and it was, only because RLS refused the direct UPDATE rather than
-- because the grant was absent.
--
-- The one privilege that WAS correctly absent is register_members.UPDATE, which
-- 20260907110000 revoked by name. That is the shape of the mistake: only what
-- was explicitly revoked was actually closed.
--
-- This revokes everything from both roles on all eight tables and re-grants
-- exactly what each needs, declaratively, so the grant table can be read as the
-- intent rather than as the residue of a default.
--
-- The test stubs now reproduce Supabase's default privileges too. Without that
-- the assertions passed against a database nothing had granted anything on,
-- proving the fixture rather than the migration.
-- ============================================================================

begin;

revoke all on public.registers                from anon, authenticated;
revoke all on public.register_members         from anon, authenticated;
revoke all on public.register_access_requests from anon, authenticated;
revoke all on public.register_stores          from anon, authenticated;
revoke all on public.register_sessions        from anon, authenticated;
revoke all on public.register_attendees       from anon, authenticated;
revoke all on public.register_feedback        from anon, authenticated;
revoke all on public.register_forms           from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Exactly what each role needs, and nothing beyond it.
--
-- anon appears nowhere: every anonymous path into a register goes through a
-- security-definer function keyed on a session id.
-- ----------------------------------------------------------------------------

-- The directory is browsable by anyone signed in — you cannot ask to join a
-- register you cannot see exists. Owners update and delete their own, gated by
-- policy.
grant select, update, delete on public.registers to authenticated;

-- Members read the membership of their registers and admit others; promoting,
-- demoting and removing go through RPCs, so no update or delete.
grant select, insert on public.register_members to authenticated;

-- Requests are raised and decided by RPC; a person may withdraw their own.
grant select, delete on public.register_access_requests to authenticated;

-- The register itself is read directly and written only by save_register(),
-- which is what makes the version guard unavoidable rather than merely
-- unattractive.
grant select on public.register_stores to authenticated;

-- The live teaching day is read by members and written by the edge function
-- under the service role, which checks membership itself.
grant select on public.register_sessions  to authenticated;
grant select on public.register_attendees to authenticated;
grant select on public.register_feedback  to authenticated;
grant select on public.register_forms     to authenticated;

-- ----------------------------------------------------------------------------
-- And stop the default from re-arming for anything added later.
--
-- The baseline already did this for functions. Tables were left out, which is
-- how eight of them arrived pre-granted. A table added after this line starts
-- private, and its migration has to say what it wants.
-- ----------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

commit;
