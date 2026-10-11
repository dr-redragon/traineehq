-- Assertions for 20261011120000_link_scheme_constraints.sql.
--
-- The point: nothing but a web address (or, for file_url, a storage path) can
-- be stored in a column the app renders as a link.

\set ON_ERROR_STOP on

insert into public.deaneries (id, name, short_name, slug)
values ('d0000000-0000-4000-8000-0000000000f6', 'Link Deanery', 'LD', 'link-deanery');
insert into public.specialties (id, deanery_id, name, short_name, slug)
values ('5f000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-0000000000f6', 'ENT', 'ENT', 'ent');
insert into public.subsections (id, specialty_id, name)
values ('5f100000-0000-4000-8000-000000000006', '5f000000-0000-4000-8000-000000000006', 'Links');

do $$
declare _bad text;
begin
  -- Accepted
  insert into public.resources (subsection_id, title, external_url, embed_url, file_url) values
    ('5f100000-0000-4000-8000-000000000006', 'web',  'https://example.org/x', 'http://example.org/e', null),
    ('5f100000-0000-4000-8000-000000000006', 'file', null, null,
     '5f000000-0000-4000-8000-000000000006/5f100000-0000-4000-8000-000000000006/a.pdf'),
    ('5f100000-0000-4000-8000-000000000006', 'legacy', null, null, 'https://x.supabase.co/storage/v1/object/public/resources/a.pdf');

  -- Refused
  foreach _bad in array array[
    'javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)',
    'data:text/html,<script>1</script>', 'vbscript:x', '//evil.example/x'
  ] loop
    begin
      insert into public.resources (subsection_id, title, external_url)
      values ('5f100000-0000-4000-8000-000000000006', 'bad', _bad);
      raise exception 'FAIL 1: external_url accepted %', _bad;
    exception when check_violation then null;
    end;
    begin
      insert into public.resources (subsection_id, title, embed_url)
      values ('5f100000-0000-4000-8000-000000000006', 'bad', _bad);
      raise exception 'FAIL 1: embed_url accepted %', _bad;
    exception when check_violation then null;
    end;
    begin
      insert into public.contacts (name, role, category, organisation, email, profile_url)
      values ('x', 'x', 'tpd', 'x', 'x@example.invalid', _bad);
      raise exception 'FAIL 1: contacts.profile_url accepted %', _bad;
    exception when check_violation then null;
    end;
  end loop;

  foreach _bad in array array['javascript:alert(1)', ' data:text/html,x', 'vbscript:x'] loop
    begin
      insert into public.resources (subsection_id, title, file_url)
      values ('5f100000-0000-4000-8000-000000000006', 'bad', _bad);
      raise exception 'FAIL 1: file_url accepted %', _bad;
    exception when check_violation then null;
    end;
  end loop;

  raise notice 'ok  1  only web addresses and storage paths are stored as links';
end $$;
