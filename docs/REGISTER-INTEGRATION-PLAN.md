# Multi-register integration plan

Bringing the teaching register into TraineeHQ as **many registers — one per
specialty per deanery** — with per-user access grants, request/approve joining,
a register switcher, single sign-on from TraineeHQ, and a standalone door.

`dr-redragon/ent-teaching-register` is **not touched**. It stays deployed from
its own `main` to `register.traineehq.com` against its own Supabase project
(`ecyhvubwcqqghumnyxuu`). Everything below happens in *this* repository against
this project (`twuvscymudpnokzfsqoy`).

Working branch: `claude/teaching-register-traineehq-abk2cu`

**Applied to `twuvscymudpnokzfsqoy` on 2026-09-07.** Stages 1, 2 and 5's
migrations are live. The register is `northwest-ent` ("NW · ENT (Otolaryngology –
Head & Neck Surgery)"), owned by `mabdelaziz@outlook.com`, who is also a
TraineeHQ `super_admin`. It holds an **anonymised** copy of the live ENT register
— 52 trainees, 11 teaching days, 273 attendance marks, 84 excusals, 17 status
rows — imported with `scripts/anonymise-register-import.sql`. Names, email
addresses and excusal reasons are replaced; attendance, grades and leave windows
are real. Verified byte-identical to the anonymised source
(md5 `f833958911b88bbfb9d0e83551b00217`).

---

## Why this document exists

The work is large enough to span several sessions. Each stage below is
independently shippable and states its own **done-when**, so any session can
pick up at the first unticked stage without re-deriving the design.

Progress: tick a stage's checkbox when its done-when is met and it is pushed.

---

## Settled design decisions

These were decided up front. Do not re-litigate them without saying so.

| # | Decision |
|---|---|
| 1 | The register is **ported to React** inside this repo, not copied in as static HTML. |
| 2 | **One identity, two doors.** A register account *is* a TraineeHQ `auth.users` row. No second credential store, no federation. |
| 3 | **Register membership is an explicit per-user grant** and is never derived from `user_roles`. A trainee can be a register editor; a TraineeHQ admin has no register access until granted. The two permission systems are orthogonal. |
| 4 | **No god-mode read.** A `super_admin` can manage membership but cannot silently read a register's data — they must grant themselves, which is recorded in `register_members.granted_by`. |
| 5 | Roles are **`owner` and `editor` only**. No viewer role — trainees reach check-in and feedback anonymously, exactly as they do today. |
| 6 | **Nobody is auto-granted access.** You either create a register, are invited to one, or request access to one from the directory. |
| 7 | **One register per specialty**, enforced by `unique (specialty_id)`. `specialties` is already deanery-scoped, so this *is* "one per specialty per deanery". A duplicate creation attempt becomes "that exists — request access instead". |
| 8 | **Any member can approve** join requests for their register. Approval is therefore transitive; accepted deliberately. Only an `owner` can remove members or delete the register. |
| 9 | The register keeps its **single JSONB blob** shape (`register_stores.data`), now one row per register, plus a `version` column for optimistic concurrency. Normalising into rows is a later, invisible migration behind `save_register()`. |
| 10 | Non-admin members reach the register by **direct link** (`/registers`). No TraineeHQ sidebar entry, no membership-gated nav. `AppSidebar.tsx` is untouched. |
| 11 | The direct link is a **path on the main origin**, not a separate hostname — `localStorage` is origin-partitioned, so a subdomain would break single sign-on. A vanity hostname may later 301 to it. |

---

## Stages

### [x] Stage 1 — Database foundation
**Goal.** The whole tenancy and access-control schema, with RLS, verified.

- `supabase/migrations/20260907090000_register_multi_tenancy.sql`
- Enum `register_role`; tables `registers`, `register_members`,
  `register_access_requests`, `register_stores`. (`register_invites` was created
  here too and dropped again in Stage 5 — see there for why.)
