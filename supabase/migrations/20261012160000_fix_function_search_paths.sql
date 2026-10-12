-- Pin search_path on the three functions Supabase's security advisor flagged
-- (function_search_path_mutable). None is SECURITY DEFINER, so the exposure
-- was small, but a function that resolves names through the caller's
-- search_path can be pointed at look-alike objects.
alter function public.register_archive_days() set search_path = public, pg_temp;
alter function public.resource_folders_no_cycles() set search_path = public, pg_temp;
alter function public.resource_folders_same_subsection() set search_path = public, pg_temp;
