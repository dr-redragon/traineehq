# TraineeHQ / HST Training Hub — Codebase Evaluation

A complete map of the application as it stands, written as the reference for future
modifications. Every claim below was checked against the source; file:line references
point at the exact code.

Verified at evaluation time: `npm run build` succeeds, `npx tsc --noEmit` is clean,
`npm test` passes (1 trivial test), `npm run lint` reports **173 errors / 8 warnings**
(165 of them `no-explicit-any`).

---

## 1. What this is

A React SPA for NHS Higher Specialty Trainees: a per-deanery, per-specialty resource
library (Google-Drive-style file browser), key-contacts directory, discussion boards,
notice boards, and an admin panel. Supabase provides auth, Postgres, storage and edge
functions. It was generated and is still maintained through Lovable
(project `7e1e88ab-e5ad-4d8f-b52f-1ae9268547c1`, Supabase project `dvrzoglirpnoafjrobhn`).

**Stack:** React 18 + TypeScript + Vite (SWC) · Tailwind + shadcn/ui (Radix) ·
TanStack Query v5 · React Router v6 · dnd-kit · Supabase JS v2 · Deno edge functions ·
Vitest + Playwright (both essentially unused).

**Size:** ~20k lines. Roughly 3.5k is unmodified shadcn/ui boilerplate in
`src/components/ui/`, 1.2k is the generated `src/integrations/supabase/types.ts`,
and 1.5k is a standalone HTML app in `public/teaching-register.html`.

---

## 2. Boot sequence and routing

`index.html` → `src/main.tsx` → `src/App.tsx`.

`App.tsx` composes `QueryClientProvider` → `TooltipProvider` → `DeaneryProvider` →
two toasters (`sonner` **and** shadcn `Toaster` — both mounted; code uses `sonner`) →
`BrowserRouter`.

| Path | Component | Auth |
|---|---|---|
| `/` | `Landing` | public (embeds a sign-in card) |
| `/login` | `Login` | public |
| `/request-access` | `RequestAccess` | public |
| `/forgot-password` · `/reset-password` | `ForgotPassword` · `ResetPassword` | public |
| `/dashboard` | `Index` | **no guard** |
| `/specialty/:id` | `SpecialtyDetail` | **no guard** |
| `/community` | `CommunityHub` | **no guard** |
| `/profile` | `MyProfile` | **no guard** |
| `/admin` | `AdminPanel` | **no guard**, not even a role check |
| `*` | `NotFound` | — |

There is **no route protection anywhere in the app** — no `onAuthStateChange`
listener outside `ResetPassword.tsx:19`, no redirect-if-signed-out, no
`<ProtectedRoute>`. Signed-out users render the full dashboard/admin chrome with
empty data (RLS returns nothing). This is the single biggest structural gap.

`KeyContacts` is imported in `App.tsx:10` but **has no `<Route>`** — the page is
unreachable (the per-specialty "Key Contacts" tab in `SpecialtyDetail` is the only
contacts UI a user can reach).

---

## 3. Data model

`src/integrations/supabase/types.ts` is the generated source of truth. Only one
migration is in version control (`supabase/migrations/2026…_register_store.sql`);
**every other table, RLS policy, trigger and function was created in the Lovable/Supabase
dashboard and is not in this repo.** You cannot review or reproduce the security model
from the checkout — assume any RLS claim is unverified until read in the dashboard.

### Tables (24)

**Tenancy & identity** — `deaneries`, `profiles` (1:1 with `auth.users` via `user_id`),
`user_roles` (user × role × deanery), `trainee_specialties`, `facilitator_specialties`,
`access_requests`.

**Content** — `specialties` (self-referencing `parent_specialty_id`, `deanery_id`,
`icon_name`, `color`, `is_active`, `deleted_at` soft-delete) → `subsections` →
`resource_folders` + `resources`. Grouping inside a subsection is a **plain text
column** (`resources.subheading` / `resource_folders.subheading`), not a table.
Folders are one level deep — `resources.folder_id` exists, folder-in-folder does not.

**Engagement** — `discussions`, `discussion_comments` (self-referencing `parent_id`),
`discussion_votes`, `bookmarks`, `starred_contacts`, `watched_discussions`,
`specialty_notices`, `announcements`, `dashboard_preferences`.

**Directory** — `contacts` (category enum, `archived`, optional `specialty_id`/`deanery_id`).

