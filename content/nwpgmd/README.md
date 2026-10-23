# Content copied from nwpgmd.nhs.uk

TraineeHQ's North West key contacts and ENT documents are copied from the
NHS England – North West site. This folder records where they came from, so a
monthly review can tell what has changed.

- `pages.txt` — the pages the contacts and documents come from.
- `snapshot.json` — those pages as last reviewed (text, links, "Page last
  updated"). Each review replaces it.
- `ent/` — the ENT documents and `manifest.json`, which says which section of
  ENT each goes in. `scripts/import-specialty-documents.mjs` loads it.
- Contacts are seeded by
  `supabase/migrations/20261023090000_school_scoped_contacts.sql`.

## Monthly review

Run from a cloud session whose environment allows `www.nwpgmd.nhs.uk` and the
Supabase host, with `TRAINEEHQ_ADMIN_EMAIL` and `TRAINEEHQ_ADMIN_PASSWORD` set.
Node needs `NODE_USE_ENV_PROXY=1` (and `NODE_EXTRA_CA_CERTS` pointing at the
proxy's CA bundle) to reach Supabase through the proxy.

1. `node scripts/nwpgmd-snapshot.mjs content/nwpgmd/pages.txt /tmp/new.json`,
   then compare it with `snapshot.json`: page text, links (above all
   `/sites/default/files/` documents) and "Page last updated" dates. Also look
   for new specialty or school pages linked from the School of Surgery home.
2. **Contacts.** For every changed name, role, email, phone or base, update
   the live `contacts` rows (as the admin), matching on name and role. A person
   who has left gets `archived = true` — never deleted, since trainees may have
   starred them. New people are added with the same scope (deanery-wide, the
   School of Surgery, or the specialty) as their predecessor. Then make the
   same change to the seed in the migration so a fresh database matches.
   If the `schools` table does not exist yet, the migration has not been
   applied: change the migration only and say so.
3. **ENT documents.** A new or replaced document on the ENT, ENT ARCP, School
   ARCP, Resident Doctors, TPDs, TRES, MACH or SuppoRTT pages that a trainee
   needs: download it into `content/nwpgmd/ent/`, add it to `manifest.json`
   and run the importer. A replaced file (same title, new version) is uploaded
   and its existing resource row repointed at the new file. Do not remove
   resources admins added themselves; only those whose description cites a
   nwpgmd.nhs.uk source.
4. Replace `snapshot.json`, commit, push to a branch and open a pull request
   listing every change, made or proposed.
5. Nothing changed: say so, and change nothing.
