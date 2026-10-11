-- Close the two ways an anonymous sign-in link reached further than one
-- person signing themselves in.
--
-- 1. A TYPED ADDRESS NO LONGER REPLACES A STORED ONE.
--
--    register_resolve_trainee_email() wrote whatever address the sign-in form
--    sent over the trainee's address on the roster. Anyone holding a session
--    link — a QR code projected in a lecture theatre — could pick any name from
--    the public roster, type their own address, and from then on that trainee's
--    certificates and chaser emails went to them. The address on file is now
--    only ever filled when it is empty; changing an existing one is an
--    organiser's edit, made through save_register() like every other.
--
--    The function's other duty is unchanged: with no typed address it returns
--    the one on file, for the attendee row. register-api no longer echoes that
--    row's address back to the anonymous caller, which is what made the
--    "returns the one on file" branch an address lookup for anybody with a link.
--
-- 2. register_record_checkin() IS NO LONGER CALLABLE FROM A BROWSER.
--
--    It was granted to anon and authenticated, so a link holder could call it
--    over /rest/v1/rpc directly and mark any trainee present on any day,
--    skipping the edge function's checks (including the new sign-in window).
--    Nothing in the app calls it that way: register-api calls it under the
--    service role, and so does register_enrol_trainee(), as definer.

begin;

create or replace function public.register_resolve_trainee_email(
  _session_id uuid,
  _trainee_id text,
  _email      text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _register  uuid;
  _existing  text;
  _index     integer;
  _new_email text := nullif(btrim(lower(coalesce(_email, ''))), '');
begin
  select s.register_id into _register
    from public.register_sessions s where s.id = _session_id;

  if _register is null or _trainee_id is null then
    return _new_email;
  end if;

  select i, nullif(btrim(coalesce(t->>'email', '')), '') into _index, _existing
    from public.register_stores st,
         lateral jsonb_array_elements(st.data->'trainees') with ordinality as arr(t, i)
   where st.register_id = _register
     and t->>'id' = _trainee_id
   limit 1;

  -- What is on file stands. A sign-in form is not where an address changes.
  if _existing is not null then
    return _existing;
  end if;

  if _new_email is not null and _index is not null then
    update public.register_stores
       set data = jsonb_set(data, array['trainees', (_index - 1)::text, 'email'],
                            to_jsonb(_new_email), true),
           updated_at = now()
     where register_id = _register;
  end if;

  return _new_email;
end;
$$;

revoke all on function public.register_resolve_trainee_email(uuid, text, text)
  from public, anon, authenticated;

revoke all on function public.register_record_checkin(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.register_record_checkin(uuid, text, text) to service_role;

commit;
