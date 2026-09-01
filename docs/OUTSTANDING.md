# Outstanding items

Running list of what still needs doing, and who has to do it. Items marked
**you** need a credential, a decision or a dashboard action that automation in
this repo cannot perform.

Last updated: 2026-09-01 (second pass).

---

## 0. Data protection

| # | Item | Owner | Status |
|---|------|-------|--------|
| 0.1 | Make `dr-redragon/ent-teaching-register` private. | you | **Skipped at your request** — you asked that it stay public. Everything below was done without it. |
| 0.2 | **Scrub the leaked cohort from that repo's history.** | done | History rewritten with `git-filter-repo` and force-pushed. All 10 branches and 72 commits preserved; 34 versions of `index.html` and 7 of `checkin.html` cleaned. Verified from a fresh clone of GitHub: no cohort name survives in any blob. Local backup bundle at `/var/tmp/ent-register-BACKUP-before-scrub.bundle` (this sandbox only — take your own copy if you want one). |
| 0.2b | **Ask GitHub Support to purge cached objects.** | you | **Not done — I have no way to contact GitHub Support.** Text to send is below. Until they purge, the old objects may still be reachable by direct SHA and through forks or existing clones. |
| 0.3 | Remove the cohort from the served files. | done | Commit `c30acce`, since rewritten to `f3d4213`. |
| 0.4 | Close anonymous access to the register database. | done | `public_roster()`, `record_local_checkin()` and `sessions` select no longer callable by `anon`. Data verified intact: 52 trainees, 11 sessions, 273 attendance marks, 84 excused, 17 status records. |
| 0.5 | **Gate the anonymous `check-in` write path.** | done in code, **deploy pending** | Committed as `657d7e8`. Run **`supabase functions deploy register-api`** to make it live — until then the endpoint is still callable. I could not deploy it from here: the MCP tool needs the 43 KB source inline and hand-copying a live production function risks a typo breaking attendance. |
| 0.6 | ~~The register repo is behind its deployment.~~ | **withdrawn — I was wrong** | I inferred drift from timestamps (v13 on 1 Sep vs a 28 Aug push). Comparing the actual sources shows they match: one blank line, plus unicode escapes rendered literally in the API response. No reconciliation needed. |

*With 0.4 applied, anonymous QR self-check-in no longer works — attendance is recorded
by a signed-in organiser via `mark-attended`. That follows from "no access without a
password". Anonymous feedback submission still works: it writes only and discloses no
personal data. Say if you want that closed too.*

### Text for GitHub Support (0.2b)

> Repository: https://github.com/dr-redragon/ent-teaching-register
>
> This repository's history contained personal data (names and health-related
> absence records) committed in error. The history has been rewritten with
> git-filter-repo and force-pushed, so the affected objects are now unreferenced.
> Please permanently purge the unreferenced objects and any cached views of them,
> including the pre-rewrite commits, so they can no longer be reached by SHA or
> through the API.
>
> Pre-rewrite branch tips, for reference:
> main c30accec3890fadbe6b31c96340df0b649e4e607;
> organiser-login-consolidation 20b9ee810a52c24e3c9f5d2be1b668a57814c62e;
> trainee-emails-and-inline-feedback-push 7ec68afdac5ea1093153250a30bb55fdb361edb3;
> plus seven claude/* branches.

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
| 2.1 | ~~Apply the legacy `register_store` lockdown to the old Lovable project.~~ | **done** | Applied to `dvrzoglirpnoafjrobhn`: `anon` has no access, `authenticated` is read-only, the row is preserved. |
| 2.2 | **Review the RLS policies** in `supabase/schema/0001_traineehq_baseline.sql`. The table in `supabase/schema/README.md` summarises what each role can see and change. | you | These could not be copied — the original project's policies were never in version control. They are written from how the app behaves, and RLS is the *only* authorisation boundary in this app. |
| 2.3 | **Decide what happens to the old projects**: `7e1e88ab` / `dvrzoglirpnoafjrobhn` (near-empty, holds the register blob) and `6cec5550` (the real source data, plus 167 MB of storage). | you | Don't delete either until 1.1 is done and the new project is verified in use. |
| 2.4 | **Check whether Supabase project `efaexgqxdbcaykwhfwkn` is yours.** One resource row stored an absolute URL to it; the path has been normalised, but the reference came from somewhere. | you | If it isn't yours, files may have been served from a third party's project. |
| 2.5 | Account deletion still only removes the `profiles` row — the auth user, and the ability to sign in, survive. Needs a service-role edge function. | dev | The GDPR copy on the profile page promises otherwise. The new schema cascades correctly *if* the `auth.users` row is deleted; the app just never deletes it. |

## 3. Known bugs

**Fixed** in commit `ef9ff19`: invisible announcements (and the same `deanery_id`
omission on contacts) · soft-deleted specialties showing everywhere · `super_admin`
unable to pin/delete discussions and mis-badged on the profile page · the `"none"`
subheading sentinel · `EditResourceDialog`'s wrong storage prefix and stale
`file_size` · one-click user deletion now confirms.

**Still open** — each needs more than a contained edit:

- **Drag-to-reorder is gone** from the resource browser: `handleDragEnd` returns early on a row-to-row drop. Restoring it means reinstating sort-order writes in `DriveBrowser`.
- **"Watch discussion" has a dashboard widget but no way to watch anything** — needs a button and an insert into `watched_discussions`.
- **Subheadings are local state only** and vanish on refresh until a file is assigned. Needs a real table and a migration.
- **Storage objects are never garbage-collected** on delete or replace — the cause of the 212 orphans in the old bucket. Needs deletion wired into the resource delete/replace paths.
- Password change has no re-authentication; editing your profile email diverges from the auth email you sign in with.

## 4. Promised in the README, never built

Dark-mode toggle (palette and `next-themes` are both present, nothing toggles) ·
GDPR consent banner (`profiles.gdpr_consent_at` exists, no UI) · audit log
(table exists, nothing writes to it) · in-platform notifications · email
obfuscation · privacy, terms and cookie links are all `href="#"`.

## 5. Housekeeping

- ~~`package-lock.json` is stale~~ — **fixed**: regenerated and `npm ci` verified working.
- ~~`playwright.config.ts` imports a missing package~~ — **fixed**: config and fixture are now standalone.
- 131 ESLint errors remain, almost all `no-explicit-any` from bypassing the generated Supabase types.
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
