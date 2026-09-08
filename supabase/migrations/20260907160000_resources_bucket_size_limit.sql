-- Lift the upload cap on the resources bucket.
--
-- The bucket carried a 500 MB per-file limit of its own. Clearing it (null)
-- means the bucket no longer restricts anything and uploads are bounded only
-- by the project's *global* storage file-size limit, which is a plan/config
-- setting rather than something a migration can reach:
--
--   Free plan       -> 50 MB, and cannot be raised
--   Pro / Team plan -> configurable in Storage Settings, up to 500 GB
--
-- So on the current Free plan the effective ceiling is 50 MB; once the project
-- is upgraded, raising that global limit takes effect with no schema change.
-- (The app uploads via the standard supabase-js upload, which itself tops out
-- at 5 GB per file — resumable uploads would be needed beyond that.)
update storage.buckets
   set file_size_limit = null
 where id = 'resources';
