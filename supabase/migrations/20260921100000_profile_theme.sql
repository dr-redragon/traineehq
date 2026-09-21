-- Keep a person's light/dark choice on their account rather than in their
-- browser.
--
-- It lived in localStorage, under the key next-themes picked. That is
-- per-device, and worse, per-browser: a trainee who sets the site to light on
-- their laptop signs in on a ward machine, or a phone, and gets whatever that
-- device's appearance setting asks for — usually dark, because the device is
-- dark. From the outside that looks like the site ignoring the choice they
-- made. The accent scheme moved to the account for the same reason in
-- 20260920090000_profile_color_scheme.sql; this is its other half.
--
-- The browser copy stays as a CACHE, because the profile cannot be fetched
-- before the page is painted and index.html has to put `.dark` on <html>
-- before the bundle exists. The column is the record; the cache is reconciled
-- to it as soon as it loads.

alter table public.profiles
  add column if not exists theme text;

comment on column public.profiles.theme is
  'Chosen appearance: light, dark, or system (follow the device). Null means never chosen.';

-- A short whitelist rather than a format check, unlike color_scheme: these
-- three are the whole of the vocabulary and are not going to grow with the
-- design, so there is no migration cost to naming them.
alter table public.profiles
  drop constraint if exists profiles_theme_values;

alter table public.profiles
  add constraint profiles_theme_values
  check (theme is null or theme in ('light', 'dark', 'system'));

-- Granted on the one new column, not on the table. A table-wide grant here
-- could widen access if the existing update grant is column-scoped, and the
-- point of this migration is one preference.
grant update (theme) on public.profiles to authenticated;