- Helpers `is_register_member`, `is_register_owner`, `can_create_register`.
- RPCs `create_register`, `request_register_access`, `decide_register_access`,
  `save_register`, `remove_register_member`.
- View `register_directory` (names and member counts only — never register data).
- RLS enabled *and* forced on every new table; explicit grants (the baseline's
  blanket `grant … on all tables` does not reach tables created after it).
- `scripts/verify-register-schema.sh` — runs the migration against a throwaway
  PostgreSQL 16 database with `auth`/`storage` stubs and asserts the access rules,
  matching how `supabase/schema/0001_traineehq_baseline.sql` was verified.

**Done when.** The verification script passes end to end and is committed.

---

### [x] Stage 2 — Seed the first register from the legacy blob
**Goal.** The existing ENT attendance history becomes register #1, with an owner.

- `supabase/migrations/20260907100000_seed_first_register.sql`
- Seed owner: **Mohammed Abdelaziz — `mabdelaziz@outlook.com`**, the same address
  the standalone register bootstraps its own administrator from, so one person
  owns both while the two systems run side by side.
- Also promotes that account to TraineeHQ `super_admin`. Separate grant, and
  neither implies the other (decision 3) — it is held because it is the
  operator's account, not because owning a register confers it.
- Copies the legacy `public.register_store` row (`id='default'`, left read-only by
  `20260828160000_revoke_anon_on_legacy_register_store.sql`) into `register_stores`.
- Picks the ENT specialty in the owner's own deanery where their profile names
  one, else the first ENT specialty there is — the legacy register predates
  deaneries and carries no hint of which one it belongs to.
- Idempotent and order-tolerant: with no such account yet it applies cleanly,
  changes nothing, and says so. Re-run it after signing up.
- **The import is one-shot.** A re-run will not overwrite a register that already
  holds data, so anything entered in the old register *after* seeding has to be
  brought across by hand (or the `register_stores` row cleared first).

**Done when.** ✅ Verified in scenario B of `verify-register-schema.sh`: the owner
reads their register through RLS, no other account can, and the migration is a
no-op on both a second run and a project where the account does not exist.

**Depends on.** Stage 1.

---

### [x] Stage 3 — Extract the register's pure logic, with tests
**Goal.** De-risk the port by lifting the logic out of the DOM first.

From `ent-teaching-register/index.html` into `src/lib/register/`, each taking the
blob as an argument instead of reaching for the global `DB`:
- `months.ts` — `parseMonth`, month formatting, academic-year (Aug–Jul) bucketing.
- `attendance.ts` — the `"<trainee>|<session>"` map, the legacy `true` mark, and
  `latestGrade`'s rule that a past year never shows a grade held later.
- `eligibility.ts` — the `active` / `cct` / `idt_in` / `idt_out` / `mat` / `oop`
  window rules, plus leave that expires by itself without the row being touched.
- `report.ts` — raw vs adjusted percentages, and the row filter/sort.
- `types.ts` — landed early, with Stage 4.

`attendance.ts` is a fourth module this plan did not originally name: the blob
accessors are needed by both `eligibility.ts` and `report.ts`, and belong in
neither.

**Done when.** ✅ 128 tests green, `tsc` and ESLint clean, build succeeds. Every
row of the eligibility table is covered, including the `start`-only, `end`-only
and neither variants of each.

**And beyond it** — `parity.test.ts` runs the ported rules against the *original*
functions, copied verbatim out of `index.html`, over 400 randomised registers,
every month boundary from 2023 to 2027, and 29 forms of typed month. It is kept
rather than deleted: until the Stage 10 cutover both registers are live against
the same cohort, so a drift between them would mean two systems reporting
different attendance for the same trainee.

**One intentional divergence**, made deliberately after the port: an excusal now
applies to the session it was logged against, where the original applied it to
that session's whole month. The two agree on any register with one teaching day a
month, so the randomised fixtures are generated that way and still assert exact
agreement; the case where they differ has its own test. No data migration is
needed — an excusal has always been stored against a session id.

