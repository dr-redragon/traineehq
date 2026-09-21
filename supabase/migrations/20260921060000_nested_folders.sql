-- Let folders hold folders.
--
-- `resource_folders` had no parent, so a folder belonged to a section and that
-- was the end of it: one level, no deeper. Every file in the deanery lives in
-- one of six such folders, and the moment a folder wants a folder — a year
-- inside a curriculum, a sitting inside an exam — there was nowhere to put it.
--
-- The column is nullable and null means "directly in the section", which is
-- exactly what every existing row already is. So this migration changes no
-- data and the six folders carry on as roots.

alter table public.resource_folders
  add column if not exists parent_folder_id uuid
    references public.resource_folders(id) on delete cascade;

comment on column public.resource_folders.parent_folder_id is
  'The folder this one sits inside, or null for a folder directly in the section.';

-- Every read walks children-of-a-parent, which without this is a sequential
-- scan per level.
create index if not exists resource_folders_parent_idx
  on public.resource_folders (parent_folder_id);

-- A folder cannot be its own ancestor.
--
-- The client refuses these moves already, but a constraint that only exists in
-- the client is a suggestion. A cycle does not lose rows; it strands them —
-- the branch is unreachable from the section root, so nothing can list it and
-- nothing can move it back, while a breadcrumb walking up from inside it never
-- terminates. That is a tangle to unpick by hand in SQL, so it is worth
-- refusing at the point of writing.
create or replace function public.resource_folders_no_cycles()
returns trigger
language plpgsql
as $$
declare
  cursor_id uuid := new.parent_folder_id;
  hops int := 0;
begin
  if new.parent_folder_id is null then
    return new;
  end if;

  if new.parent_folder_id = new.id then
    raise exception 'A folder cannot be inside itself';
  end if;

  -- Walk up from the proposed parent. Reaching the row being written means
  -- the move would close a loop. The hop limit is a backstop in case a cycle
  -- predates this trigger, so the guard itself cannot hang.
  while cursor_id is not null and hops < 64 loop
    if cursor_id = new.id then
      raise exception 'A folder cannot be moved inside one of its own subfolders';
    end if;
    select parent_folder_id into cursor_id
      from public.resource_folders where id = cursor_id;
    hops := hops + 1;
  end loop;

  return new;
end;
$$;

drop trigger if exists resource_folders_no_cycles on public.resource_folders;
create trigger resource_folders_no_cycles
  before insert or update of parent_folder_id on public.resource_folders
  for each row execute function public.resource_folders_no_cycles();

-- A child folder belongs to the same section as its parent. Without this a
-- subtree could straddle two sections, and the section a file appears under
-- would depend on which way you walked to it.
create or replace function public.resource_folders_same_subsection()
returns trigger
language plpgsql
as $$
declare
  parent_subsection uuid;
begin
  if new.parent_folder_id is null then
    return new;
  end if;
  select subsection_id into parent_subsection
    from public.resource_folders where id = new.parent_folder_id;
  if parent_subsection is not null and parent_subsection <> new.subsection_id then
    raise exception 'A subfolder must stay in the same section as the folder that holds it';
  end if;
  return new;
end;
$$;

drop trigger if exists resource_folders_same_subsection on public.resource_folders;
create trigger resource_folders_same_subsection
  before insert or update of parent_folder_id, subsection_id on public.resource_folders
  for each row execute function public.resource_folders_same_subsection();
