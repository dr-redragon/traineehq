-- Let each register put its own badge on its certificates.
--
-- The certificate design is ported from the standalone ENT register, which
-- carried one logo for one programme and took it from an environment variable.
-- With many registers that cannot work: the badge belongs to the register, so
-- it is stored against the register and uploaded by the people who run it.
--
-- A logo is organisational branding — a deanery crest, a society badge — not
-- personal data, so the bucket is public-read. Writing is another matter, and
-- is restricted to a register's OWNERS: an editor records attendance, an owner
-- decides what the register puts its name to.

alter table public.registers
  add column if not exists certificate_logo_path text;

comment on column public.registers.certificate_logo_path is
  'Object path in the register-logos bucket, or null for a certificate with no badge.';

-- ------------------------------------------------------------------ bucket --
-- PNG and JPEG only: pdf-lib embeds those two and nothing else, so accepting an
-- SVG here would mean accepting a file that silently fails to appear on the
-- certificate later. 2 MB is generous for a logo and small enough that a
-- mistakenly chosen photograph is refused at the door.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'register-logos', 'register-logos', true, 2097152,
  array['image/png', 'image/jpeg']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Paths are '<register_id>/<uuid>.<ext>', so the first folder segment is the
-- register whose owners may write there.
drop policy if exists "register logos are readable" on storage.objects;
create policy "register logos are readable"
  on storage.objects for select
  using (bucket_id = 'register-logos');

drop policy if exists "register owners upload logos" on storage.objects;
create policy "register owners upload logos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'register-logos'
    and public.is_register_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "register owners replace logos" on storage.objects;
create policy "register owners replace logos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'register-logos'
    and public.is_register_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "register owners remove logos" on storage.objects;
create policy "register owners remove logos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'register-logos'
    and public.is_register_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

-- --------------------------------------------------------------- directory --
-- The directory is where the app learns everything about a register, so the
-- logo and "am I an owner" belong on it rather than in a second round trip.
-- Adding columns to a RETURNS TABLE needs a drop; the grants are restored
-- below to match restrict_security_definer_function_execute.
drop function if exists public.register_directory();

create function public.register_directory()
returns table (
  id uuid,
  name text,
  slug text,
  deanery_name text,
  specialty_name text,
  member_count bigint,
  i_am_member boolean,
  i_am_owner boolean,
  certificate_logo_path text,
  my_request request_status
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select r.id, r.name, r.slug, d.name, s.name,
    (select count(*) from public.register_members m where m.register_id = r.id),
    public.is_register_member(auth.uid(), r.id),
    public.is_register_owner(auth.uid(), r.id),
    r.certificate_logo_path,
    (select ar.status from public.register_access_requests ar
      where ar.register_id = r.id and ar.user_id = auth.uid()
      order by ar.created_at desc limit 1)
  from public.registers r
  join public.specialties s on s.id = r.specialty_id
  join public.deaneries   d on d.id = r.deanery_id
  where r.is_active
  order by d.name, s.name;
$function$;

revoke all on function public.register_directory() from public, anon;
grant execute on function public.register_directory() to authenticated;
