# Going live

Everything that has to be true before HST Training Hub — dashboard, resources,
discussions, admin panel and the teaching registers — is a production system
rather than a preview.

Written 2026-09-07 against branch `claude/teaching-register-traineehq-abk2cu`
(PR #4) and Supabase project `twuvscymudpnokzfsqoy`. Each step says how to
check it is done, so nothing rests on "it looked fine".

**Updated 2026-09-08.** Four of the blockers are now cleared. What remains
needs a credential, a payment decision or a dashboard action — none of it can
be done from a code session.

Done since this was written:

- **1.1 — merged.** PR #4 is on `main` (merge `81ecbfb`), after verifying 205
  tests, clean typecheck and a clean build against its head.
- **1.2 — deployed.** `register-api` (`verify_jwt` false) and `register-invite`
  (true) are ACTIVE on `twuvscymudpnokzfsqoy`, each read back from the API and
  diffed byte-for-byte against the source here. All six functions are live —
  seven, with `delete-account` below.
- **2.5 / 6.6 — settled.** The GitHub Pages workflow is gone and the two dead
  Lovable migrations are in `supabase/archive/`.
- **Three Phase 5 gaps closed** — drag-to-reorder, orphaned storage objects,
  and account deletion that left the auth user behind.

Still true, and still blocking:

- **1.3 is in doubt** — see the note there. The source project for the storage
  copy is not on this Supabase account any more.
- **1.4** no `RESEND_API_KEY`, so every email path fails silently.
- **1.5** the project is on Free and pauses after about a week of no traffic.
- **Phase 3** the register still holds 52 placeholder trainees.

---

## Phase 0 — Decisions to make first

None of these are technical; every one of them changes the steps below.

| # | Decision | Why it has to come first |
|---|----------|--------------------------|
| 0.1 | **Which URL is the product.** A custom domain (e.g. `app.hsttraininghub.nhs.uk`) or the Netlify subdomain. | It goes into Supabase's redirect allow-list, every password-reset email and every QR code. Changing it later invalidates printed QR codes. |
| 0.2 | **Paid Supabase, or not.** | Free projects pause after ~7 days without traffic and cap uploads at 50 MB. A paused project is a dead site. See 1.5. |
| 0.3 | **Does the ENT register go live with the real cohort**, or start empty and be filled by organisers? | Decides whether Phase 3 is a data import or a five-minute setup. |
| 0.4 | **Who are the first admins**, by email. | Only three accounts exist today. |
| 0.5 | **Netlify or GitHub Pages** — pick one. | `.github/workflows/deploy-pages.yml` still publishes on every push to `main`. Two deployments of the same app drift and confuse users. |

---

## Phase 1 — Blockers

Each of these leaves a visible part of the site broken. Do them in order.

### 1.1 Merge the work into `main` — DONE (2026-09-08)

Nothing in the last two weeks is deployed anywhere. `main` is still the old
code: no registers, no rich-text notices, no Select mode, no upload fix.

```
# Merge PR #4 (dr-redragon/traineehq), or:
git checkout main
git merge --no-ff claude/teaching-register-traineehq-abk2cu
git push origin main
```

**Check:** open the production site, sign in, and look for **Teaching
Registers** under *Account* in the sidebar.

### 1.2 Deploy the two missing edge functions — DONE (2026-09-08)

Four of the six functions are live. **`register-api` and `register-invite` have
never been deployed**, and they are not optional: every register write goes
through them.

| Function | Deployed | What breaks without it |
|---|---|---|
| `contact-form-email` | ✅ | — |
| `zip-resources` | ✅ | — |
| `invite-user` | ✅ | — |
| `access-request-email` | ✅ | — |
| **`register-api`** | ❌ | QR check-in, feedback submission, publishing a teaching day, marking attendance, the feedback form editor — all fail |
| **`register-invite`** | ❌ | Adding a person to a register fails |

```
supabase link --project-ref twuvscymudpnokzfsqoy
supabase functions deploy register-api
supabase functions deploy register-invite
```

`supabase/config.toml` already records the right `verify_jwt` for each
(`register-api` is deliberately `false` — it authenticates each call itself,
because a trainee scanning a QR code has no account).

**Check:** `supabase functions list` shows all six ACTIVE. Then publish a
teaching day in a register and scan its QR code.

### 1.3 Copy the storage files

The `resources` bucket on this project holds **zero objects**, while **eleven
resource rows point at storage paths**. Every one of those files 404s on
download today.

```
SOURCE_SUPABASE_URL=https://<old-ref>.supabase.co \
SOURCE_SERVICE_ROLE_KEY=<old service role key> \
TARGET_SUPABASE_URL=https://twuvscymudpnokzfsqoy.supabase.co \
TARGET_SERVICE_ROLE_KEY=<this project's service role key> \
node scripts/migrate-storage.mjs --dry-run     # then re-run without --dry-run
```

Safe to re-run; it skips what is already there. Service-role keys bypass RLS —
pass them in the environment, never commit them.

**Check:** `select count(*) from storage.objects where bucket_id='resources'`
returns 11, and a file downloads from the app.

> **2026-09-08 — this step may no longer be possible, and it matters less than
> "0 / 11" suggests.**
>
> The Supabase account now holds one organisation and three projects —
> `DripDrop`, `ent-teaching-register` and `traineehq`. Neither old reference
> (`dvrzoglirpnoafjrobhn`, `6cec5550…`) is among them, so there is no source to
> copy from unless you can still reach that project by other means. Free
> projects are removed after a long enough pause, and the advice in 3.4 to keep
> the old projects around may simply have been overtaken.
>
> Against that: of the eleven rows, **nine are logo and favicon assets** —
> 16px through 1024px, plus an SVG — which are regenerable in minutes. Only two
> are real content: *HST Regional Teaching Program* (`.docx`) and
> *Maternity_Leave_Guidance_Northwestern_only* (`.doc`, 35 KB). If the source
> is gone, re-upload those two through the app and replace the logo rows; that
> is an afternoon's annoyance, not lost institutional knowledge.
>
> Either way, do not leave the rows pointing at files that are not there: a
> resource that 404s on download is worse than one that is absent.

### 1.4 Set the email credential

`RESEND_API_KEY` is not set on this project, so **every email path fails
silently**: user invites, access-request confirmations, the contact form.

Supabase dashboard → Edge Functions → Secrets → add `RESEND_API_KEY`
(optionally `CONTACT_FORWARD_TO`). Redeploy the functions afterwards so they
pick it up.

**Check:** invite yourself at a second address from Admin → Users and receive
the mail.

### 1.5 Decide the Supabase plan, and act on it

The organisation is on **Free**. For a tool people depend on that means:

- **The project pauses after about a week of no traffic.** A paused project is
  a completely dead site until someone restores it from the dashboard. This is
  the single biggest operational risk to going live on Free.
- **Uploads are capped at 50 MB per file** and the cap cannot be raised. The
  `resources` bucket no longer imposes any limit of its own (migration
  `20260907160000`), so upgrading and raising *Storage Settings → Global file
  size limit* is all that is needed — no code change.
- Storage, bandwidth and database size are all capped; check current figures on
  Supabase's pricing page before committing.

**Check:** Storage Settings shows the global limit you intend, and a file
larger than 50 MB uploads.

---

## Phase 2 — Domain, authentication and URLs

### 2.1 Point the domain at the site

Netlify → Domain management → add the custom domain, follow the DNS records,
wait for the certificate. `netlify.toml` already handles the rest: the
SPA fallback (`/*` → `/index.html`, status 200) so deep links like
`/registers/northwest-ent` resolve, plus `X-Robots-Tag: noindex` to keep a
private tool out of search results.

**Check:** load `https://<domain>/registers` directly in a fresh tab — not by
clicking through — and get the app, not a 404.

### 2.2 Tell Supabase Auth about that domain

Dashboard → Authentication → URL Configuration:

- **Site URL** → your production origin.
- **Redirect URLs** → add the production origin plus `/*`. If you keep using
  deploy previews, add `https://deploy-preview-*--<site>.netlify.app/*` too.

The app builds these links from `window.location.origin`
(`/reset-password`, `/registers` for invites), so an origin missing from the
allow-list makes password resets and invitations dead-end.

**Check:** run *Forgot password* on the production domain and follow the emailed
link all the way to a changed password.

### 2.3 Replace the default auth sender

Supabase's built-in email sender is rate-limited and explicitly not for
production. Configure custom SMTP (Resend works, using the key from 1.4) under
Authentication → Emails, and set a sender on a domain you control with SPF and
DKIM — NHS mail filters are unforgiving.

**Check:** invite three users in quick succession; all three arrive.

### 2.4 Turn on leaked-password protection

The security advisor flags this as the one genuine finding: Supabase can refuse
passwords found in HaveIBeenPwned breaches, and it is currently off.
Authentication → Providers → Email → enable it. Consider raising the minimum
password length at the same time.

The advisor's other ~25 findings are `SECURITY DEFINER` functions callable from
the API. Those are the deliberate design — they *are* the register's API, and
each one checks its caller (membership, or the session id for the two anonymous
paths). No action, but read the list once so you know what is exposed.

### 2.5 Settle the deployment story — DONE (2026-09-08)

Done: `.github/workflows/deploy-pages.yml` is removed. Netlify is the
deployment that actually serves this app — it runs the PR checks, and
`netlify.toml` carries the SPA fallback and the `noindex` header — so the
workflow was a second, drifting copy aimed at a branch that no longer exists.
Git history keeps it if the decision is ever revisited.

---

## Phase 3 — Real data and real people

### 3.1 Replace the placeholder cohort

The live ENT register holds **52 fabricated trainees** — "Alice Abbott",
"Brian Baker" — with 43 addresses at `example.invalid`. That was deliberate:
you asked for placeholders when the migrations were applied. They are safe
(`.invalid` is a reserved, undeliverable TLD, so no mail can ever reach a real
person) but they are not your cohort.

Either import the real register through Trainees & days, or replace the blob
directly and bump `register_stores.version`. Whichever route, the attendance
map, long-term status and excused absences must move with the names or the
report is meaningless.

**Check:** the register's report for the current academic year lists the people
you expect, with the totals you expect.

### 3.2 Create the real accounts

Only **three** accounts exist. Admin → Users → invite, then set each person's
role (trainee / facilitator / admin / super_admin) and, for facilitators, their
specialties.

### 3.3 Grant register access deliberately

Register membership is a **per-person grant, unrelated to TraineeHQ roles** — a
trainee may hold a register and an admin may hold none. From the register's
Users & access tab, admit the organisers who should run each teaching day. Both
existing accounts are currently `owner` of the ENT register; confirm that is
what you want.

**Check:** sign in as somebody with no membership. They should see the
directory, be able to request access, and see nothing inside any register.

### 3.4 Deal with the old projects

Do not delete the old Supabase projects until 1.3 is done and the new one has
been in real use for a while. `docs/OUTSTANDING.md` §2.3–2.4 lists which is
which, including one project reference (`efaexgqxdbcaykwhfwkn`) whose ownership
was never established — worth resolving before launch, since files may have
been served from it.

The old teaching register deployment (`register.traineehq.com`) should be frozen
and redirected once organisers are on the new one, and the legacy
`public.register_store` row dropped after its history is confirmed migrated.

---

## Phase 4 — Verify every level

Do this on the production domain, after Phases 1–3, in a browser with no saved
session. "It works for me as super_admin" tests almost nothing: the whole
authorisation model is row-level security keyed on role and membership.

### 4.1 Signed out

- [ ] `/` landing page loads; `/login` works.
- [ ] `/dashboard`, `/specialty/<id>`, `/admin`, `/registers` all bounce to login.
- [ ] `/request-access` submits and an admin receives the email.
- [ ] Contact form sends.
- [ ] Forgot password → email → reset → sign in with the new password.

### 4.2 Anonymous trainee at a teaching day

The only two pages deliberately outside the auth guard.

- [ ] Scan the QR code from a published session → `/registers/checkin?s=…` opens on a phone.
- [ ] Check in by name and grade; the organiser's screen shows the arrival.
- [ ] Feedback link → `/registers/feedback?s=…` submits.
- [ ] The link for one session exposes **only** that session — no other register, no roster.
- [ ] Confirm a stale or invented session id fails cleanly.

### 4.3 Trainee

- [ ] Dashboard shows their deanery's specialties only.
- [ ] Open a specialty: notice board renders, **bold/italic/underline/strikethrough** display correctly.
- [ ] Files: browse, open, download; **Select** reveals checkboxes, a single tap ticks an item, Select all appears only in Select mode, bulk download works.
- [ ] Discussions: post, reply, no pin/delete controls.
- [ ] Bookmarks, key contacts, profile edit.
- [ ] No sidebar link to Admin. `/admin` typed directly is refused.

### 4.4 Facilitator

- [ ] Can manage resources **only** in their assigned specialties.
- [ ] Upload a file, edit it, move it, delete it.
- [ ] Post and edit a notice.
- [ ] Another specialty's management controls are absent, and a direct URL does not grant them.

### 4.5 Admin / super_admin

- [ ] Admin panel: users, roles, specialties, subsections, deaneries, access requests, announcements.
- [ ] Invite a user end to end.
- [ ] Approve and refuse an access request.
- [ ] Admin → Attendance offers the link to the register directory (no iframe).
- [ ] super_admin can pin and delete discussions.

### 4.6 Register — non-member

- [ ] `/registers` lists registers; theirs are separated from the rest.
- [ ] Request access; the request appears for existing members.
- [ ] They can read nothing inside a register they do not hold.

### 4.7 Register — editor

- [ ] Attendance grid: mark, unmark, switch academic year.
- [ ] Trainees & days: add, edit, archive; CCT'd and out-of-programme trainees sit in their own hidden section.
- [ ] Long-term status: set maternity/sickness ranges; the attendance tab shows the specific status, not a generic "Leave".
- [ ] Excused absences: add per session, with a reason.
- [ ] Reports: select an academic year and generate; with no year selected, the warning appears; anyone with eligible sessions is included, maternity leave included.
- [ ] Live session: publish, QR renders, attendance arrives, mark someone manually.
- [ ] Feedback: per-question averages and comments; comments carry no identity.
- [ ] Two people editing at once both keep their changes (the version guard replays rather than clobbers).

### 4.8 Register — owner

- [ ] Admit and remove members; change a member's role.
- [ ] Approve and refuse access requests.
- [ ] Create a second register: pick a deanery you can create in, then a specialty; a duplicate for that deanery is refused with "request access instead".
- [ ] The logo returns to the TraineeHQ dashboard.

### 4.9 Cross-cutting

- [ ] **Phone.** Do 4.3 and 4.7 on a real handset. The register was built for this; the rest of the app deserves the check.
- [ ] **Deep links.** Paste `/registers/<slug>` into a fresh tab.
- [ ] **Sign out.** The next sign-in on the same tab shows the new user's data, never the previous user's.
- [ ] **Tenancy.** With two registers and two members, confirm neither can see the other's data.

---

## Phase 5 — Known gaps: fix, or launch knowingly

None of these stop a launch. All of them will be noticed.

**Register, not yet built**

- **Certificates.** Deliberately not ported: they need pdf-lib and a Resend
  sender, and the original template hardcodes "ENT Teaching Register" in its
  footer, which is wrong for every other register. Same for
  `email-feedback-link` and `chase-absences`.
- **The standalone door.** `/registers` renders its own shell, but a signed-out
  visitor is still sent to TraineeHQ's `/login`. The sign-in page offering both
  routes in — "Sign in with TraineeHQ" and a plain email/password form — is the
  remaining piece of Stage 9.

**Main app** (from `docs/OUTSTANDING.md` §3–4)

- ~~Drag-to-reorder resources is broken.~~ **Fixed 2026-09-08.** The ordering
  is now `planReorder()` in `src/lib/resourceOrdering.ts`, with 11 tests.
- Subheadings are local state and vanish on refresh until a file is assigned.
  **Still open** — needs a real table and a migration.
- ~~Storage objects are never deleted when a resource is deleted or replaced.~~
  **Fixed 2026-09-08** — `removeStoredFiles()` covers all four paths that lose
  a file. Note this stops *new* orphans; it does not sweep up existing ones.
- ~~Account deletion removes the profile but not the auth user.~~ **Fixed
  2026-09-08** — the `delete-account` edge function removes the auth user under
  the service role, taking the account from the verified JWT and never from the
  request body. It refuses to delete the last `super_admin`.
- "Watch discussion" has a dashboard widget but no way to watch anything.
- Password change has no re-authentication.
- Promised in the README, never built: dark-mode toggle, GDPR consent banner,
  audit log (the table exists, nothing writes to it), in-platform notifications.
  Privacy, terms and cookie links are all `href="#"` — for an NHS tool handling
  personal data, publish real ones before launch.

---

## Phase 6 — Operations

- [ ] **Backups.** Confirm the plan's backup schedule and take a manual
      `pg_dump` before cutover. Free tier backups are limited.
- [ ] **Run both advisors** (`security`, `performance`) once more after Phase 3
      and read the performance one — it catches missing indexes that only bite
      under real load.
- [ ] **Watch the logs** for the first week: Supabase → Logs (API, Auth, Edge
      Functions). Edge-function failures are silent from the user's side.
- [ ] **Information governance.** This holds NHS trainees' names, email
      addresses and health-related absence records (maternity, sickness). A DPIA
      and a named data controller are not optional, and the privacy policy has to
      exist and be accurate.
- [ ] **A named person** who knows how to unpause the project, rotate the Resend
      key, and restore a backup.
- [x] **Repository hygiene.** ~~`supabase/migrations/` still holds two
      migrations that target the old Lovable project.~~ **Done** — both are in
      `supabase/archive/`. This mattered more than tidiness: the first of them
      CREATEs `register_store` with `GRANT ... TO anon` and three `USING (true)`
      policies, so a `db push` would have added a world-readable, world-writable
      table to a project whose publishable key ships in every client bundle.

---

## The shortest possible path

If you want the site genuinely live today and are willing to accept Phase 5:

1. ~~Merge PR #4 to `main` (1.1).~~ **Done.**
2. ~~`supabase functions deploy register-api register-invite` (1.2).~~ **Done.**
3. Run `migrate-storage.mjs` (1.3) — **read the note there first; the source
   project may no longer exist.**
4. Set `RESEND_API_KEY` (1.4).
5. Upgrade off Free, or accept that the site dies after a quiet week (1.5).
6. Custom domain + Supabase redirect URLs (2.1, 2.2).
7. Replace the placeholder cohort (3.1) and invite the real users (3.2).
8. Walk Phase 4 on a phone.

Steps 1–4 are the ones without which parts of the site are simply broken.
1 and 2 are done; 3 is in doubt; **4 is the one still fully in your hands.**
