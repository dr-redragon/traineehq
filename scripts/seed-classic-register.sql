-- ============================================================================
-- Demo data for a classic teaching register
--
-- Fills one register with a cohort, three academic years of teaching days, and
-- the attendance, excusals and long-term statuses that go with them, so the
-- register's features can be exercised against something that looks like a real
-- programme rather than four rows typed by hand.
--
-- THIS IS NOT A MIGRATION. It lives in scripts/ because it is run deliberately,
-- against whichever database you want populated — a local stack, a preview
-- project, or the live one — and never automatically. Nothing in the app
-- imports it.
--
-- HOW TO RUN IT. Paste the whole file into the Supabase SQL editor, or
--
--     psql "$DATABASE_URL" -f scripts/seed-classic-register.sql
--
-- It runs as one transaction and prints a summary of what the register now
-- holds. Set the slug on the line marked `<<<` first; with a slug that matches
-- nothing the script aborts and lists the registers that do exist.
--
-- WHAT IT TOUCHES. Everything it writes is keyed by an id beginning `seed-`,
-- and it rebuilds only those rows: trainees, teaching days, attendance marks,
-- excusals and statuses you added yourself are read, kept, and written back
-- untouched. So it is safe to re-run — a second run replaces the demo data
-- rather than doubling it — and the block at the foot of this file removes the
-- demo data again, leaving your own rows behind.
--
-- Two consequences of leaving your own rows alone, both expected:
--   * a teaching day you added yourself reads as an unexplained absence for
--     every seeded trainee, until you tick or excuse them;
--   * a trainee you added yourself reads as absent from all 19 seeded days.
--
-- The last seeded day is in the future and carries no marks, which is what a
-- day scheduled but not yet held looks like — the register has no notion of
-- "not yet", so it reads as an absence for everyone and holds the current
-- year's percentages down until it is either held or removed. It is there
-- because publishing a day for check-in, and the QR link that goes with it, is
-- most naturally tested on a day that has not happened yet.
--
-- THE DATA IS FICTIONAL. The names are invented and every address is on
-- `example.com`, which is reserved for documentation and accepts no mail — so a
-- certificate run or a chaser sent from a seeded register cannot reach a real
-- person. Do not replace them with real addresses in this file.
--
-- WHAT IT IS BUILT TO EXERCISE, deliberately rather than incidentally:
--
--   Academic years   Days in 2024/25, 2025/26 and 2026/27, so the year tabs
--                    have something to switch between and a past year's report
--                    can be compared with the current one.
--   Two percentages  Attendance ranges from near-perfect to about a third, so
--                    every colour band in the table is populated, and excusals
--                    and ineligible months pull raw and adjusted apart.
--   Eligibility      One trainee on maternity leave that has since expired, one
--                    currently out of programme, one who arrived by IDT partway
--                    through, one who transferred out, one who has CCT'd, and
--                    one on open-ended leave with no end month. Between them
--                    they cover every branch of isEligible() and both halves of
--                    isFormerTrainee().
--   Grades           Grade is recorded per check-in, not per person, so a
--                    trainee's marks carry the grade they held that year and a
--                    past year's table is not relabelled with today's grade.
--   Legacy marks     A handful of 2024/25 marks are stored as the bare `true`
--                    the standalone register wrote before grade was captured.
--   Excusals         All ten reasons appear, including a free-text one of the
--                    kind "Other" produces.
--   Missing emails   Two trainees have no address, which is what certificate
--                    and chaser runs have to cope with.
--
-- WHAT IT DOES NOT DO. It writes the register's own document and nothing else.
-- Publishing a teaching day for check-in creates rows in
-- classic_register_sessions and issues a QR link, which is the edge function's
-- job; do that from the Check-in tab against any seeded day you want to test.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Which register to fill
-- ----------------------------------------------------------------------------
create temp table seed_target on commit drop as
select id as register_id
  from public.classic_registers
 where slug = 'northwest-ent';                                            -- <<<

do $$
begin
  if (select count(*) from seed_target) <> 1 then
    raise exception
      'No register with that slug. Set the slug marked <<< to one of: %',
      (select coalesce(string_agg(slug, ', ' order by slug), '(this database has no classic registers)')
         from public.classic_registers);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- The teaching days, oldest first
