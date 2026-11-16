# The Register

Attendance registers people sign themselves: a QR code on the screen, check-in
on a phone, feedback, and a certificate by email. Organisers get the attendance
grid, the report, and colleagues they can invite to run it with them.

It is the teaching register from TraineeHQ, split out as a product of its own:
its own accounts, its own database, and a paid plan.

| | Event register | Regular register |
|---|---|---|
| For | One conference, course or study day (up to 7 days) | Teaching that runs all year |
| Price | Free | Subscription |
| Check-in, feedback, certificates | Yes | Yes |
| Collaborators (owner / editor / viewer) | Yes, free | Yes, free — only the owner pays |
| Certificate templates, own lists of grades and absence reasons | Yes | Yes |
| Attendance rates, long-term leave and status | — | Yes |

## How it fits together

- **Frontend** — Vite, React, TypeScript, Tailwind. A static site; deploy
  anywhere (`netlify.toml` and `vercel.json` are included). The same build is
  wrapped with Capacitor for the App Store and Google Play — see below.
- **Backend** — one Supabase project: Postgres with row-level security, Auth,
  Storage for certificate logos, and seven edge functions.
- **Sign-in** — Google, Apple and NHSmail, through Supabase Auth. No passwords.
- **Payments** — Stripe Checkout and the Stripe billing portal. A webhook is
  the only thing that can mark an account as subscribed.
- **Email** — Resend, for invitations, feedback links and certificates.
  Optional: without it invitations still work as copyable links.

### The rules that matter, and where they live

All of them are enforced in the database (`supabase/migrations`), not the
browser:

- **Plans.** `create_register()` refuses a regular register to an account with
  no subscription. `save_register()` refuses an event register that spans more
  than `register_event_max_days()` days.
- **Lapsing.** A regular register is writable while *any of its owners* is
  subscribed. When none is, it becomes read-only — still readable, exportable
  and deletable, nothing destroyed — until an owner subscribes again.
- **Access.** You see a register because you created it or accepted an
  invitation. There is no directory of other people's registers and no
  administrator who can read them.
- **Roles.** Owner (everything, including who has access), editor (read and
  write), viewer (read only). `save_register()` and the edge functions refuse
  a viewer's writes; the interface only hides the controls.
- **Invitations.** An owner invites an email address. The invitee is added
  when they sign in with that address, or when they open the emailed link and
  sign in with any account (needed for Apple's "hide my email"). Links are
  single-use and last 14 days. An *owner* invitation is the exception: it
  works only for the address it was sent to, so a forwarded link cannot hand
  over a register.
- **Anonymous check-in.** An attendee has no account; the session id in the
  QR link is their whole authority and opens that one day only.

## Setting up

You need a Supabase project, and for the paid plan a Stripe account. Use a
**dedicated** Supabase project: the migration resets grants across the
`public` schema.

### 1. Database

```sh
npm install
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push
```

### 2. Sign-in providers

In Supabase → Authentication → URL configuration, set the Site URL to your
deployed address and add `https://YOUR-SITE/auth/callback` (and
`http://localhost:8080/auth/callback`) to the redirect URLs. Then under
Providers:

- **Google** — an OAuth client from Google Cloud Console.
- **Apple** — a Services ID and key from an Apple Developer account (paid
  membership). The client secret Apple issues expires every six months.
- **NHSmail** — enable the **Azure** provider. See below.

#### What "NHS sign-in" is here

The button signs people in with their **NHSmail (nhs.net) Microsoft account**,
using Supabase's Azure (Microsoft Entra) provider. It is not *NHS login* (the
patient identity service) and not *CIS2* (smartcard staff identity): both
require onboarding with NHS England, and NHS login is not for staff tools.

Register an app in Microsoft Entra, then choose one of:

- **NHSmail only** — set the Azure Tenant URL in Supabase to the nhs.net
  tenant. Only nhs.net accounts get in.
- **Any work or school account** — leave the tenant as `common`. This also
  admits trusts that run their own Microsoft tenant (`@trust.nhs.uk`), which
  many do.

**Check this first, before anything else.** The NHSmail tenant restricts which
third-party apps its users may consent to. If a test sign-in shows "Need admin
approval", the app has to be approved by the NHSmail team before any nhs.net
user can use this button. Google and Apple are unaffected. To hide the button
meanwhile: `VITE_SIGN_IN_PROVIDERS=google,apple`.

### 3. Stripe

1. Create a product with one recurring price; note the price id (`price_…`).
2. Settings → Billing → Customer portal: switch it on.
3. Add a webhook endpoint at
   `https://YOUR-PROJECT.supabase.co/functions/v1/stripe-webhook` for
   `checkout.session.completed` and `customer.subscription.created`,
   `.updated`, `.deleted`. Note its signing secret (`whsec_…`).

### 4. Function secrets and deploy

```sh
npx supabase secrets set \
  APP_BASE_URL=https://YOUR-SITE \
  STRIPE_SECRET_KEY=sk_live_… \
  STRIPE_PRICE_ID=price_… \
  STRIPE_WEBHOOK_SECRET=whsec_… \
  RESEND_API_KEY=re_… \
  RESEND_FROM="The Register <noreply@your-domain>"

npx supabase functions deploy
```

