-- Give subheadings somewhere to live.
--
-- A subheading was never a thing you could create — it was a string written on
-- resources.subheading, and the browser inferred the list by reading the
-- distinct values back. "Add subheading" only pushed a name into React state,
-- so a subheading with nothing in it yet vanished on the next refresh. The one
-- moment you most want to make an empty section is before you have filled it.
--
-- The string on resources stays as it is: it is what the drag-and-drop code,
-- the move dialog and the edit dialog all write, and changing that would be a
-- much larger change than the bug warrants. This table is the *list* of
-- subheadings a subsection has, which is the part that had nowhere to persist.
--
-- Access mirrors resource_folders exactly, because a subheading is the same
-- kind of thing: read follows access to the specialty, write belongs to whoever
-- may manage the subsection's resources.

create table if not exists public.resource_subheadings (
  id             uuid primary key default gen_random_uuid(),
  subsection_id  uuid not null references public.subsections(id) on delete cascade,
  name           text not null,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  -- Two subheadings of the same name in one subsection would be two headings
  -- the app could never tell apart: resources name them by string.
  constraint resource_subheadings_name_not_blank check (btrim(name) <> ''),
  unique (subsection_id, name)
);

create index if not exists resource_subheadings_subsection_idx
  on public.resource_subheadings (subsection_id);

alter table public.resource_subheadings enable row level security;
alter table public.resource_subheadings force row level security;

drop policy if exists "subheadings follow subsection access" on public.resource_subheadings;
create policy "subheadings follow subsection access"
  on public.resource_subheadings for select
  to authenticated
  using (exists (
    select 1 from public.subsections s
    where s.id = resource_subheadings.subsection_id
      and public.can_access_specialty(auth.uid(), s.specialty_id)
  ));

drop policy if exists "managers write subheadings" on public.resource_subheadings;
create policy "managers write subheadings"
  on public.resource_subheadings for all
  to authenticated
  using (public.can_manage_resource(auth.uid(), subsection_id))
  with check (public.can_manage_resource(auth.uid(), subsection_id));

grant select, insert, update, delete on public.resource_subheadings to authenticated;

-- Backfill, so the table is the complete list from the first read rather than
-- something that only knows about subheadings made after today. Everything
-- already named on a resource or a folder becomes a row.
insert into public.resource_subheadings (subsection_id, name)
select distinct subsection_id, subheading
  from (
    select subsection_id, subheading from public.resources
     where subheading is not null and btrim(subheading) <> ''
    union
    select subsection_id, subheading from public.resource_folders
     where subheading is not null and btrim(subheading) <> ''
  ) named
on conflict (subsection_id, name) do nothing;