--
-- `ord` is the position of the day in every attendance pattern below, so a day
-- inserted in the middle renumbers the rest. Months are 'YYYY-MM'; the register
-- year runs August to July.
-- ----------------------------------------------------------------------------
create temp table seed_sessions on commit drop as
select * from (values
  -- 2024/25
  ( 1, 'seed-s01', '2024-09', 'Airway emergencies'),
  ( 2, 'seed-s02', '2024-10', 'Otology: chronic ear disease'),
  ( 3, 'seed-s03', '2024-11', 'Rhinology and sinus surgery'),
  ( 4, 'seed-s04', '2025-01', 'Head and neck cancer MDT'),
  ( 5, 'seed-s05', '2025-02', 'Paediatric ENT'),
  ( 6, 'seed-s06', '2025-03', 'Laryngology and voice'),
  ( 7, 'seed-s07', '2025-05', 'FRCS (ORL-HNS) exam preparation'),
  ( 8, 'seed-s08', '2025-06', 'Facial plastics and reconstruction'),
  -- 2025/26
  ( 9, 'seed-s09', '2025-09', 'Thyroid and parathyroid surgery'),
  (10, 'seed-s10', '2025-10', 'Vestibular medicine'),
  (11, 'seed-s11', '2025-11', 'Skull base and temporal bone'),
  (12, 'seed-s12', '2025-12', 'Audiology and hearing implants'),
  (13, 'seed-s13', '2026-02', 'Emergency ENT and trauma'),
  (14, 'seed-s14', '2026-03', 'Research methods and audit'),
  (15, 'seed-s15', '2026-04', 'Sleep surgery and snoring'),
  (16, 'seed-s16', '2026-06', 'Salivary gland disease'),
  -- 2026/27 — the current year, plus one day still to come
  (17, 'seed-s17', '2026-08', 'Induction and the training year ahead'),
  (18, 'seed-s18', '2026-09', 'Radiology for ENT'),
  (19, 'seed-s19', '2026-11', 'Human factors and non-technical skills')
) as v(ord, local_id, month, title);

-- ----------------------------------------------------------------------------
-- The cohort, and what each of them did
--
-- `pattern` has one character per teaching day above, in `ord` order:
--
--     P   present, with the grade they held that year
--     p   present, stored as the bare `true` the old register wrote
--     A   absent, unexplained
--     -   no mark: a day outside their programme window, or before they arrived
--   0-9   excused, with the reason of that code in seed_reasons below
--
-- `g24`, `g25` and `g26` are the grade held in each academic year; `grade` is
-- what the roster shows today. They differ on purpose — the register records
-- grade per check-in because it changes between rotations.
-- ----------------------------------------------------------------------------
create temp table seed_trainees on commit drop as
select * from (values
  ('seed-t01', 'Priya Raghunathan', 'ST8',    'priya.raghunathan@example.com', 'ST6',    'ST7',    'ST8',    'pPPPP6PPPPPPPP1PPP-'),
  ('seed-t02', 'Callum Fraser',     'ST7',    'callum.fraser@example.com',     'ST5',    'ST6',    'ST7',    'pPAP2PPAPAPP3PPPPA-'),
  ('seed-t03', 'Amara Okonkwo',     'ST6',    'amara.okonkwo@example.com',     'ST4',    'ST5',    'ST6',    'pPP-----PP9PPPPAPP-'),
  ('seed-t04', 'Daniel Whitfield',  'ST6',    null,                            'ST4',    'ST5',    'ST6',    'ApPAPAP4APAPPAPAAP-'),
  ('seed-t05', 'Sofia Marchetti',   'ST5',    'sofia.marchetti@example.com',   'ST3',    'ST4',    'ST5',    'PP5PPPAPPPPAP7PPPP-'),
  ('seed-t06', 'Hassan Al-Amin',    'ST5',    'hassan.al-amin@example.com',    'ST3',    'ST4',    'ST5',    'PAPPPAPPPPAPPPP----'),
  ('seed-t07', 'Grace Thornton',    'ST4',    'grace.thornton@example.com',    'ST3',    'ST3',    'ST4',    'AAPPAP5PPPPPAPPPPP-'),
  ('seed-t08', 'Oliver Nakamura',   'ST4',    null,                            'ST3',    'ST3',    'ST4',    'AApA8APAAPAAPA0AAA-'),
  ('seed-t09', 'Rebecca Lloyd',     'ST3',    'rebecca.lloyd@example.com',     'ST3',    'ST3',    'ST3',    '--------PPP5PPPPPP-'),
  ('seed-t10', 'Tomasz Nowak',      'ST5',    'tomasz.nowak@example.com',      'ST3',    'ST4',    'ST5',    'pPAPPAPPAPPAPPPAPA-'),
  ('seed-t11', 'Ananya Krishnan',   'Fellow', 'ananya.krishnan@example.com',   'Fellow', 'Fellow', 'Fellow', 'PPPAPPPPPP1PPAPPP--'),
  ('seed-t12', 'Jose Ferreira',     'SAS',    'jose.ferreira@example.com',     'SAS',    'SAS',    'SAS',    'APA2APAAPA4APAAP2A-'),
  ('seed-t13', 'Michael Oyelaran',  'ST8',    'michael.oyelaran@example.com',  'ST7',    'ST8',    'ST8',    'pPPP3PPPPPPP-------'),
  ('seed-t14', 'Hannah Beckett',    'ST6',    'hannah.beckett@example.com',    'ST4',    'ST5',    'ST6',    'PAPPPPAPPPPAP------')
) as v(local_id, name, grade, email, g24, g25, g26, pattern);