**Depends on.** Nothing.

---

### [x] Stage 4 — Register shell, directory and switcher
**Goal.** The direct link works and shows the right registers to the right people.

- `src/lib/register/types.ts` — the tenancy shapes and the register blob.
- `src/lib/register/api.ts` — every call into the register tables and RPCs.
  `src/integrations/supabase/types.ts` is generated and does not know these
  tables yet, so the casts live here and nowhere else; **regenerate `types.ts`
  once the migrations are applied and they can be deleted.**
- `src/lib/register/directory.ts` (+ tests) — splits the directory into yours,
  awaiting a decision, and askable.
- `src/hooks/useRegisters.ts`, `src/contexts/RegisterContext.tsx` — the active
  register, remembered per account rather than per browser.
- `src/components/register/RegisterLayout.tsx` — its own shell, with the switcher.
- `src/pages/RegisterDirectory.tsx` — browse, request access, create a register.
- `src/pages/RegisterDetail.tsx` — membership-gated; shows the stored blob's
  totals as proof of the path, pending the Stage 6 port.
- **`AppSidebar.tsx` deliberately untouched** (decision 10).

**Done when.** ⚠️ Built, typechecked, linted, 9 unit tests green, production
build clean, and `/registers` verified in Chromium to mount and redirect a
signed-out visitor to `/login`. **The signed-in paths have not been exercised
against a live database** — that needs the Stage 1 and 2 migrations applied to
the Supabase project first.

**Depends on.** Stage 1.

---

### [x] Stage 5 — Access administration
**Goal.** Requests, invites and membership are managed from inside the register.

- `supabase/migrations/20260907110000_register_access_admin.sql`
- `supabase/functions/register-invite/` — adds someone by email, creating their
  account if they have none, and emails them a set-password link. Mirrors
  `invite-user/`. Every rule is re-checked in code, because the service role
  bypasses RLS.
- `src/pages/RegisterAccess.tsx` at `/registers/:slug/access` — requests to
  approve or refuse, the member list with promote/demote/remove/leave, and the
  add-by-email form. `src/hooks/useRegisterAccess.ts`.
- `register_people()` — names and addresses for a register's members and
  applicants, answerable only to a member of it. Needed because an owner may hold
  no TraineeHQ admin role, and `profiles` is readable only by its owner and by
  admins.

**Two changes of mind, both recorded in the migration:**

1. **`register_invites` is dropped.** Stage 1 built a hashed-token, click-to-accept
   flow. It was ceremony: this project already invites people to TraineeHQ by
   creating the account and assigning the role outright, `granted_by` gives the
   same audit trail, and anyone added can leave on their own. Dropping it removes
   a credential store from the schema rather than leaving it unused. The table
   never held a row.
2. **Admitting someone is now one rule.** Stage 1 let any member approve a request
   but only an owner add somebody directly — two answers to the same question.
   Both are now "any member", with the role capped at editor unless the caller is
   an owner. Promote, demote and remove stay with owners.

Also: member roles move behind `set_register_member_role()`, because the
last-owner rule cannot be written as a row predicate — it depends on how many
other rows exist, and the old policy would have let the only owner demote
themselves into a register nobody could administer.

**Done when.** ⚠️ 51 schema assertions pass (up from 36), 130 unit tests green,
tsc and ESLint clean on the new files, build succeeds, and all three
`/registers` routes verified in Chromium to mount and gate correctly.
**The signed-in paths and the edge function still need a live project.**

**Depends on.** Stages 1, 4.

---

### [ ] Stage 6 — Port the register UI
**Goal.** The register itself, as React components, register-scoped throughout.

The bulk of the work — `index.html` is 3,342 lines. Port panel by panel, each
reading and writing through `save_register()` with the version guard:

