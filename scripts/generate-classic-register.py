#!/usr/bin/env python3
"""
Regenerate the classic teaching register's migration from the live register's.

The classic register (/classic-registers) is a deliberate duplicate of the
register at /registers: same schema, same rules, separate tables, so the two can
be run side by side and compared before one is deleted. Its migration is not
maintained by hand — it is generated from the migrations that built the original,
with every schema-global identifier renamed. That way the two cannot drift by
accident, and a change to the original can be carried across by re-running this.

    python3 scripts/generate-classic-register.py
    ./scripts/verify-classic-register-schema.sh

It writes:
    supabase/migrations/20260909120000_classic_teaching_register.sql
    supabase/schema/test/classic-*-assertions.sql

Column names (register_id), RPC parameter names (_register_id) and policy names
are scoped to their own table and are deliberately NOT renamed, so the two
schemas diff cleanly line for line.

The one exception is the four logo policies on storage.objects, which BOTH
registers share. Those are renamed; see the note in convert().

Regenerating overwrites both the migration and the assertion files. If the
migration has already been applied to a real database, a regenerated file is a
new statement of the same schema rather than an incremental change — check the
diff before shipping it.
"""
import re, pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent
SRC = REPO / "supabase" / "migrations"
OUT = SRC / "20260909120000_classic_teaching_register.sql"

SOURCES = [
    ("Tenancy, membership, blob store",  "20260907090000_register_multi_tenancy.sql"),
    ("Access administration",            "20260907110000_register_access_admin.sql"),
    ("Live sessions, check-in, feedback","20260907120000_register_live_sessions.sql"),
    ("Grants lockdown",                  "20260907130000_register_grants_lockdown.sql"),
    ("Anonymous API functions",          "20260907140000_register_api_functions.sql"),
    ("A register belongs to a deanery",  "20260907150000_registers_per_deanery.sql"),
    ("Certificate logo",                 "20260909090000_register_certificate_logo.sql"),
]

# Verb-shaped names read badly under a blind prefix ("classic_is_register_member"),
# so those are mapped by hand; everything else simply gains the prefix.
EXPLICIT = {
    "is_register_member":       "is_classic_register_member",
    "is_register_owner":        "is_classic_register_owner",
    "can_create_register":      "can_create_classic_register",
    "create_register":          "create_classic_register",
    "request_register_access":  "request_classic_register_access",
    "decide_register_access":   "decide_classic_register_access",
    "remove_register_member":   "remove_classic_register_member",
    "save_register":            "save_classic_register",
    "set_register_member_role": "set_classic_register_member_role",
}

PREFIXED = [
    # tables + enum
    "registers", "register_members", "register_access_requests", "register_invites",
    "register_stores", "register_sessions", "register_attendees", "register_feedback",
    "register_forms", "register_role",
    # functions
    "register_directory", "register_people", "register_public_session",
    "register_public_roster", "register_record_checkin",
    "register_resolve_trainee_email", "register_enrol_trainee",
    "register_record_feedback", "register_creatable_deaneries",
    "register_creatable_specialties",
    # indexes + constraints (global to the schema, so they must not collide)
    "register_access_requests_one_open", "register_access_requests_register_status_idx",
    "register_access_requests_user_idx", "register_attendees_session_idx",
    "register_feedback_session_idx", "register_invites_one_open",
    "register_members_user_idx", "register_sessions_register_idx",
    "registers_deanery_idx", "registers_deanery_specialty_key",
    "registers_specialty_id_key",
]

MAP = dict(EXPLICIT)
for name in PREFIXED:
    MAP[name] = "classic_" + name

pattern = re.compile(r"\b(" + "|".join(sorted(MAP, key=len, reverse=True)) + r")\b")

def convert(text: str) -> str:
    text = pattern.sub(lambda m: MAP[m.group(1)], text)
    text = text.replace("register-logos", "classic-register-logos")
    # Policy names on storage.objects.
    #
    # Policy names are scoped to their table, which is why every other policy
    # here keeps the original's name — classic_register_members and
    # register_members are different tables and cannot collide. storage.objects
    # is the exception: BOTH registers put their logo policies on that one
    # shared table. Left unrenamed, the copy's "drop policy if exists" would
    # delete the live register's logo policies and replace them with ones
    # pointing at the classic bucket, silently breaking logo upload on the
    # register that is meant to be left untouched.
    for policy in ("logos are readable", "owners upload logos",
                   "owners replace logos", "owners remove logos"):
        text = text.replace('"register ' + policy + '"',
                            '"classic register ' + policy + '"')
    return text

