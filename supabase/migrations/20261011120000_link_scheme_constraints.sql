-- Only web addresses may be stored where the app will render a link.
--
-- resources.external_url and embed_url are typed in by admins and facilitators
-- and rendered for every reader of the resource — in an iframe src, an href and
-- window.open. A `javascript:` value there ran in this app's origin as soon as
-- the viewer opened, with the reader's session in localStorage: a facilitator
-- could take an admin's session that way. The client now refuses such links
-- (src/lib/safeUrl.ts); these constraints make sure none can be stored, by the
-- app or by anybody calling the API directly.
--
-- file_url holds a storage path ({specialty}/{subsection}/{file}) or, for
-- legacy rows, a full https URL. A value with any other scheme is refused.
--
-- contacts.profile_url and deaneries.logo_url are not rendered as links today,
-- but are written by facilitators and admins respectively; constraining them now
-- keeps the next feature that does render them from inheriting the problem.
--
-- Every live row satisfied these when this was written, so they are created
-- validated. The pattern allows http as well as https because some
-- institutional sites still serve plain http.

begin;

alter table public.resources drop constraint if exists resources_external_url_scheme;
alter table public.resources add constraint resources_external_url_scheme
  check (external_url is null or external_url ~* '^https?://');

alter table public.resources drop constraint if exists resources_embed_url_scheme;
alter table public.resources add constraint resources_embed_url_scheme
  check (embed_url is null or embed_url ~* '^https?://');

-- A storage path has no scheme; anything that does must be http(s).
alter table public.resources drop constraint if exists resources_file_url_scheme;
alter table public.resources add constraint resources_file_url_scheme
  check (file_url is null or file_url !~* '^\s*[a-z][a-z0-9+.-]*:' or file_url ~* '^https?://');

alter table public.contacts drop constraint if exists contacts_profile_url_scheme;
alter table public.contacts add constraint contacts_profile_url_scheme
  check (profile_url is null or profile_url ~* '^https?://');

alter table public.deaneries drop constraint if exists deaneries_logo_url_scheme;
alter table public.deaneries add constraint deaneries_logo_url_scheme
  check (logo_url is null or logo_url ~* '^https?://' or logo_url !~* '^\s*[a-z][a-z0-9+.-]*:');

commit;
