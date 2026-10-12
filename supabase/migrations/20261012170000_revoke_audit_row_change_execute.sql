-- audit_row_change() is a trigger function. It was still executable through
-- /rest/v1/rpc by signed-in users (Supabase advisor: authenticated security
-- definer function executable). Calling it outside a trigger only errors, but
-- nothing in the app needs it callable, so it is closed like the other audit
-- trigger functions.
revoke execute on function public.audit_row_change() from public, anon, authenticated;
