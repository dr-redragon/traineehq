-- Index every foreign key that had no covering index.
--
-- From the performance advisor (runbook 6.2), which had never been read. All 22
-- were confirmed independently against pg_constraint/pg_index rather than taken
-- on the advisor's word, checking that no existing index already leads with the
-- key's columns.
--
-- An unindexed foreign key costs twice. Joining or filtering by it is a
-- sequential scan, and — less obviously — every DELETE or UPDATE of a *parent*
-- row must scan the whole child table to enforce the constraint. That is why
-- `resources_added_by` matters here: deleting a user is now a real operation
-- (see the delete-account function), and each ON DELETE SET NULL back-reference
-- would otherwise scan its entire table.
--
-- These are cheap: the tables are small today, so this is the moment to add
-- them — before there is enough data for the scans to hurt and enough traffic
-- for the lock to matter.

create index if not exists access_requests_deanery_id_idx on public.access_requests (deanery_id);
create index if not exists access_requests_reviewed_by_idx on public.access_requests (reviewed_by);
create index if not exists access_requests_specialty_id_idx on public.access_requests (specialty_id);
create index if not exists announcements_created_by_idx on public.announcements (created_by);
create index if not exists bookmarks_resource_id_idx on public.bookmarks (resource_id);
create index if not exists contacts_deanery_id_idx on public.contacts (deanery_id);
create index if not exists discussion_comments_author_id_idx on public.discussion_comments (author_id);
create index if not exists discussion_comments_parent_id_idx on public.discussion_comments (parent_id);
create index if not exists discussions_author_id_idx on public.discussions (author_id);
create index if not exists facilitator_specialties_specialty_id_idx on public.facilitator_specialties (specialty_id);
create index if not exists profiles_specialty_id_idx on public.profiles (specialty_id);
create index if not exists register_access_requests_decided_by_idx on public.register_access_requests (decided_by);
create index if not exists register_members_granted_by_idx on public.register_members (granted_by);
create index if not exists register_stores_updated_by_idx on public.register_stores (updated_by);
create index if not exists registers_created_by_idx on public.registers (created_by);
create index if not exists registers_specialty_id_idx on public.registers (specialty_id);
create index if not exists resources_added_by_idx on public.resources (added_by);
create index if not exists specialty_notices_author_id_idx on public.specialty_notices (author_id);
create index if not exists starred_contacts_contact_id_idx on public.starred_contacts (contact_id);
create index if not exists trainee_specialties_specialty_id_idx on public.trainee_specialties (specialty_id);
create index if not exists user_roles_deanery_id_idx on public.user_roles (deanery_id);
create index if not exists watched_discussions_discussion_id_idx on public.watched_discussions (discussion_id);

-- NOT DONE HERE, deliberately, though the advisor also raises them:
--
--   * 13 "unused index" findings. Every index on this project is unused,
--     because the application has no users yet. Dropping them would be reading
--     "nobody has run the app" as "nobody needs this". Re-read after a real
--     term of traffic, not before.
--
--   * 16 "multiple permissive policies". Merging two permissive policies into
--     one changes what the authorisation boundary permits, and RLS is the only
--     authorisation boundary this application has. Not worth the risk to save a
--     policy evaluation on tables holding tens of rows.
