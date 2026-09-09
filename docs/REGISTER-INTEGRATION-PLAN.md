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
| 7 | ~~One register per specialty, enforced by `unique (specialty_id)`.~~ **Revised in `20260907150000`.** That assumed `specialties` was a per-deanery list; on real data all 26 belong to North West and Northern has none, so it is a single catalogue and ENT could have exactly one register in existence. Registers now carry their own `deanery_id` and are unique per **(deanery, specialty)**. A duplicate within one deanery still becomes "that exists — request access instead". |
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
  here too and dropped again in Stage 5 — see there for why. `registers` gained
  its own `deanery_id` in `20260907150000` — see decision 7.)
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

### [~] Stage 6 — Port the register UI
**Goal.** The register itself, as React components, register-scoped throughout.

The bulk of the work — `index.html` is 3,342 lines. Ported panel by panel, each
reading and writing through `save_register()` with the version guard.

**Done:**
1. ✅ Attendance dashboard — `AttendanceGrid.tsx`. Year tabs, the cell grid with
   click-to-toggle, search, sorting, "hide trainees not in programme", raw vs
   adjusted percentages with the original's 80/60 colour bands, and the specific
   long-term status per trainee (`Mat leave`, `OOP`, `CCT`, `IDT in/out`) rather
   than one word for all of them.
   **On a phone, a tap on a cell opens its details rather than changing it**
   (`AttendanceCellPopover.tsx`, added 2026-09-09 from the standalone
   register's own touch popover). There is no hover on a phone, so the marks
   were unlabelled squares — which teaching day a column was, and what a square
   meant, were both invisible — and the tap that would have shown a tooltip on
   a desktop instead rewrote somebody's attendance on a 28px target, silently.
   The popover names the day, the month, the trainee, the state and the grade,
   and changing it takes a second press on a button that says what it will do.
   A mouse click still toggles straight away, which is what marking a register
   at a desk wants; `useTouchInput.ts` tells the two apart per interaction
   rather than trying to classify the device. Hand-positioned rather than built
   on the shared Radix popover: a year's grid is several hundred cells, and this
   is one element, mounted only while it is open.
2. ✅ Trainees and teaching days — `ManagePanel.tsx`, with `MonthInput.tsx`
   carrying `parseMonth`'s forgiving entry across, and the original's collapsed
   **Former trainees** list for anyone CCT'd or transferred out.
2b. ✅ Long-term status — `StatusPanel.tsx`, its own tab as in the original, with
   `statusText.ts` porting the per-type wording ("completes after Mar 2026
   (2025/26)", "excluded from Sept 2025 → ongoing") and its tests.
2c. ✅ Excused absences — `ExcusalsPanel.tsx`, its own year-scoped tab. Was
   missing entirely: `addExcusal`/`removeExcusal` existed in `blob.ts` with
   nothing calling them, so an excusal could not be logged from the UI at all.
3. ✅ Reports — `ReportPanel.tsx` on `buildReport()`. Year selection, the three
   layouts, the include-cohort switches, content toggles and summary-only, with
   the controls and the app chrome removed from the printed page.
7. ✅ Users & access — Stage 5's UI, not ported.

**The foundation, and the part worth reviewing:**
- `src/lib/register/blob.ts` — every edit as a pure, immutable function of the
  blob, with 23 tests. Removing a trainee takes their attendance, excusals and
  status with them; removing a teaching day takes its marks and excusals.
- `src/hooks/useRegisterStore.ts` — edits are passed as **functions**, not
  finished blobs, precisely so a rejected save can be replayed on top of
  whatever the other person wrote. Four attempts, then it fails loudly.

4. ✅ Check-in / QR — `CheckInPanel.tsx`, rebuilt 2026-09-09 to the standalone
   register's own Check-in tab: year tabs, the teaching-day picker, the QR and
   its link, quick manual check-in with the grade held at that rotation, the
   live day's own card (`LiveDayCard.tsx`) and the unexplained-absence chaser
   (`ChaseAbsencesDialog.tsx`). The QR points at this app's own origin: a code
   on a screen is scanned by people who will not check the host.
   **The register and the live list now agree in both directions.** A QR sign-in
   already wrote the grid through `register_record_checkin()`; a mark made in
   the grid or by hand now reaches the live list through `mark-attended`
   (`useLiveAttendanceSync.ts`), publishing a day pushes every mark it already
   holds, and "Re-sync sign-ins" reconciles both ways (`liveSync.ts`, 17 tests).
   Before this, making a past teaching day live to collect feedback produced an
   empty sign-in list beside a grid full of ticks, and nobody who had actually
   attended could be sent the form.
5. ✅ Feedback reporting and form design — `FeedbackPanel.tsx` for per-question
   averages, the rating distribution, the comments and a CSV export, read off
   the session's *own* stored form so rewording a question later cannot relabel
   answers given to the old one; `FeedbackFormEditor.tsx` for designing the form
   itself, scoped either to one teaching day or to the register's template, with
   a preview drawn by the same component that renders the real form.

**Still to do:**
6. ✅ Certificates — download works now; emailing waits on RESEND_API_KEY.

**Done when.** Every panel works against a seeded register, and two browser tabs
editing at once produce a clean version-conflict retry rather than silent loss.
⚠️ The conflict retry is unit-covered by `blob.ts`'s purity test but has **not
been exercised with two real browsers** yet.

**Depends on.** Stages 3, 4.

---

### [~] Stage 7 — Register-aware live-session backend
**Goal.** The check-in / feedback / certificate backend, multi-tenant.

**Schema done** — `supabase/migrations/20260907120000_register_live_sessions.sql`.
The four tables did not exist in this project at all (the real ones live in the
standalone register), so rather than adding `register_id` and backfilling, they
were created scoped from the outset: `register_sessions`, `register_attendees`,
`register_feedback`, `register_forms`.

Every anonymous door is keyed on the **session**, with the register derived from
it server-side. A visitor holds a link and nothing else; there is deliberately no
function that takes a register id.

Two things came out stricter than the original:
- **`register_record_checkin` derives the blob's session key** from the session
  row. The original took it from the browser, so any caller could write a mark
  against any teaching day in the register.
- **Anon cannot list sessions.** The original grants `select` on `sessions` with
  `using (true)`, survivable with one register and not with many — it would
  expose every deanery's teaching schedule. `register_public_session()` returns
  one session by id instead, so a link opens a door rather than a filing cabinet.

Also dropped `teaching_sessions` and `attendance_records` — the abandoned sketch
flagged twice in this document. Both empty, nothing read them.

**Done when.** ✅ *A check-in link for register A cannot enumerate register B's
trainees* — assertion 2 of `live-sessions-assertions.sql`, with two registers and
a published session in each.

**Edge function done** — `supabase/functions/register-api/index.ts`, plus the two
RPCs it needs in `20260907140000_register_api_functions.sql`
(`register_enrol_trainee`, `register_record_feedback`, both service-role only).

Two tiers, and the middle one is the port:
- **anon** — `check-in`, `submit-feedback`. Authority is the session link; the
  register is always derived from the session id.
- **member** — `create-session`, `session-status`, `mark-attended`, `get-form`,
  `save-form`, `reset-feedback`. The original asked "is this a signed-in user",
  because one register meant anybody signed in ran it. Now it asks "is this user
  a member of the register this action touches", per call.

Where a call names both a session and a register, **the session decides** — so a
caller cannot pair a session in register A with a register id in register B and
have the looser of the two checked.

**Certificates: ported 2026-09-08.** The template takes the register's name and
deanery from data, with a test that fails if a fixed specialty is put back into
the footer. Rendered in the browser (a dynamic pdf-lib import, so the megabyte
lands in its own chunk) and posted already drawn to `register-certificate`,
which emails it — taking the address from the database rather than the request,
so it cannot be used as an authenticated open relay.

**`email-feedback-link` and `chase-absences`: ported 2026-09-09.** Both send
through `supabase/functions/register-api/email.ts`, which throttles to the
provider's rate limit, retries a 429 and classifies a failure into one sentence
an organiser can act on. Neither takes a destination from the request: the
feedback link is built from `APP_BASE_URL`, the feedback addresses come from the
attendee rows, and every chaser address is checked against that register's own
roster before anything is sent. Both still wait on `RESEND_API_KEY`.

**Depends on.** Stage 1.

---

### [x] Stage 8 — Public trainee pages
**Goal.** Check-in and feedback, register-aware.

- `src/pages/register/CheckIn.tsx` at `/registers/checkin?s=…`
- `src/pages/register/Feedback.tsx` at `/registers/feedback?s=…`

Both sit **outside `RequireAuth`**: somebody scanning a QR code has no account,
and the session id in the link is the whole of their authority. Both read through
the security-definer functions that derive the register from that session, so a
link opens one teaching day and nothing else. Verified in Chromium that the two
static paths win over `/registers/:slug` and render without a session.

**One departure from the original.** It let anybody holding a feedback link read
the list of who had attended, to populate a name dropdown. That is a disclosure
the link should not carry — attendance at a teaching day is not something a stray
link ought to reveal. Instead the check-in page remembers the attendee id it was
given, on that device (`checkInMemory.ts`), and the feedback page reads it back;
anybody who has cleared their data or changed device types the address they
signed in with. A convenience, never the only way through.

**Done when.** ✅ A QR scan → check-in → feedback round trip is reachable without
an account. ⚠️ Not yet driven against a live register — the container's browser
cannot reach Supabase.

**Depends on.** Stage 7.

### [x] Stage 9 — Standalone door and admin-panel link
**Goal.** Both entrances, and retire the iframe.

- ✅ **The iframe is gone.** `AdminAttendance.tsx` was an iframe of
  register.traineehq.com carrying a comment that copying the register in "would
  be a fork that silently drifts from the version trainees actually check in
  against". Right about the ENT register, wrong about this one: the registers now
  live in this application against this database, so there is nothing to drift
  from. It is a link rather than the register inline, because an admin with no
  membership would otherwise get an empty screen — the directory is the right
  place to send them.
- ✅ **The standalone door.** Built at `/registers/sign-in`, offering both routes
  in against the same Supabase Auth (decision 2). `RequireAuth` gained a
  `signInPath` so a route tree can name its own door; everything outside the
  registers still goes to `/login`. Verified in a browser.

  Two things fell out of it. `Login` had always been handed the page the guard
  turned somebody away from and had always ignored it, so a deep link followed
  while signed out landed on the dashboard with the click forgotten — both pages
  now honour it. And the honouring goes through `safeDestination()`, which is
  where the open-redirect protection lives and is tested: the protocol-relative
  case (`//elsewhere`) is the one a bare `startsWith("/")` check waves through.

**Depends on.** Stages 4, 6.

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
2. ~~**Missing specialty on self-serve creation.**~~ Partly answered by
   `20260907150000`: the specialty picker now offers the whole active catalogue
   for any deanery you can create in, so a deanery with no specialty rows of its
   own is no longer stuck. Still open in the narrower sense — a specialty that is
   in no deanery's catalogue at all still needs adding under Admin → Specialties
   first. The consequence to weigh is that `registers.deanery_id` and
   `specialties.deanery_id` may now differ.
3. **Transitive approval** (decision 8) — leave as specified, or restrict
   approval to `owner`? One line either way in `decide_register_access`.

## The grants mistake, and what it says about the harness

Worth reading before adding a table to this schema.

Supabase ships with `alter default privileges in schema public grant all on
tables to anon, authenticated, service_role`, so **every table is granted to both
browser roles the moment it is created**. Stages 1 and 7 each granted what they
wanted and stated "anon gets nothing at all here". Both were wrong on the live
project: anon and authenticated held select/insert/update/delete on all eight
register tables.

Nothing was exposed — RLS is enabled and forced everywhere, and no table has a
policy for anon or for the write paths, so a browser got zero rows and changed
zero rows. But PostgREST checks grants *before* RLS, and only one of the two
layers was doing any work. `save_register()`'s version guard in particular was
documented as impossible to sidestep, and was, only because RLS refused the
direct `UPDATE` rather than because the grant was absent.

`20260907130000_register_grants_lockdown.sql` revokes everything from both roles
and re-grants exactly what each needs, then closes the default so a table added
later starts private.

**The harness was the real failure.** `supabase/schema/test/stubs.sql` did not
reproduce those default privileges, so "anon cannot select X" passed against a
database where nothing had granted anon anything — proving the fixture, not the
migration. The stubs now include them, which is what surfaced this; assertions
that check a *mechanism* which changes across migrations were rewritten to check
the *outcome*, and `grants-assertions.sql` checks the grant layer on its own.

## Repository housekeeping found along the way

Neither blocks this work, but both will confuse someone.

- `supabase/config.toml` declares `project_id = "dvrzoglirpnoafjrobhn"`, but
  `.env` points at `twuvscymudpnokzfsqoy`. Reconcile before running the Supabase
  CLI against this project.
- ~~`public.teaching_sessions` and `public.attendance_records` are unused dead
  weight.~~ **Resolved** — dropped in Stage 7, superseded by the register-scoped
  `register_sessions` and the blob's own attendance map. Both were empty.