**Unused by the app** — `teaching_sessions`, `attendance_records` (0 references;
superseded by the standalone register, §8), `audit_log` (0 references — the README
promises login/view/download auditing and **nothing writes to it**).
`register_store` is used only by `public/teaching-register.html`.

### Enums
`app_role`: super_admin | admin | facilitator | trainee ·
`resource_type`: pdf | document | video | link | presentation | checklist | folder ·
`contact_category` (8) · `request_status` · `attendance_status`.

### RPCs
`has_role`, `can_access_specialty`, `can_manage_resource`, `is_facilitator_for`
(used by RLS, not called from the client) and `get_profile_display_names` — the only
one the client calls, in `DiscussionBoard.tsx` and `SpecialtyNoticeBoard.tsx`.

---

## 4. Auth, roles, permissions

`src/hooks/useUserRole.ts`
- `useCurrentUser()` — wraps `supabase.auth.getUser()` in a query keyed `["current-user"]`.
  **Nothing invalidates it on sign-in/out**; the app relies on full page reloads
  (`AppSidebar` sign-out does `window.location.href = "/"`).
- `useUserRole()` — reads all `user_roles` rows and collapses to the highest of
  super_admin > admin > facilitator > trainee.
- `useCanManageSpecialty(id)` — admin/super_admin ⇒ true; facilitator ⇒ checks
  `facilitator_specialties`; trainee ⇒ false.

Editing is additionally gated behind a per-page **edit-mode switch**
(`SpecialtyDetail.tsx`, `canManage = hasEditRights && editMode`), which is a nice
guard against accidental drag-deletes.

**Role handling is inconsistent for `super_admin`:**
- `DiscussionBoard.tsx:236` — `isAdmin = role === "admin"`, so a super_admin cannot
  pin or delete posts.
- `MyProfile.tsx` re-implements the role query and never checks `super_admin`, so a
  super_admin's profile shows the "trainee" badge.
- `AppSidebar`/`AdminUsers` handle it correctly. Prefer `useUserRole()` everywhere.

`DeaneryContext` picks the active deanery from the user's profile, else the first
active deanery. Admins with >1 deanery get a switcher in the sidebar. Almost every
content query filters on `activeDeanery.id`.

---

## 5. Feature walkthrough

### Dashboard (`src/pages/Index.tsx`, 454 lines)
Announcements banner + a **user-customisable widget grid**: 1 or 2 columns,
drag-to-reorder and drag-between-columns via dnd-kit, per-widget show/hide, all
persisted to `dashboard_preferences` through `useDashboardPreferences.ts`
(new widgets are appended to a saved layout so they don't disappear for existing users —
a good detail). Widgets live in `src/components/dashboard/`:
`SpecialtiesWidget`, `FileBrowserWidget` (+ its settings dialog, remembers a default
specialty/section/folder), `BookmarksWidget`, `RecentResourcesWidget`,
`WatchedDiscussionsWidget`, `StarredContactsWidget`.

### Specialty detail (`src/pages/SpecialtyDetail.tsx`, 1083 lines)
Header (icon/colour from `specialties`) → edit-mode switch → `SpecialtyNoticeBoard` →
subsection tabs (drag-reorderable when editing, with scroll-affordance chrome) →
`DriveBrowser` per tab → "Key Contacts" tab → `DiscussionBoard`.

**Roughly 400 of its 1083 lines are dead** — leftovers from the pre-Drive UI that are
defined but never rendered or called: `handleNativeFileDrop`, `handleBulkDelete`,
`handleBulkDownload`, `handleCrossGroupDragEnd`, `handleResourceDragStart/Over`,
`getDropLabel`, `updateResourcePlacement`, `reorderResources`, `deleteResource`,
the selection state (`selectMode`, `selectedResourceIds`, `selectedFolderIds`) and the
"Add Subheading" dialog. `<BulkActionBar>` is still mounted but its count is now
permanently 0. Imports of `DroppableSubheadingGroup`, `ResourceFolder`,
`ResourceDragPreview`, `AddFolderDialog`, `AddResourceDialog`, `FileDropOverlay`,
`UploadProgressBar` are unused.

Correspondingly, `ResourceFolder.tsx` (380), `ResourceCard.tsx` (219),
`DroppableSubheadingGroup.tsx` (142), `SubheadingGroup.tsx` (136),
`BulkActionBar.tsx` (57) and `AddFolderDialog.tsx` (81) are **orphaned** — reachable
only from each other and from those dead imports. `EditResourceDialog` and
`ResourceViewer` are still live (used by `DriveRow`). ≈1,000 lines to delete.

