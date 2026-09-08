-- Copy a register from the standalone ENT project into TraineeHQ, with every
-- identifier replaced.
--
-- Run against the SOURCE project (ecyhvubwcqqghumnyxuu). It returns one jsonb
-- value — the register blob, anonymised — to be written into the target's
-- public.register_stores.data. It changes nothing in the source.
--
-- WHAT IS REPLACED, and why
--
--   trainees[].name    52 named NHS trainees. Replaced with generated names from
--                      two alphabetical pools of different lengths (26 and 25),
--                      so all 52 come out distinct.
--   trainees[].email   43 real addresses. Replaced with example.invalid, a
--                      reserved TLD that can never resolve or be delivered to.
--   excused[].reason   84 free-text reasons. Redacted wholesale rather than
--                      inspected: the field is where somebody writes "off sick
--                      with…" or names a colleague.
--
-- WHAT IS KEPT, deliberately
--
--   Attendance marks, teaching days, grades and the mat/oop/cct/idt status
--   windows. Once the names are gone these identify nobody, and they are the
--   whole value of the copy: they exercise the eligibility rules, the adjusted
--   percentages and the "hide not in programme" filter against a real shape of
--   data rather than a fixture somebody invented.
--
-- VERIFYING THE COPY
--
--   md5(blob::text) here must equal md5(data::text) in the target afterwards.
--   jsonb normalises key order, so the two are comparable directly.
--
-- Applied 2026-09-07 to twuvscymudpnokzfsqoy, register 'northwest-ent':
-- checksum f833958911b88bbfb9d0e83551b00217, 52 trainees, 11 sessions,
-- 273 attendance marks, 84 excusals, 17 status rows.

with src as (select data as d from public.register_store where id = 'default'),
n as (select
  array['Alice','Brian','Chloe','Daniel','Elena','Freddie','Grace','Harry','Isla','Jacob',
        'Katie','Liam','Maya','Noah','Olivia','Peter','Quinn','Rosie','Samuel','Tara',
        'Umar','Verity','William','Xanthe','Yasmin','Zach']::text[] as f,
  array['Abbott','Baker','Carter','Dawson','Ellis','Fletcher','Gibson','Hayes','Irving','Jarvis',
        'Kerr','Lawson','Mercer','Nolan','Osborne','Pryce','Quayle','Rhodes','Sutton','Turner',
        'Underhill','Vaughan','Whitfield','Yates','Zamora']::text[] as l),
tr as (
  -- jsonb_strip_nulls drops grade/gradeFrom/email for trainees that never had
  -- them, so an absent field stays absent rather than becoming an explicit null.
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id',        t->>'id',
           'name',      n.f[1 + (o-1) % 26] || ' ' || n.l[1 + (o-1) % 25],
           'grade',     t->>'grade',
           'gradeFrom', t->>'gradeFrom',
           'email',     case when t ? 'email' then 'trainee' || o || '@example.invalid' end
         )) order by o) as v
  from src, n, jsonb_array_elements(src.d->'trainees') with ordinality as e(t, o)
),
ex as (
  select jsonb_agg(jsonb_build_object(
           'id', x->>'id', 'trainee', x->>'trainee', 'session', x->>'session',
           'reason', 'Excused (reason redacted)', 'ts', x->>'ts') order by o) as v
  from src, jsonb_array_elements(src.d->'excused') with ordinality as e(x, o)
),
out as (
  select jsonb_build_object(
    'trainees',   coalesce(tr.v, '[]'::jsonb),
    'sessions',   src.d->'sessions',
    'attendance', src.d->'attendance',
    'excused',    coalesce(ex.v, '[]'::jsonb),
    'status',     src.d->'status') as blob
  from src, tr, ex
)
select md5(blob::text) as checksum, blob from out;
