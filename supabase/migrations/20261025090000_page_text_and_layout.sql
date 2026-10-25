-- Text on specialty pages, folders as subpages, and a choice of layout.
--
-- The deanery's own pages are text first — an overview, what ARCP needs, who
-- to ask — with the documents hung off them. A specialty here was files only:
-- a section held folders and folders held files, and anything a trainee needed
-- to *read* had to be a PDF in the list. This lets a section and any folder
-- carry a page of text of its own, and lets a folder stand as a subpage.
--
-- Nothing is copied or restructured. A subpage *is* a folder, so the classic
-- layout (sections down the side, folders in the drive) and the pages layout
-- (a tree of pages, each with its text and its files) are two ways of drawing
-- the same rows, and a specialty can be switched between them and back without
-- losing anything.
--
-- Every column is nullable or defaulted to what each row already is: no text,
-- not a page, the classic layout. So applying this changes nothing anyone sees
-- until someone writes text or switches a specialty over.
--
-- No policy changes: subsections are written by "managers write subsections",
-- folders through can_manage_resource(), specialties by "admins manage
-- specialties" — and a new column on a row is covered by the row's policy.

begin;

alter table public.subsections
  add column if not exists body text,
  add column if not exists body_updated_at timestamptz;

alter table public.resource_folders
  add column if not exists body text,
  add column if not exists body_updated_at timestamptz,
  add column if not exists is_page boolean not null default false;

-- Long enough for the longest deanery page several times over; short enough
-- that nobody pastes a whole handbook in place of uploading it.
alter table public.subsections
  drop constraint if exists subsections_body_length;
alter table public.subsections
  add constraint subsections_body_length check (body is null or char_length(body) <= 50000);

alter table public.resource_folders
  drop constraint if exists resource_folders_body_length;
alter table public.resource_folders
  add constraint resource_folders_body_length check (body is null or char_length(body) <= 50000);

alter table public.specialties
  add column if not exists page_layout text not null default 'classic';

alter table public.specialties
  drop constraint if exists specialties_page_layout_check;
alter table public.specialties
  add constraint specialties_page_layout_check check (page_layout in ('classic', 'pages'));

comment on column public.subsections.body is
  'Text shown at the top of the section, in the page-text format (see src/lib/pageText.ts).';
comment on column public.resource_folders.body is
  'Text shown at the top of the folder, in the page-text format (see src/lib/pageText.ts).';
comment on column public.resource_folders.is_page is
  'Listed as a subpage in the pages layout rather than as a folder among the files.';
comment on column public.specialties.page_layout is
  'classic: sections and a file drive. pages: a tree of pages with text and files. Same data either way.';

commit;
