# Archived migrations

These two migrations are kept for the record and are **deliberately outside
`supabase/migrations/`** so that `supabase db push` never runs them.

Both target `public.register_store` — the single-row table behind the old
`public/teaching-register.html`, which lived on a **different Supabase project**
(`dvrzoglirpnoafjrobhn`). The application no longer reads or writes that table,
and it does not exist on the project this repository now points at
(`twuvscymudpnokzfsqoy`), whose register data lives in `register_stores`
(plural) instead.

Leaving them in the migrations directory was actively unsafe, not merely untidy:

- `20260828113809_…` **creates** `register_store` with `GRANT … TO anon` and
  three `USING (true)` policies. Applied to the current project it would add a
  table that anyone holding the publishable key — which ships in every client
  bundle — could read and overwrite.
- `20260828160000_…` is the lockdown that closed exactly that hole. It was
  applied to the old project on 28 Aug (`docs/OUTSTANDING.md` §2.1) and has
  nothing left to do here.

Neither appears in the current project's migration history, so a `db push`
would have tried to apply both.

If you ever need the legacy table's history, it is on the old project, not this
one. Don't move these files back.
