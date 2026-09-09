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
- **1.4b** the key works, but the sender is still Resend's shared testing
  address, so mail reaches nobody but the Resend account owner.
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

### 1.4 Set the email credential — **done**, but see 1.4b

`RESEND_API_KEY` is set on the project and verified working: a contact-form
enquiry, an access-request confirmation and a certificate with a PDF attachment
were all delivered on 9 Sep. No redeploy was needed — functions pick the secret
up on their next boot.

Optionally also set `CONTACT_FORWARD_TO`, which decides where contact-form
enquiries land; it currently falls back to an address baked into the source.

### 1.4b Send from `traineehq.com`, and set the two secrets

**This is what still stops email reaching real people.** All five mailing
functions send from `onboarding@resend.dev`, Resend's shared testing sender, and
with no verified domain Resend refuses every recipient except the Resend
account's own address — not even a plus-alias of it — with:

> 403 validation_error: You can only send testing emails to your own email
> address. To send emails to other recipients, please verify a domain at
> resend.com/domains, and change the `from` address to an email using this
> domain.

Confirmed live against `invite-user`, `register-invite`, `contact-form-email`
and `access-request-email`. The HTTP call succeeds and the send does not, so it
fails quietly unless somebody reads the logs — `invite-user` and
`register-invite` at least return `email_sent: false`.