### Drive browser (`src/components/drive/DriveBrowser.tsx` 1064 + `DriveRow.tsx` 353)
The current resource UI, per the plan in `.lovable/plan.md`. Files and folders in one
list, grouped under subheading headers; click-to-select with shift/ctrl ranges;
double-click or ⏎ to open a folder; right-click context menus; breadcrumb (subsection ›
folder) that doubles as a drop target for "move out of folder"; drag files/folders onto
folder rows or subheading zones to move; OS drag-and-drop upload with a full-area
overlay and progress bar; bulk download / move / delete; New ▸ upload / folder / subheading.

Known limitations of the rewrite:
- **Drag-to-reorder no longer works.** `SortableContext` is set up, but `handleDragEnd`
  only recognises `folder:`, `sub:` and `breadcrumb-root` targets and returns early for
  a drop on another row (`DriveBrowser.tsx:326-355`). `sort_order` is only ever set on
  create/move.
- **A new subheading is local state** (`manualSubheadings`), so it vanishes on refresh
  until a file is actually assigned to it. Same flaw as the old UI; the real fix is a
  `subheadings` table (or at least persisting the name on a placeholder row).
- Grid view, sort menu and in-section search from the plan were never built.
- Bulk operations are sequential per-row `await`s (N round-trips per delete/move).

### Contacts
`ContactCard` (star/unstar via `starred_contacts`, mailto link) used by the specialty
tab and by the unreachable `KeyContacts` page. `obfuscateEmail()` in `lib/contacts.ts:25`
**returns the address unchanged** — the README's "name [at] nhs.net" scraping protection
does not exist. `src/lib/contacts.ts` also still ships 12 hard-coded sample contacts with
invented names/emails and a category list whose keys (`associate-dean`,
`educational-supervisor`) don't match the DB enum (`associate_dean`, …).

### Discussions (`DiscussionBoard.tsx`, 568 lines)
Threaded posts + one level of replies, up/down votes, pin (admin/facilitator),
sort by recent/oldest/upvoted/discussed, author names via the `get_profile_display_names`
RPC. Notably: `DiscussionBoard.tsx:100` fetches **every row of `discussion_votes`
globally** with no filter — fine at 100 votes, not at 100k. `CommunityHub` likewise
pulls all `discussions` rows to count threads.

`watched_discussions` is **read-only in the app** — `WatchedDiscussionsWidget` displays
it and nothing anywhere ever inserts. The "watch a thread" button was never built.

### Admin panel (`AdminPanel.tsx` + `src/components/admin/*`)
Tabs: Users & Permissions · Content · Contacts · Announcements · Requests · Attendance ·
Specialties · Deaneries. Highlights:
- `AdminUsers` (573) — role legend, search/deanery/specialty filters, invite via the
  `invite-user` edge function, and a permissions dialog (deanery + role + per-specialty
  assignment). `updateRole` performs 5–6 sequential unbatched writes with no transaction;
  a mid-way failure leaves the user role-less.
- `AdminSpecialties` (736) — create, clone-from-another-deanery, icon/colour picker,
  reorder, soft delete with a 30-day trash + restore + purge (purge also deletes
  storage objects in chunks of 100). Note the **auto-purge DELETE runs inside the read
  query's `queryFn`** on every load.
- `AdminContent` — a second, simpler resource editor that duplicates
  `AddResourceDialog`/`EditResourceDialog` (no file upload, different fields).
- `AdminAttendance` (26 lines) — an `<iframe>` of `/teaching-register.html` with a very
  permissive `sandbox` (`allow-same-origin` + `allow-scripts` + `allow-top-navigation-by-user-activation`).

---

## 6. Storage, viewing and downloads

Upload path convention: `resources/{specialtyId}/{subsectionId}/{uuid}.{ext}`, with the
**bare storage path** written to `resources.file_url` (legacy rows may hold a full public
URL — `lib/storageUtils.ts` normalises both).

- `getSignedResourceUrl()` — 1-hour signed URL; external URLs pass through.
- `ResourceViewer.tsx` — YouTube embed, `<video>`, `<object type=application/pdf>` with a
  Google `gview` iframe fallback, generic iframe otherwise. **Office files (and PDFs on
  the fallback path) send the signed Supabase URL to `docs.google.com/gview`** — i.e. NHS
  training material is handed to a third party, contradicting the "not shared with third
  parties" copy on the profile page.