out = []
for label, name in SOURCES:
    body = (SRC / name).read_text()
    body = re.sub(r"(?m)^(begin|commit);\s*$", "", body)
    out.append(
        "-- ###########################################################################\n"
        f"-- MIRRORS {name}\n"
        f"-- {label}\n"
        "-- ###########################################################################\n"
        + convert(body).strip() + "\n"
    )

body = "\n\n".join(out)

# The one object whose SHAPE changes across the replay.
#
# The history below defines classic_register_directory() three times, and the
# last one returns two extra columns. `create or replace` cannot widen a
# function's return type, so on a SECOND run of this file the first definition
# would fail against the final one left by the first run. Dropping it first makes
# the file re-runnable. The grants that follow each definition put back what the
# drop removes.
#
# Nothing else needs this: create_classic_register() changes its argument list,
# which makes it a different function rather than a redefinition, and every other
# object is created `if not exists` or replaced at an unchanged shape.
first_directory = body.index("create or replace function public.classic_register_directory()")
body = (
    body[:first_directory]
    + "-- Re-runnability: see the note in the migration header.\n"
      "drop function if exists public.classic_register_directory();\n\n"
    + body[first_directory:]
)

BODY = body
print("lines:", sum(s.count(chr(10)) for s in out))

# ---------------------------------------------------------------------------
# The assertion suite, renamed the same way, so the copy is held to exactly the
# tests the original passes.
# ---------------------------------------------------------------------------
TEST_SRC = REPO / "supabase" / "schema" / "test"
for name in ["register-assertions.sql", "access-admin-assertions.sql",
             "live-sessions-assertions.sql", "grants-assertions.sql",
             "api-functions-assertions.sql", "per-deanery-assertions.sql"]:
    text = convert((TEST_SRC / name).read_text())
    (TEST_SRC / ("classic-" + name)).write_text(text)
    print("wrote", "classic-" + name)

# ---------------------------------------------------------------------------
# Two adjustments, because the copy is ONE migration landing at the final state
# while the originals are a history the harness walks through stage by stage.
#
# register-assertions.sql runs, in the original harness, before the access-admin
# migration deletes the invites table. Applied against the copy it runs after,
# so the one assertion that names that table has to name the four that survive.
# This is the assertion catching up with a deliberate design change (see "THE
# INVITES TABLE IS DROPPED" in the migration), not the copy diverging.
# ---------------------------------------------------------------------------
ra = TEST_SRC / "classic-register-assertions.sql"
text = ra.read_text()
before = """    'classic_registers','classic_register_members','classic_register_access_requests',
    'classic_register_invites','classic_register_stores'"""
after = """    'classic_registers','classic_register_members','classic_register_access_requests',
    'classic_register_stores'"""
assert before in text, "RLS table array not found"
text = text.replace(before, after)
text = text.replace("ok 19  RLS enabled and forced on all five tables",
                    "ok 19  RLS enabled and forced on all four surviving tables")
ra.write_text(text)
print("adjusted classic-register-assertions.sql for the dropped invites table")


# ---------------------------------------------------------------------------
# The finished migration: header, replayed body, and the parts that have no
# counterpart in the original history (foreign-key indexes, the audit trigger).
# ---------------------------------------------------------------------------
HEAD = (REPO / "scripts" / "classic-register" / "header.sql").read_text()
TAIL = (REPO / "scripts" / "classic-register" / "footer.sql").read_text()
OUT.write_text(HEAD + BODY + TAIL)
print("wrote", OUT.relative_to(REPO))

# ---------------------------------------------------------------------------
# The edge functions.
#
# register-invite, register-certificate and register-api reach the database by
# name — .from("register_stores"), .rpc("register_record_checkin") — so the same
# rename carries them across unchanged in every other respect.
# ---------------------------------------------------------------------------
FUNCS = REPO / "supabase" / "functions"

# An app path such as "/registers/feedback" would be caught by the identifier
# rename and come back as "/classic_registers/feedback", with an underscore
# where the route has a hyphen. Park it somewhere the rename cannot see it.
PARK = "\x00APP_PATH\x00"

