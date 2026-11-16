# Security

What protects a register, where each protection lives, and what is left to
whoever runs a deployment. To report a problem, write to the operator of the
deployment you are using; for the code itself, open a private advisory on the
repository.

## The model

A register holds names, email addresses and — for teaching programmes —
absence and leave records. The design assumes the browser is hostile: every
rule is enforced in Postgres or in an edge function, and the interface only
mirrors it.

| Threat | Protection | Where |
|---|---|---|
| Reading somebody else's register | Row-level security on every table, enabled **and forced**; a register is visible only to its members. No directory, no administrator read access. | migration: policies |
| A viewer or outsider changing data | No browser role holds insert/update/delete on register data. Writes go through `save_register()` (members with owner or editor role only) or the service-role functions, which re-check role per call. | migration; `register-api` |
| Calling server-only functions with the public key | Grants start from nothing: `revoke all` on every table and function, then an explicit allow-list. Check-in and feedback writers are service-role only. | migration: grants |
| Taking over a register with a forwarded invitation | Links are 244-bit random, single-use, expire in 14 days, and are replaced when re-sent. An **owner** invitation is honoured only for the invited, verified address. | `accept_register_invite()` |
| Using invitations to send mail to strangers | At most 50 outstanding per register; the email's recipient, link and wording come from the database row, never the request; every invitation is audit-logged. | `invite_to_register()`, `register-invite` |
| Faking a subscription | `subscriptions` is writable only by the service role. Its one writer verifies Stripe's HMAC signature over the raw body, in constant time, and refuses deliveries older than five minutes. | `stripe-webhook`, tested |
| Overwriting a colleague's edits | Optimistic concurrency: a save names the version it was built on and is refused if that has moved. Every replaced version is kept and can be restored by an owner. | `save_register()`, history |
| Storing junk or oversized data | A register document must be a JSON object under 4 MB; certificate designs under 4 KB; lists are length-capped and re-sanitised on every read. | migration; `constants.ts` |
| Abuse of the anonymous check-in link | Works only on the day (± one day); only for a session id that exists; self-added names are capped per register; feedback responses are capped against attendance. Feedback stores no identity. | `register-api`, `register_enrol_trainee()` |
| Script injection | React escapes all output; nothing uses raw HTML. A content security policy forbids inline and third-party script and limits connections to the one Supabase project. Emails escape organiser-written text. | `contentSecurityPolicy.ts` |
| Open redirects after sign-in | Destinations are same-origin paths only, validated; the native app accepts two URL shapes and ignores the rest. | `safeDestination.ts`, `nativeAuth.ts` |
| Stolen sign-in codes (native) | PKCE: the code is useless without the verifier held by the install that started sign-in. Sign-in runs in the system browser, never an embedded web view. | `signIn.ts`, `nativeAuth.ts` |
| Outbound links pointing somewhere hostile | Every link in an email and every Stripe return address is built from the `APP_BASE_URL` secret, never from the request. | `_shared/http.ts` |
| Passwords | There are none. Identity is Google, Apple or Microsoft, including their two-factor rules. | Supabase Auth |

Access changes, invitations, deletions and version restores are written to
`audit_log`, which no browser role can read or alter.

## Checked, and how

- `npm run verify:schema` applies the schema to a clean PostgreSQL and asserts
  the rules above as the `anon` and `authenticated` roles: non-members read
  nothing, viewers cannot write, editors cannot invite or promote themselves,
  a stranger cannot use an owner link, service-only functions are refused.
- `npm test` covers webhook signature verification (forged body, wrong secret,
  replay), the security policy, and the sanitising of lists and certificate
  designs.
- `npm audit --omit=dev` reports no known vulnerabilities at the time of
  writing.

## What this does not do

- **No independent review or penetration test.** The above is the author's own
  analysis and tests, run against plain PostgreSQL with stand-ins for
  Supabase's `auth` and `storage`, not against a live project.
- **No rate limiting by IP.** The anonymous endpoints are bounded by the
  limits above, not throttled. Put the site and the functions behind a rate
  limit (Supabase's, or a CDN's) before a large public launch.
- **Viewers see everything in a register**, including absence reasons. There is
  no role that hides sensitive columns.
- **Data at rest** is encrypted by Supabase's platform, not by this app, and
  whoever administers the Supabase project can read it.

## For whoever runs a deployment

- Keep the service-role key, Stripe keys and Resend key as function secrets
  only. Nothing prefixed `VITE_` is secret.
- In Supabase Auth, keep the redirect allow-list to your own addresses, and
  leave "allow manual linking" and anonymous sign-ins off.
- Turn on Supabase's leaked-password and MFA options for the dashboard
  accounts that administer the project.