- `lib/resourceDownloads.ts` — single files download through the SDK into a Blob and save
  via a same-origin `blob:` URL (this is what makes downloads work in Safari and inside
  the Lovable preview iframe; there's a Safari-only pre-opened popup for the ZIP case).
  Bulk/folder downloads POST to the `zip-resources` edge function. The Safari/iframe
  handling here is the most carefully engineered code in the repo — don't "simplify" it.

**Storage is never garbage-collected.** Deleting a resource (`DriveBrowser`,
`AdminContent`) or replacing its file (`EditResourceDialog`) deletes/orphans only the
row; the object stays in the bucket forever. Only `AdminSpecialties.purgeSpecialty`
removes objects.

---

## 7. Edge functions (`supabase/functions/`)

| Function | Auth check in code | Notes |
|---|---|---|
| `invite-user` | ✅ verifies caller's JWT, requires admin, blocks non-super_admins minting super_admins | Creates the auth user, sets roles/profile, emails a recovery link via Resend. The best-written function here. |
| `zip-resources` | ✅ requires `Authorization`, calls `auth.getUser()`, downloads under the caller's RLS | Streams storage objects into a JSZip, returns `Content-Disposition: attachment`. |
| `access-request-email` | ❌ **none** | Accepts `{type}`; `type:"approved"` **creates an auth user, assigns a specialty, sets the deanery and emails a password-set link** to any address in the payload. |
| `contact-form-email` | ❌ **none** | Forwards arbitrary `message` HTML to a hard-coded personal Gmail and sends a "confirmation" to any address the caller names. |
| `_shared/cron-auth.ts` | — | Generated helper; not imported by any function. |

`supabase/config.toml` contains only `project_id`, so per-function `verify_jwt` is
configured outside version control. The public Request Access flow calls
`access-request-email` while signed out, which only works if JWT verification is **off**
for it — in which case both unauthenticated functions are callable by anyone who has the
publishable key (which ships in the client bundle). Treat this as the top security item:
`access-request-email` is a user-creation endpoint, and `contact-form-email` is an open
email relay with unescaped HTML interpolation.

---

## 8. The teaching register (`public/teaching-register.html`, 1555 lines)

A completely separate vanilla-JS + CDN application (QRCode.js, supabase-js UMD) served as
a static file and iframed into the admin panel. It tracks named trainees, per-session
attendance and grade, plus status records including **maternity leave, OOP, CCT and
inter-deanery transfers**. It hard-codes the Supabase URL and publishable key
(lines 484-485) and stores the entire dataset as one JSON blob in
`register_store` row `id='default'`.

The only migration in the repo grants that table `SELECT/INSERT/UPDATE` to **`anon`**
with `USING (true)` policies. Anyone with the publishable key — which is in every shipped
bundle — can read or overwrite the whole attendance database, unauthenticated. Saving is
a whole-blob `upsert`, so two concurrent editors silently clobber each other. This
duplicates the unused `teaching_sessions` / `attendance_records` tables that already
exist with proper structure.

---

## 9. Bugs found (ranked)

**Security / privacy**
1. `register_store` RLS is world-readable and world-writable for special-category
   personal data (§8).
2. `access-request-email` will create accounts for anyone who can call it (§7).
3. `contact-form-email` is an unauthenticated relay with HTML injection into the mail
   body (`index.ts:41`, `:65`).
4. No client-side auth or role guard on any route, `/admin` included (§2).
5. Signed storage URLs are handed to Google's viewer (§6).
6. `.env` is committed (publishable key + project URL only, but it is not in `.gitignore`).
7. `GlobalSearch` interpolates raw user input into PostgREST `.or()` filters
   (`GlobalSearch.tsx:47,74,86`); a comma or parenthesis breaks or rewrites the filter.

**Correctness**
8. `AdminAnnouncements` never sets `deanery_id`, but `Index.tsx:114` filters
   announcements by the active deanery ⇒ **every announcement an admin creates is
   invisible on the dashboard.** (`AdminContacts` likewise never sets `deanery_id`.)
9. Soft-deleted specialties stay visible: `deleteSpecialty` sets `deleted_at` but no
   query outside `AdminSpecialties` filters on it, and `is_active` is left `true`, so a
   "trashed" specialty still appears in the sidebar, dashboard and community hub for
   30 days.
10. `AddResourceDialog.tsx:188-199` — choosing "No subheading" stores the literal string
    `"none"` as a subheading (the bulk-upload path at :90 handles this; the single-resource
    path does not), creating a phantom "none" group.
11. `EditResourceDialog.tsx:104` uploads replacements to `{subsectionId}/{uuid}.{ext}`,
    missing the `{specialtyId}/` prefix every other writer uses; it also doesn't update
    `file_size`.
12. Drag-to-reorder is silently gone from the Drive browser (§5).
13. "Watch discussion" has a widget but no way to watch anything (§5).
14. `KeyContacts` is unreachable (§2).
15. `MyProfile` delete-account (`:159-164`) and `AdminUsers` delete-user (`:218-222`)
    delete only the `profiles` row — the auth user, roles, bookmarks, posts and uploads
    all survive, and the "deleted" user can still sign in. The GDPR copy on that page
    promises otherwise, and "Download My Data" exports only the profile row.
16. `AdminUsers` delete has **no confirmation dialog** — one click destroys a user row.
17. `MyProfile` declares `currentPassword` state and never uses it; the password change
    has no re-authentication step.
18. Profile email edits update `profiles.email` only, diverging from the auth email used
    to sign in.

**Spec gaps vs. `README.md`**
Dark-mode toggle (the `.dark` palette and `next-themes` are present, nothing toggles) ·
GDPR consent banner (`profiles.gdpr_consent_at` exists, no UI) · audit log ·
in-platform notifications · email obfuscation · privacy/terms/cookie links are all `href="#"` ·
checklist resources are a type with no interactive UI.

**Performance / maintainability**
Unfiltered global fetches (`discussion_votes`, `discussions`) · sequential per-row writes
for every bulk action and reorder · a single 1.09 MB JS bundle (no code splitting) ·
165 `any` casts (most of them `(r as any).folder_id` etc., because the generated types are
correct but were bypassed) · ~1,000 lines of dead code · two lockfiles where
`package-lock.json` is stale (`npm ci` fails; only `bun.lock` is current) ·
`playwright.config.ts` imports `lovable-agent-playwright-config`, which is **not in
`package.json`** · one placeholder test.

---

## 10. Working on this codebase

**Conventions that are load-bearing**
- Server state goes through TanStack Query; there is no client state library. Query keys
  are prefix-based and invalidation relies on it: `["resources"]`, `["resource-folders"]`,
  `["subsections", specialtyId]`, `["specialty-notices", id]`, `["admin-*"]`.
  Invalidating `["resources"]` refreshes every resource list in the app.
- All writes go straight from the browser to Supabase; **RLS is the only authorisation
  boundary**. Client-side `canManage` checks are UX, not security. Any new table needs
  policies added in the dashboard — and ideally a migration committed here.
- Colours are HSL triples in CSS variables (`174 60% 40%`), used as
  `hsl(${color} / 0.12)`. Never hard-code hex; use the semantic Tailwind tokens
  (`bg-card`, `text-muted-foreground`, `border-border`) so dark mode can be switched on later.
- Icons are stored as string names in `specialties.icon_name` and resolved through
  `lib/iconMap.ts` (`getIcon`); to add one, import it and add it to the map.
- New Supabase columns/tables require regenerating `src/integrations/supabase/types.ts`;
  the file says "do not edit directly" and means it. The `(x as any)` casts scattered
  around are stale-type workarounds, not a pattern to copy.
- `src/integrations/supabase/client.ts` and `previewAuthStorage.ts` are Lovable-generated
  (the postMessage session broker is what keeps preview surfaces logged in). Leave them alone.

**Suggested order of work**
1. Lock down `register_store` and the two unauthenticated edge functions; add
   `verify_jwt` config to `supabase/config.toml` so it is reviewable.
2. Add a `RequireAuth` / `RequireRole` route wrapper and wire sign-out to invalidate
   `["current-user"]` instead of reloading the page.
3. Fix the announcement `deanery_id` bug and the soft-delete visibility bug — both are
   invisible-to-the-admin data bugs.
4. Delete the dead Drive-era code and its orphaned components (≈1,000 lines) before any
   refactor, so future changes aren't made in the wrong file.
5. Make account deletion actually delete (an edge function using the service role), and
   make data export cover bookmarks/posts/roles.
6. Fold the teaching register into the app using `teaching_sessions` /
   `attendance_records`, or delete those tables.
7. Persist subheadings, restore drag-to-reorder, and batch the bulk mutations.
8. Commit migrations for the existing schema and RLS so the security model is reviewable
   from the repo.
