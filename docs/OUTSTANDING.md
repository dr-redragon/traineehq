# Outstanding items

Running list of what still needs doing, and who has to do it. Items marked
**you** need a credential, a decision or a dashboard action that automation in
this repo cannot perform.

Last updated: 2026-09-01.

---

## 0. Data protection — act on these first

| # | Item | Owner | Status |
|---|------|-------|--------|
| 0.1 | **Make `dr-redragon/ent-teaching-register` private** (Settings → General → Danger Zone). | you | **Not done.** One click, and the fastest way to close what remains. |
| 0.2 | **Scrub the leaked cohort from that repo's history**, then ask GitHub Support to purge cached objects. Run `scripts/scrub-register-history.sh`. | you | **Not done.** The data is out of the current files but still in every earlier commit. Rewrites all commit hashes and force-pushes, so do 0.1 first and read the script header. |
| 0.3 | Remove the cohort from the **served files**. | done | Commit `c30acce` on that repo: 46 named trainees with sickness, maternity and LTFT records removed from `index.html`, plus a real name used as a placeholder on the public check-in page. |
| 0.4 | **Close anonymous access to the register database.** | done | `public_roster()` (leaked all 52 names), `record_local_checkin()` and `sessions` select are no longer callable by `anon`. Data untouched — 52 trainees, 11 sessions, 273 attendance marks, 84 excused, 17 status records all verified present. |
| 0.5 | **One anonymous write path is still open**: `register-api` runs as service-role and only gates `ORGANISER_ACTIONS`, so anyone can still call `check-in` — marking attendance and adding names to the roster. Fix: add `"check-in"` to the `ORGANISER_ACTIONS` set (~line 666 of `supabase/functions/register-api/index.ts`) and redeploy. | you | **Not done.** Left to you deliberately: the deployed function is version 13 (1 Sep) and ahead of the repo snapshot (28 Aug), so it needs changing in your own workflow rather than overwritten from here. |
| 0.6 | **The register repo is behind its deployment** — `register-api` v13 was deployed after the last repo commit. Reconcile them. | you | **Not done.** Whatever is live is not fully represented in git. |

*Note: with 0.4 applied, anonymous QR self-check-in no longer works — attendance is
recorded by a signed-in organiser via `mark-attended`. That follows from "no access
without a password". Anonymous feedback submission still works: it writes only and
discloses no personal data. Say if you want that closed too.*

## 1. Before the new Supabase project is fully usable

| # | Item | Owner | Why it matters |
|---|------|-------|----------------|
| 1.1 | **Copy the storage files.** Run `scripts/migrate-storage.mjs` with both service-role keys. 11 files, ~70 KB. | you | Until this runs, those 11 resources appear in the app but fail to download. Everything else already works. |
| 1.2 | **Set `RESEND_API_KEY`** on project `twuvscymudpnokzfsqoy` (Edge Functions → Secrets). Optionally `CONTACT_FORWARD_TO`. | you | Every email path fails silently without it: invites, access-request confirmations, the contact form. |
| 1.3 | **Get this branch live.** Merge `claude/website-code-evaluation-ynx8kf` into `main`, or deploy it. | you | None of the work in this branch is running anywhere yet. `main`, and therefore the Lovable preview, is still the old code pointing at the old, near-empty database. |
| 1.4 | **Deploy for review via Netlify or Vercel** — `netlify.toml` and `vercel.json` are committed; import the repo and pick this branch. | you | Gives a review URL on any device with no GitHub login, while the repo stays **private**. Preferred over GitHub Pages: publishing this repo would expose its git history (see 0.2). |

## 2. Security and data protection

