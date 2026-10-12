-- Stop the public Request Access form answering "is this address registered?".
--
-- 20261011090000 gave anon EXECUTE on email_has_account() so the form could
-- send people who already have an account to "forgot password", and made the
-- insert trigger raise for a registered address. Both are yes/no oracles on
-- any address, for anybody, with no rate limit: enough to test a list of NHS
-- addresses against the platform one by one.
--
-- The outcome that was asked for is kept — somebody with an account is sent
-- to reset their password — but the answer now goes to the inbox, not the
-- browser:
--
--   * email_has_account() is no longer callable from a browser.
--   * The trigger no longer raises. A request from a registered address, or
--     from an address with a request already pending, is silently not stored;
--     the form says the same thing whatever happened.
--   * access-request-email then emails that address (once a day at most) a
--     password-reset link instead of a confirmation. Only the owner of the
--     inbox learns the address is registered.
--
-- The pending-request rule also stops one address being used to fill the
-- queue — and every reviewer's inbox — with copies of the same request.
--
-- outbound_email_log records what the public email paths sent, so they can
-- send each message once and rate-limit by recipient. Service role only.

begin;

revoke execute on function public.email_has_account(text) from public, anon, authenticated;
grant execute on function public.email_has_account(text) to service_role;

create or replace function public.access_requests_reject_existing_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Returning NULL drops the row without an error: the caller cannot tell a
  -- skipped request from a stored one, which is the point.
  if public.email_has_account(NEW.email) then
    return null;
  end if;
  if exists (select 1 from public.access_requests r
              where lower(r.email) = lower(NEW.email) and r.status = 'pending') then
    return null;
  end if;
  return NEW;
end;
$$;

revoke execute on function public.access_requests_reject_existing_account() from public, anon, authenticated;

alter table public.access_requests
  add column if not exists confirmation_sent_at timestamptz;

comment on column public.access_requests.confirmation_sent_at is
  'When the applicant''s confirmation and the reviewers'' alert went out. Set once; the public function never sends them twice.';

create table if not exists public.outbound_email_log (
  id         bigserial primary key,
  kind       text not null,
  recipient  text not null,
  sent_at    timestamptz not null default now()
);

create index if not exists outbound_email_log_recent_idx
  on public.outbound_email_log (kind, lower(recipient), sent_at desc);

alter table public.outbound_email_log enable row level security;
alter table public.outbound_email_log force row level security;
revoke all on public.outbound_email_log from anon, authenticated;
revoke all on sequence public.outbound_email_log_id_seq from anon, authenticated;
grant select, insert, delete on public.outbound_email_log to service_role;
grant usage on sequence public.outbound_email_log_id_seq to service_role;

commit;
