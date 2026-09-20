-- Keep a person's accent scheme on their account rather than in their browser.
--
-- The picker in Settings first stored the choice in localStorage, which is
-- where the light/dark choice lives. That is per-device: signing in on a ward
-- computer, or on a phone, started you back on the default. A trainee uses
-- this from several machines, so the choice belongs to the person.
--
-- The browser copy stays, but as a CACHE rather than the record. It is what
-- index.html reads before first paint, because the profile cannot be fetched
-- before the page is drawn and a repaint into the right colour one frame later
-- is exactly the flash the inline script exists to prevent. The column is the
-- source of truth; the cache is reconciled to it as soon as it loads.

alter table public.profiles
  add column if not exists color_scheme text;

comment on column public.profiles.color_scheme is
  'Chosen accent scheme id (see src/lib/colorSchemes.ts), or null for the default.';

-- A format check rather than a list of the schemes that exist today. A
-- whitelist would mean a migration every time a colour is added or renamed,
-- and the client already refuses a value it does not recognise when reading.
-- This only stops junk and oversized values being written.
alter table public.profiles
  drop constraint if exists profiles_color_scheme_format;

alter table public.profiles
  add constraint profiles_color_scheme_format
  check (color_scheme is null or color_scheme ~ '^[a-z][a-z0-9-]{0,31}$');

-- Granted on the one new column, not on the table. A table-wide grant here
-- could widen access if the existing update grant is column-scoped, and the
-- point of this migration is one preference.
grant update (color_scheme) on public.profiles to authenticated;