**The domain is `traineehq.com`** — the one the ENT teaching register is served
from (`register.traineehq.com`, per that repo's `CNAME`). Its DNS is at
Cloudflare. That repo's `docs/SETUP.md` §2 already worked this case out, and
it applies here unchanged:

- `traineehq.com` already carries **iCloud custom-domain mail** — MX at
  `mx01`/`mx02.mail.icloud.com` and a root `v=spf1 include:icloud.com ~all`.
  **Do not touch either.**
- Resend's records land elsewhere and coexist with it: its own MX and SPF TXT on
  a `send.traineehq.com` subdomain, and a DKIM key on
  `resend._domainkey.traineehq.com`. Neither is the root MX or the root SPF.
- **Grey-cloud (DNS only) any CNAME** among them. Cloudflare proxies new CNAMEs
  by default and that breaks verification. TXT and MX are never proxied.
- If there is no `_dmarc.traineehq.com` yet, `v=DMARC1; p=none;` is safe to add
  and affects neither iCloud sending nor receiving.

Then, in Supabase → Edge Functions → Secrets:

| Secret | Value | Why |
|---|---|---|
| `RESEND_FROM` | `HST Training Hub <no-reply@traineehq.com>` | The sending identity. The mailbox does not need to exist. A root-domain address is fine even though the return path lives on `send.` — DMARC passes on DKIM alignment with the root, which is what Resend signs. |
| `RESEND_REPLY_TO` | a real mailbox you read | Where replies go. **A reply-to is not a sender**, so this can be an NHS or Gmail address on any domain. Without it, anyone replying to a certificate or an invitation is writing to `no-reply@`, which bounces. |

All five functions read both, and fall back to the current behaviour when unset,
so this is two secrets and no code change — and no redeploy, since secrets are
read on the next call.

**If the ENT register already verified `traineehq.com`** in the same Resend
account, the DNS work is done and only the two secrets are left.

**Volume, on Resend's free tier:** 100 emails/day, 3,000/month, 2 requests a
second. A teaching day of thirty certificates fits; two big days in one calendar
day would not. Note that unlike the ENT register's sender, these functions do
not space out or retry a rate-limited send — a bulk push is not something they
currently do, but it is worth knowing before one is added.

**Check:** invite yourself at a second address from Admin → Users and receive
the mail. `email_sent` comes back `true`.

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

- ~~**Certificates.**~~ **Built 2026-09-08, design ported 2026-09-09.** The
  layout is the standalone register's — paper, moss and gold border, the gold
  rule, the reference line — with the eyebrow and footer built from the register
  instead of naming ENT. Each register uploads its own badge (owners only, from
  the access page), or goes without, in which case the composition re-centres
  rather than leaving the badge's space empty. Downloading works today; emailing
  goes through `register-certificate` (deployed) and needs `RESEND_API_KEY`.
  `email-feedback-link` and `chase-absences` are still not ported.
- ~~**The standalone door.**~~ **Built 2026-09-08** at `/registers/sign-in`,
  offering both routes in against the same Supabase Auth. Verified in a browser:
  `/registers` and `/registers/:slug` land there, `/dashboard` still goes to
  TraineeHQ's login. Deep links now survive the round trip, which they never did.

**Main app** (from `docs/OUTSTANDING.md` §3–4)

- ~~Drag-to-reorder resources is broken.~~ **Fixed 2026-09-08.** The ordering
  is now `planReorder()` in `src/lib/resourceOrdering.ts`, with 11 tests.
- ~~Subheadings are local state and vanish on refresh.~~ **Fixed 2026-09-08** —
  `resource_subheadings` is now the list, with access mirroring
  `resource_folders`, a backfill of everything already named, and a way to
  remove an empty one (persistence without removal would only trade one
  annoyance for another).
- ~~Storage objects are never deleted when a resource is deleted or replaced.~~
  **Fixed 2026-09-08** — `removeStoredFiles()` covers all four paths that lose
  a file. Note this stops *new* orphans; it does not sweep up existing ones.
- ~~Account deletion removes the profile but not the auth user.~~ **Fixed
  2026-09-08** — the `delete-account` edge function removes the auth user under
  the service role, taking the account from the verified JWT and never from the
  request body. It refuses to delete the last `super_admin`.
- ~~"Watch discussion" has a dashboard widget but no way to watch anything.~~
  **Fixed 2026-09-08** — an eye toggle on each thread. The table and its unique
  constraint were already there; only the control was missing.
- ~~Password change has no re-authentication.~~ **Fixed 2026-09-08** — the form
  asks for the current password and re-authenticates first, against the *auth*
  email rather than the profile one, since those can diverge. Without it,
  anyone finding an unlocked screen could take the account permanently.
- **Still open:** editing your profile email diverges from the auth email you
  sign in with. Related to the above and deliberately left: reconciling them
  means an email-change confirmation flow, not a patch.
- ~~Dark-mode toggle.~~ **Built 2026-09-08.** Everything was already present and
  unreachable — next-themes, `darkMode: ["class"]`, a complete `.dark` palette —
  bar a provider and a control. Verified in a real browser in both themes.
- ~~Audit log (the table exists, nothing writes to it).~~ **Built 2026-09-08**,
  and it turned up a hole: `anon` and `authenticated` both held **TRUNCATE** on
  `audit_log`, and TRUNCATE is not filtered by row-level security, so any
  signed-in caller could have emptied the trail no matter what the policies
  said. Writes now happen in `SECURITY DEFINER` triggers, so entries are made
  whether or not the client cooperates; clients can only read. Verified as the
  `authenticated` role: INSERT, UPDATE, DELETE and TRUNCATE all refused with
  42501, SELECT still allowed. Admins read it under **Admin → Audit Log**.
- ~~GDPR consent banner.~~ **Built 2026-09-08**, and it says "I understand"
  rather than "I consent" on purpose — consent is the wrong lawful basis for a
  tool people have to use, so it records that somebody was told rather than
  pretending to a permission that was never optional. **Which basis actually
  applies is still yours to determine, with the DPIA (6.4).**
- Still promised and not built: in-platform notifications.
- Privacy, terms and cookie links are **still not live**, and the reason is
  unchanged: the missing part is the policies, not the markup. They now route
  through one `PolicyLink` component reading three constants in `src/lib/legal.ts`
  and render as plain text until a URL is set — a dead link that looks live tells
  the reader a document exists. **Publish the policies, set the three constants,
  and every link in the application lights up at once.** Ties to 6.4.

---

## Phase 6 — Operations

- [ ] **Backups.** Confirm the plan's backup schedule and take a manual
      `pg_dump` before cutover. Free tier backups are limited.
- [x] **Run both advisors.** Both were run on 2026-09-08. The performance one
      had never been read, and it was right to: **22 foreign keys had no
      covering index**, all now added by migration `20260908162406`
      (0 unindexed remaining, verified). Three findings were deliberately *not*
      acted on:
      - *13 "unused index"* — every index here is unused, because the app has no
        users yet. Dropping them would read "nobody has run the app" as "nobody
        needs this". Re-read after a term of real traffic.
      - *16 "multiple permissive policies"* — merging permissive policies changes
        what the authorisation boundary permits, and RLS is the only one this
        app has. Not worth it to save an evaluation on tables of tens of rows.
      - *57 "auth RLS init plan"* — real, and the one worth doing later: policies
        call `auth.uid()` per row instead of once. The fix is mechanical
        (`auth.uid()` → `(select auth.uid())`) but it rewrites every policy in
        the app, so it wants `scripts/verify-register-schema.sh` run over it
        rather than a quick pass. Harmless at today's data sizes.
- [ ] **Re-run both advisors after Phase 3**, once there is real data and
      traffic — the "unused index" list only means something then.
- [ ] **Watch the logs** for the first week: Supabase → Logs (API, Auth, Edge
      Functions). Edge-function failures are silent from the user's side. Checked
      on 2026-09-08 and the function log is empty — nothing has invoked them yet,
      which is expected and is also why this check cannot be done early. Three
      functions went live for the first time that day, so the first week of real
      traffic is the one that matters.
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
      **One wrinkle remains, and it is safe:** the eight register migrations in
      the repo carry timestamps that do not match the versions actually recorded
      in the database (repo `20260907090000` vs applied `20260907055054`, and so
      on), so `db push` would try to re-apply them. They are written to be
      idempotent and `scripts/verify-register-schema.sh` applies each twice to
      prove it — including the seed, which explicitly refuses to overwrite a
      register that already holds data. Only `20260908162406` matches on both
      sides. Worth reconciling one day; not worth a rewrite now.

---

## The shortest possible path

If you want the site genuinely live today and are willing to accept Phase 5:

1. ~~Merge PR #4 to `main` (1.1).~~ **Done.**
2. ~~`supabase functions deploy register-api register-invite` (1.2).~~ **Done.**
3. Run `migrate-storage.mjs` (1.3) — **read the note there first; the source
   project may no longer exist.**
4. Verify `traineehq.com` in Resend, set `RESEND_FROM` and `RESEND_REPLY_TO` (1.4b).
5. Upgrade off Free, or accept that the site dies after a quiet week (1.5).
6. Custom domain + Supabase redirect URLs (2.1, 2.2).
7. Replace the placeholder cohort (3.1) and invite the real users (3.2).
8. Walk Phase 4 on a phone.

Steps 1–4 are the ones without which parts of the site are simply broken.
1 and 2 are done; 3 is in doubt; **4 is the one still fully in your hands.**