| # | Item | Owner | Why it matters |
|---|------|-------|----------------|
| 2.1 | **Apply `supabase/migrations/20260828160000_revoke_anon_on_legacy_register_store.sql`** to the old Lovable project (`dvrzoglirpnoafjrobhn`). | you | That project's `register_store` still grants `anon` select/insert/update. The publishable key is in every shipped bundle, so the historical attendance data — names, sickness, maternity, OOP — is readable and overwritable by anyone until this runs. |
| 2.2 | **Review the RLS policies** in `supabase/schema/0001_traineehq_baseline.sql`. The table in `supabase/schema/README.md` summarises what each role can see and change. | you | These could not be copied — the original project's policies were never in version control. They are written from how the app behaves, and RLS is the *only* authorisation boundary in this app. |
| 2.3 | **Decide what happens to the old projects**: `7e1e88ab` / `dvrzoglirpnoafjrobhn` (near-empty, holds the register blob) and `6cec5550` (the real source data, plus 167 MB of storage). | you | Don't delete either until 1.1 is done and the new project is verified in use. |
| 2.4 | **Check whether Supabase project `efaexgqxdbcaykwhfwkn` is yours.** One resource row stored an absolute URL to it; the path has been normalised, but the reference came from somewhere. | you | If it isn't yours, files may have been served from a third party's project. |
| 2.5 | Account deletion still only removes the `profiles` row — the auth user, and the ability to sign in, survive. Needs a service-role edge function. | dev | The GDPR copy on the profile page promises otherwise. The new schema cascades correctly *if* the `auth.users` row is deleted; the app just never deletes it. |

## 3. Known bugs, not yet fixed

Carried over from `docs/CODEBASE-EVALUATION.md`; none of these were in scope for
the cleanup and security passes.

- **New announcements are invisible.** `AdminAnnouncements` never sets `deanery_id`, but the dashboard filters on it. The one migrated announcement has it set and shows fine; anything created in the admin panel will not. Same omission in `AdminContacts`.
- **Soft-deleted specialties stay visible.** Delete sets `deleted_at` and leaves `is_active` true; nothing outside the admin list filters on `deleted_at`.
- **Drag-to-reorder is gone** from the resource browser — `handleDragEnd` returns early on a row-to-row drop.
- **"Watch discussion" has a dashboard widget but no way to watch anything.**
- **Subheadings are local state only** and vanish on refresh until a file is assigned. Needs a real table.
- Choosing "No subheading" in `AddResourceDialog` stores the literal string `"none"`.
- `EditResourceDialog` uploads replacements to the wrong storage prefix and doesn't refresh `file_size`.
- Deleting a user in the admin panel takes one click with no confirmation.
- Storage objects are never garbage-collected on delete or replace — that is why 212 of 223 objects in the old bucket are orphans.
- Password change has no re-authentication; editing your profile email diverges from the auth email you sign in with.
- `super_admin` is not recognised in `DiscussionBoard` (can't pin or delete) or on the profile page (shows as trainee).

## 4. Promised in the README, never built

Dark-mode toggle (palette and `next-themes` are both present, nothing toggles) ·
GDPR consent banner (`profiles.gdpr_consent_at` exists, no UI) · audit log
(table exists, nothing writes to it) · in-platform notifications · email
obfuscation · privacy, terms and cookie links are all `href="#"`.

## 5. Housekeeping

- `package-lock.json` is stale — `npm ci` fails outright. Only `bun.lock` is current. Pick one lockfile.
- `playwright.config.ts` imports `lovable-agent-playwright-config`, which is not in `package.json`.
- 130 ESLint errors remain, almost all `no-explicit-any` from bypassing the generated Supabase types.
- The test suite is one placeholder assertion.
- `supabase/migrations/` still holds two old Lovable migrations that target a project the app no longer uses.

---

## Done in this branch

For context, so nothing here gets repeated:

- **Dead code removed** (~1,100 lines): the post-Drive-rewrite leftovers in `SpecialtyDetail`, six orphaned components, `App.css`, `lib/specialties.ts`, the fake sample contacts, the no-op `obfuscateEmail`. `KeyContacts` routed and linked.
- **Security fixed**: route guards on every signed-in route plus a role gate on `/admin`; `access-request-email` no longer provisions accounts for anonymous callers; `contact-form-email` no longer relays arbitrary HTML; PostgREST `or()` filter injection closed; signed storage URLs no longer sent to Google's document viewer; `verify_jwt` recorded in `config.toml`.
- **Teaching register replaced** with the rebuilt app, now framed from `register.traineehq.com`. The old file carried ~47 real trainees' attendance, sickness and maternity records as seed data in a publicly served file.
- **New Supabase project** `twuvscymudpnokzfsqoy` created, schema applied and verified, all four edge functions deployed, app repointed.
- **Data migrated** from Lovable project `6cec5550`: 2 deaneries, 37 specialties, 288 subsections, 11 resources, 3 folders and all engagement rows — every table verified count-for-count. All 3 users came across with password hashes intact, so existing logins still work, and both super_admins are present.