def convert_ts(text: str) -> str:
    text = text.replace("/registers/", PARK)
    text = convert(text)
    text = text.replace(PARK, "/classic-registers/")
    # Function directory names are hyphenated, so they survive convert() intact
    # and are renamed here; doing it last keeps them out of its way.
    for fn in ("register-api", "register-invite", "register-certificate"):
        text = text.replace(fn, "classic-" + fn)
    return text

for fn in ("register-invite", "register-certificate", "register-api"):
    src_dir = FUNCS / fn
    out_dir = FUNCS / ("classic-" + fn)
    out_dir.mkdir(parents=True, exist_ok=True)
    for f in sorted(src_dir.glob("*.ts")):
        (out_dir / f.name).write_text(convert_ts(f.read_text()))
        print("wrote", (out_dir / f.name).relative_to(REPO))

# ---------------------------------------------------------------------------
# The domain logic.
#
# src/lib/register is already a tested port of the standalone ENT register's
# calculations — eligibility windows, adjusted attendance, academic years,
# certificate rendering. The classic register needs the same arithmetic against
# its own tables, so the module is copied and repointed, keeping its unit tests.
#
# Symbol names are NOT renamed. They are module-scoped, so useRegisterDirectory
# in @/hooks/classic/useRegisters cannot collide with the one in
# @/hooks/useRegisters, and leaving them alone keeps the two trees diffable.
# ---------------------------------------------------------------------------
SRC_TS = REPO / "src"

def convert_app_ts(text: str) -> str:
    text = text.replace("/registers/", PARK)
    text = convert(text)
    text = text.replace(PARK, "/classic-registers/")
    for fn in ("register-api", "register-invite", "register-certificate"):
        text = text.replace(fn, "classic-" + fn)
    # Module paths follow the files.
    text = text.replace('@/lib/register/', '@/lib/classic/')
    text = text.replace('@/hooks/useRegisters', '@/hooks/classic/useRegisters')
    text = text.replace('@/hooks/useRegisterAccess', '@/hooks/classic/useRegisterAccess')
    text = text.replace('@/hooks/useRegisterStore', '@/hooks/classic/useRegisterStore')
    text = text.replace('@/hooks/useRegisterTheme', '@/hooks/classic/useRegisterTheme')
    # React Query cache keys.
    #
    # These are hyphenated strings, so the identifier rename leaves them alone —
    # and both registers now run in the SAME app, sharing one QueryClient. Left
    # as they are, the classic directory and the live one would read and write
    # the same cache entry and serve each other's rows. Namespaced here rather
    # than by hand so a key added upstream cannot be missed.
    for key in ("register-directory", "register-creatable-deaneries",
                "register-creatable-specialties", "register-store",
                "register-members", "register-requests", "register-people"):
        text = text.replace('"' + key + '"', '"classic-' + key + '"')
    text = text.replace('"my-register-memberships"', '"my-classic-register-memberships"')
    return text

(SRC_TS / "lib" / "classic").mkdir(parents=True, exist_ok=True)
for f in sorted((SRC_TS / "lib" / "register").glob("*.ts")):
    (SRC_TS / "lib" / "classic" / f.name).write_text(convert_app_ts(f.read_text()))
    print("wrote", (SRC_TS / "lib" / "classic" / f.name).relative_to(REPO))

(SRC_TS / "hooks" / "classic").mkdir(parents=True, exist_ok=True)
for name in ("useRegisters.ts", "useRegisterAccess.ts", "useRegisterStore.ts", "useRegisterTheme.ts"):
    f = SRC_TS / "hooks" / name
    (SRC_TS / "hooks" / "classic" / name).write_text(convert_app_ts(f.read_text()))
    print("wrote", (SRC_TS / "hooks" / "classic" / name).relative_to(REPO))

# The directory fixture predates two columns that RegisterDirectoryEntry now
# requires (i_am_owner, certificate_logo_path), so it does not typecheck. The
# original carries the same gap; it is corrected in the copy rather than left to
# be inherited, and the original is deliberately not touched — this exercise is
# meant to leave the live register exactly as it was.
dt = SRC_TS / "lib" / "classic" / "directory.test.ts"
text = dt.read_text()
before = """    member_count: 1,
    i_am_member: false,
    my_request: null,"""
after = """    member_count: 1,
    i_am_member: false,
    i_am_owner: false,
    certificate_logo_path: null,
    my_request: null,"""
if before in text:
    dt.write_text(text.replace(before, after))
    print("completed the directory test fixture")