-- ----------------------------------------------------------------------------
-- Why an absence was excused
--
-- Codes 1-9 are the fixed list the excusal form offers, because these are
-- counted across a cohort and free text would not compare. Code 0 is the
-- free-text kind, which is what choosing "Other" stores.
-- ----------------------------------------------------------------------------
create temp table seed_reasons on commit drop as
select * from (values
  ('1', 'Annual Leave'),
  ('2', 'On-call commitments'),
  ('3', 'Post on-call rest'),
  ('4', 'Sickness'),
  ('5', 'Study Leave (Exam/course)'),
  ('6', 'LTFT day'),
  ('7', 'Theatre commitments'),
  ('8', 'Emailed apology'),
  ('9', 'Childcare'),
  ('0', 'Presenting at a national meeting')
) as v(code, reason);

-- ----------------------------------------------------------------------------
-- Long-term status: who was not expected, and when
--
-- Each type reads its window differently — `cct` by its end month, the IDT
-- types by when the move happens, leave as a window that may be open at either
-- end. The '-' runs in the patterns above line up with these.
-- ----------------------------------------------------------------------------
create temp table seed_status on commit drop as
select * from (values
  ('seed-st01', 'seed-t03', 'mat',     '2025-01', '2025-08'),  -- leave that has since expired
  ('seed-st02', 'seed-t06', 'oop',     '2026-06', '2027-01'),  -- out of programme right now
  ('seed-st03', 'seed-t09', 'idt_in',  '2025-09', null),       -- arrived partway through
  ('seed-st04', 'seed-t11', 'mat',     '2026-09', null),       -- on leave, no end month yet
  ('seed-st05', 'seed-t13', 'cct',     null,      '2025-12'),  -- training complete
  ('seed-st06', 'seed-t14', 'idt_out', '2026-03', null),       -- transferred out
  ('seed-st07', 'seed-t01', 'active',  null,      null)        -- the explicit no-op
) as v(id, trainee, type, start_month, end_month);

-- ----------------------------------------------------------------------------
-- Check the fixture before writing any of it
-- ----------------------------------------------------------------------------
do $$
declare
  days int := (select count(*) from seed_sessions);
  bad  text;
begin
  select string_agg(format('%s (%s characters, expected %s)', local_id, length(pattern), days), '; ')
    into bad
    from seed_trainees where length(pattern) <> days;
  if bad is not null then
    raise exception 'Attendance pattern is the wrong length for %', bad;
  end if;

  select string_agg(distinct format('%s in %s', mark, trainee), ', ')
    into bad
    from (
      select t.local_id as trainee, substr(t.pattern, s.ord, 1) as mark
        from seed_trainees t cross join seed_sessions s
    ) m
   where mark not in ('P', 'p', 'A', '-')
     and mark not in (select code from seed_reasons);
  if bad is not null then
    raise exception 'Unknown attendance pattern character: %', bad;
  end if;

  if exists (select 1 from seed_status where trainee not in (select local_id from seed_trainees)) then
    raise exception 'A status row names a trainee that is not in the cohort';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Expand the patterns into marks
-- ----------------------------------------------------------------------------
create temp table seed_marks on commit drop as
select s.ord,
       t.local_id as trainee,
       s.local_id as session,
       s.month,
       substr(t.pattern, s.ord, 1) as mark,
       -- The grade held in the academic year the day falls in. August starts
       -- the year, which is why the boundaries are '-08' and not '-01'.
       case when s.month >= '2026-08' then t.g26
            when s.month >= '2025-08' then t.g25
            else t.g24 end as grade
  from seed_trainees t
 cross join seed_sessions s;

-- ----------------------------------------------------------------------------
-- Build the register's document out of them
-- ----------------------------------------------------------------------------
create temp table seed_blob on commit drop as
select
  (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'id', local_id, 'name', name, 'grade', grade, 'email', email)) order by local_id)
     from seed_trainees) as trainees,

  (select jsonb_agg(jsonb_build_object(
            'id', local_id, 'month', month, 'title', title) order by ord)
     from seed_sessions) as sessions,

  -- 'p' is the legacy encoding: present, grade unknown.
  (select coalesce(jsonb_object_agg(
            trainee || '|' || session,
            case when mark = 'p' then 'true'::jsonb
                 else jsonb_build_object('grade', grade) end), '{}'::jsonb)
     from seed_marks where mark in ('P', 'p')) as attendance,

  -- Excusals are timestamped a few days before the teaching day, the way they
  -- arrive in practice.
  (select coalesce(jsonb_agg(jsonb_build_object(
            'id',      'seed-x' || lpad(x.n::text, 2, '0'),
            'trainee', x.trainee,
            'session', x.session,
            'reason',  x.reason,
            'ts',      x.ts) order by x.n), '[]'::jsonb)
     from (select row_number() over (order by m.ord, m.trainee) as n,
                  m.trainee, m.session, r.reason,
                  (extract(epoch from ((m.month || '-01')::timestamptz + interval '4 days'))
                   * 1000)::bigint::text as ts
             from seed_marks m
             join seed_reasons r on r.code = m.mark) x) as excused,

  (select coalesce(jsonb_agg(jsonb_build_object(
            'id', id, 'trainee', trainee, 'type', type,
            'start', start_month, 'end', end_month) order by id), '[]'::jsonb)
     from seed_status) as status;