1. Attendance dashboard (the grid, year tabs, "hide not in programme").
2. Trainees & sessions (roster, monthly calendar, edit dialogs).
3. Reports (per-year / combined / both, the include-cohort checkboxes).
4. Live session & QR check-in.
5. Feedback reporting.
6. Certificates.
7. Users & access — replaced by Stage 5's UI, not ported.

**Done when.** Every panel works against a seeded register, and two browser tabs
editing at once produce a clean version-conflict retry rather than silent loss.

**Depends on.** Stages 3, 4.

---

### [ ] Stage 7 — Register-aware live-session backend
**Goal.** The check-in / feedback / certificate backend, multi-tenant.

- Port `register-api` from the register repo into `supabase/functions/register-api/`.
- Add `register_id` to `sessions`, `attendees`, `feedback_responses`,
  `form_templates`; backfill; make it `not null`.
- Keep the three-tier auth (anon / member / owner), with the member tier now
  checking `is_register_member` rather than "any signed-in user".
- **Security-critical:** scope the anonymous roster RPC by session → register.
  Today it returns every trainee; multi-tenant, an unscoped version leaks one
  deanery's roster to another's QR code.

**Done when.** A check-in link for register A cannot enumerate register B's
trainees, proven by a test against the RPC.

**Depends on.** Stage 1.

---

### [ ] Stage 8 — Public trainee pages
**Goal.** Check-in, feedback and session pages, register-aware.

Port `checkin.html`, `feedback.html`, `session.html`, `form-editor.html`. These
stay anonymous — a trainee's access is the session link, not an account
(decision 5). Their register is derived from the session, never from a URL
parameter the visitor controls.

**Done when.** A QR scan → check-in → feedback → certificate round trip
completes on a seeded register.

**Depends on.** Stage 7.

---

### [ ] Stage 9 — Standalone door and admin-panel link
**Goal.** Both entrances, and retire the iframe.

- `/registers` renders its own login when signed out, offering both doors:
  "Sign in with TraineeHQ" and a plain email/password form. Same Supabase Auth
  behind both (decision 2).
- Replace the iframe in `src/components/admin/AdminAttendance.tsx` with a link to
  `/registers`. **Its current comment argues against copying the register in** —
  rewrite it, or the next reader will undo this work.

**Done when.** Signed into TraineeHQ, `/registers` needs no second sign-in; in a
clean browser it presents its own login.

**Depends on.** Stages 4, 6.

---

### [ ] Stage 10 — Cutover
**Goal.** One live register system, not two.

- Migrate remaining data from project `ecyhvubwcqqghumnyxuu`.
- Freeze the original repo; redirect `register.traineehq.com`.
- Drop the legacy `public.register_store` once its history is confirmed migrated.

**Done when.** ENT organisers use only the new register and the old deployment
is read-only.

**Depends on.** Stages 6, 8, 9.

---

## Open questions

Carry these forward until answered; none block Stage 1.

1. ~~**Seed owner for the ENT register.**~~ Answered: Mohammed Abdelaziz,
   `mabdelaziz@outlook.com`. Implemented in Stage 2.
2. **Missing specialty on self-serve creation.** `registers.specialty_id`
   references TraineeHQ's admin-managed `specialties`. If someone wants a register
   for a specialty nobody has added, they are blocked. Should `create_register`
   be allowed to create the specialty row for their own deanery?
3. **Transitive approval** (decision 8) — leave as specified, or restrict
   approval to `owner`? One line either way in `decide_register_access`.

## Repository housekeeping found along the way

Neither blocks this work, but both will confuse someone.

- `supabase/config.toml` declares `project_id = "dvrzoglirpnoafjrobhn"`, but
  `.env` points at `twuvscymudpnokzfsqoy`. Reconcile before running the Supabase
  CLI against this project.
- `public.teaching_sessions` and `public.attendance_records` exist in the baseline
  and are unused — an earlier, abandoned sketch of this feature. They are the
  natural target for the eventual normalisation in decision 9; until then they are
  dead weight and should either be used or dropped.