`APP_BASE_URL` matters: every link in an outbound email and every Stripe
return address is built from it, never from the request.

### 5. Frontend

```sh
cp .env.example .env    # fill in the Supabase URL and publishable key
npm run dev             # http://localhost:8080
npm run build           # static site in dist/
```

### Giving an account the plan for free

```sql
insert into public.subscriptions (user_id, status)
values ('<auth user id>', 'comp')
on conflict (user_id) do update set status = 'comp';
```

The webhook never overwrites a `comp` row.

## Checking it

```sh
npm test               # 347 unit tests: attendance rules, reports, certificates, lists, webhook signatures
npm run typecheck
npm run lint
npm run verify:schema  # applies the migration to a throwaway PostgreSQL 16 and
                       # asserts the plan, invitation and access rules
```

`verify:schema` needs the PostgreSQL 16 server binaries and no credentials.

## App Store and Google Play

The store apps are this same web app inside a native shell (Capacitor). The
code for that is here; the native projects are generated on your machine, and
building for iOS needs a Mac with Xcode.

```sh
# .env for a store build needs two more lines:
#   VITE_PUBLIC_URL=https://YOUR-SITE      (QR codes and invitation links must
#                                           point at the website, not the app)
#   VITE_NATIVE_SCHEME=theregister         (must match the scheme below)
npm run build
npx cap add ios        # once
npx cap add android    # once
npx cap sync           # after every build
npx cap open ios       # or: npx cap open android
```

Before the first `cap add`, change `appId` in `capacitor.config.ts` to an
identifier you own. It cannot be changed after publishing.

**Register the sign-in return address.** Sign-in opens in the system browser
and comes back to `theregister://auth/callback`:

- Supabase → Authentication → URL configuration: add
  `theregister://auth/callback` to the redirect URLs.
- iOS, `ios/App/App/Info.plist`:
  ```xml
  <key>CFBundleURLTypes</key>
  <array><dict>
    <key>CFBundleURLSchemes</key><array><string>theregister</string></array>
  </dict></array>
  ```
- Android, inside the main `<activity>` in
  `android/app/src/main/AndroidManifest.xml`:
  ```xml
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="theregister" />
  </intent-filter>
  ```

**What is already done for review:**

| Store requirement | Status |
|---|---|
| Sign in with Apple offered wherever other sign-ins are (Apple 4.8) | Done |
| Account deletion inside the app (Apple 5.1.1(v), Google Play) | Done — Account page |
| Account deletion reachable on the web (Google Play) | Done — `/account` on the site |
| Privacy policy URL | `/privacy` — fill in the operator details |
| Sign-in in the system browser, not an embedded web view | Done |
| No remotely loaded code; content security policy | Done |
| Notch and home-indicator safe areas | Done |
| Certificates and CSV exports open the system share sheet | Done |

**Payments — read this before submitting.** Both stores require digital
subscriptions sold *inside* an app to use their own billing (and take their
commission), and do not let an app send people to a website to pay. So the
store builds **sell nothing**: the subscribe button, prices and "manage
billing" are removed, and a regular register simply shows as not in the plan.
A subscription bought on the website works in the app. That is the
arrangement Apple and Google accept for apps like this, and it is the default.

To sell inside the apps you would add StoreKit and Play Billing (RevenueCat is
the usual route) and have its webhook write `subscriptions.status` exactly as
the Stripe one does — nothing else in the database changes. Not built.
`VITE_NATIVE_PURCHASES=external` restores the Stripe button in a native build,
for storefronts where linking out is permitted; do not set it without
checking the current rules for that storefront.

**Not verified here:** no iOS or Android build has been run. The Android
project generates cleanly from this config; nothing has been compiled, signed
or run on a device, and no store submission has been attempted. Icons, splash
screens, screenshots and store listings are yours to add (`@capacitor/assets`
generates the icon sets from `public/icon-512.png`).

## Before you go live

Not done, and yours to decide:

- **Nothing here has run against real Supabase, Stripe or provider accounts.**
  The schema is verified against plain PostgreSQL with stubs for Supabase's
  `auth` and `storage`; the edge functions are syntax-checked only. Do one full
  pass in Stripe test mode: subscribe, create a regular register, cancel, and
  confirm it goes read-only.
- **Privacy notice and terms** (`src/pages/Legal.tsx`) describe what the
  software does and are a starting point, not legal advice. Set
  `VITE_OPERATOR_NAME` and `VITE_CONTACT_EMAIL`, and have them checked. You
  are the data controller for accounts; register owners for their attendees.
- **Price and trial.** Set on the Stripe price; nothing in the code assumes one.
- **Free-tier limits.** A free account can create any number of event
  registers. If that is abused, cap it in `create_register()`.
- **Light and dark** follow the device; there is no in-app switch.

## Moving this into its own repository

This directory is self-contained. From the parent repository:

```sh
git subtree split --prefix=register-app -b the-register
git push git@github.com:YOU/the-register.git the-register:main
```