-- ----------------------------------------------------------------------------
-- Write it, keeping whatever is already there
--
-- The insert is for a register whose document row has somehow gone missing; in
-- the ordinary case create_classic_register() made it and the update below does
-- the work. Both halves of the merge drop the previous run's `seed-` rows and
-- leave every other row exactly as it was found.
-- ----------------------------------------------------------------------------
insert into public.classic_register_stores (register_id, data)
select register_id, '{}'::jsonb from seed_target
on conflict (register_id) do nothing;

update public.classic_register_stores st
   set data = jsonb_build_object(
         'trainees',
           coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(st.data -> 'trainees', '[]'::jsonb)) e
                      where e ->> 'id' not like 'seed-%'), '[]'::jsonb)
           || (select trainees from seed_blob),
         'sessions',
           coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(st.data -> 'sessions', '[]'::jsonb)) e
                      where e ->> 'id' not like 'seed-%'), '[]'::jsonb)
           || (select sessions from seed_blob),
         'attendance',
           coalesce((select jsonb_object_agg(k, v) from jsonb_each(coalesce(st.data -> 'attendance', '{}'::jsonb)) as e(k, v)
                      where k not like 'seed-%'), '{}'::jsonb)
           || (select attendance from seed_blob),
         'excused',
           coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(st.data -> 'excused', '[]'::jsonb)) e
                      where e ->> 'id' not like 'seed-%'), '[]'::jsonb)
           || (select excused from seed_blob),
         'status',
           coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(st.data -> 'status', '[]'::jsonb)) e
                      where e ->> 'id' not like 'seed-%'), '[]'::jsonb)
           || (select status from seed_blob)),
       -- Every read carries the version it was built on, so bumping it is what
       -- tells an organiser with the page already open that it moved.
       version = st.version + 1,
       updated_at = now()
  from seed_target tgt
 where st.register_id = tgt.register_id;

-- ----------------------------------------------------------------------------
-- What the register now holds
-- ----------------------------------------------------------------------------
select r.name                                                as register,
       jsonb_array_length(st.data -> 'trainees')             as trainees,
       jsonb_array_length(st.data -> 'sessions')             as teaching_days,
       (select count(*) from jsonb_object_keys(st.data -> 'attendance')) as attendance_marks,
       jsonb_array_length(st.data -> 'excused')              as excusals,
       jsonb_array_length(st.data -> 'status')               as statuses,
       st.version
  from public.classic_register_stores st
  join public.classic_registers r on r.id = st.register_id
  join seed_target tgt on tgt.register_id = st.register_id;

commit;

-- ============================================================================
-- UNDO — remove the demo data, keep everything else
--
-- Run this block on its own. It is the exact inverse of the merge above: every
-- row whose id begins `seed-` goes, and every row that does not is written back
-- as it was.
-- ============================================================================
--
-- update public.classic_register_stores st
--    set data = jsonb_build_object(
--          'trainees',
--            coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(st.data -> 'trainees', '[]'::jsonb)) e
--                       where e ->> 'id' not like 'seed-%'), '[]'::jsonb),
--          'sessions',
--            coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(st.data -> 'sessions', '[]'::jsonb)) e
--                       where e ->> 'id' not like 'seed-%'), '[]'::jsonb),
--          'attendance',
--            coalesce((select jsonb_object_agg(k, v) from jsonb_each(coalesce(st.data -> 'attendance', '{}'::jsonb)) as e(k, v)
--                       where k not like 'seed-%'), '{}'::jsonb),
--          'excused',
--            coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(st.data -> 'excused', '[]'::jsonb)) e
--                       where e ->> 'id' not like 'seed-%'), '[]'::jsonb),
--          'status',
--            coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(st.data -> 'status', '[]'::jsonb)) e
--                       where e ->> 'id' not like 'seed-%'), '[]'::jsonb)),
--        version = st.version + 1,
--        updated_at = now()
--   from public.classic_registers r
--  where r.id = st.register_id
--    and r.slug = 'northwest-ent';                                        -- <<<
-- ============================================================================
