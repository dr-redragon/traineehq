#!/usr/bin/env node
/**
 * Copy the TraineeHQ database from one Supabase project to another.
 *
 *   node scripts/migrate-database.mjs --dry-run
 *   node scripts/migrate-database.mjs
 *
 * Environment:
 *   SOURCE_DATABASE_URL   postgres://... of the project to copy FROM
 *   TARGET_DATABASE_URL   postgres://... of the project to copy INTO
 *
 * Both are the "Connection string" (session or direct) from
 * Supabase → Project Settings → Database. They contain the database password,
 * so pass them in the environment and never commit them.
 *
 * The target must already have the schema — run supabase/schema/0001_traineehq_baseline.sql
 * against it first.
 *
 * What it does, in dependency order:
 *   1. auth.users and auth.identities, with password hashes intact, so people
 *      keep their existing logins. Generated columns (users.confirmed_at,
 *      identities.email) are detected and skipped — inserting into them errors.
 *   2. Every public table, parents before children.
 *   3. Reconciles profiles and user_roles. The target's on_auth_user_created
 *      trigger fires while step 1 runs and invents a profile and a 'trainee'
 *      role per user; any such row that is not in the source is removed, so the
 *      result matches the source exactly rather than being a superset.
 *
 * Safe to re-run: every insert is ON CONFLICT (id) DO NOTHING, so a partial run
 * can simply be repeated.
 */

import pg from "pg";

const { Client } = pg;

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH = 500;

/** Public tables, ordered so a row's dependencies are always inserted first. */
const PUBLIC_TABLES = [
  "deaneries",
  "specialties",           // self-referencing; ordered parents-first below
  "profiles",
  "user_roles",
  "trainee_specialties",
  "facilitator_specialties",
  "subsections",
  "resource_folders",
  "resources",
  "contacts",
  "announcements",
  "specialty_notices",
  "discussions",
  "discussion_comments",
  "discussion_votes",
  "bookmarks",
  "starred_contacts",
  "watched_discussions",
  "dashboard_preferences",
  "access_requests",
  "teaching_sessions",
  "attendance_records",
  "audit_log",
];

/**
 * Tables the target populates by trigger. After copying, any row not present in
 * the source is deleted so the two databases match exactly.
 */
const RECONCILE = new Set(["profiles", "user_roles"]);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. See the header of this file.`);
    process.exit(1);
  }
  return value;
}

/**
 * Column names that can actually be written.
 * Generated columns (auth.users.confirmed_at, auth.identities.email) reject
 * explicit values, so they have to be left out of the column list.
 */
async function writableColumns(client, schema, table) {
  const { rows } = await client.query(
    `select column_name
       from information_schema.columns
      where table_schema = $1
        and table_name = $2
        and is_generated = 'NEVER'
        and is_identity = 'NO'
      order by ordinal_position`,
    [schema, table],
  );
  return rows.map((r) => r.column_name);
}

async function tableExists(client, schema, table) {
  const { rows } = await client.query(
    `select 1 from information_schema.tables
      where table_schema = $1 and table_name = $2 and table_type = 'BASE TABLE'`,
    [schema, table],
  );
  return rows.length > 0;
}

/**
 * Copy one table. Returns { read, written }.
 *
 * Rows are read as a single json array and written with jsonb_populate_recordset,
 * which maps by column name and casts each value with the target column's own
 * type — no hand-rolled literal quoting, so text containing quotes, newlines or
 * unicode survives untouched.
 */
async function copyTable(source, target, schema, table, { orderBy } = {}) {
  if (!(await tableExists(source, schema, table))) {
    console.log(`  ${schema}.${table}: not present in source, skipped`);
    return { read: 0, written: 0 };
  }

  const columns = await writableColumns(target, schema, table);
  if (columns.length === 0) {
    console.log(`  ${schema}.${table}: not present in target, skipped`);
    return { read: 0, written: 0 };
  }

  const order = orderBy ? ` order by ${orderBy}` : "";
  const { rows } = await source.query(
    `select coalesce(json_agg(t${order}), '[]'::json) as data from ${schema}.${table} t`,
  );
  const data = rows[0].data;

  if (data.length === 0) {
    console.log(`  ${schema}.${table}: 0 rows`);
    return { read: 0, written: 0 };
  }
  if (DRY_RUN) {
    console.log(`  ${schema}.${table}: ${data.length} rows (dry run, nothing written)`);
    return { read: data.length, written: 0 };
  }

  const list = columns.map((c) => `"${c}"`).join(", ");
  let written = 0;

  for (let i = 0; i < data.length; i += BATCH) {
    const slice = data.slice(i, i + BATCH);
    const { rowCount } = await target.query(
      `insert into ${schema}.${table} (${list})
       select ${list}
         from jsonb_populate_recordset(null::${schema}.${table}, $1::jsonb)
       on conflict (id) do nothing`,
      [JSON.stringify(slice)],
    );
    written += rowCount;
  }

  const skipped = data.length - written;
  console.log(
    `  ${schema}.${table}: ${written} inserted${skipped ? `, ${skipped} already present` : ""}`,
  );
  return { read: data.length, written };
}

/** Remove trigger-invented rows that the source does not have. */
async function reconcile(source, target, table) {
  const { rows } = await source.query(`select id from public.${table}`);
  const ids = rows.map((r) => r.id);

  if (DRY_RUN) {
    const { rows: extra } = await target.query(
      `select count(*)::int as n from public.${table} where not (id = any($1::uuid[]))`,
      [ids],
    );
    if (extra[0].n > 0) console.log(`  ${table}: ${extra[0].n} extra row(s) would be removed`);
    return;
  }

  const { rowCount } = await target.query(
    `delete from public.${table} where not (id = any($1::uuid[]))`,
    [ids],
  );
  if (rowCount > 0) console.log(`  ${table}: removed ${rowCount} trigger-created row(s)`);
}

async function main() {
  const source = new Client({
    connectionString: requireEnv("SOURCE_DATABASE_URL"),
    ssl: { rejectUnauthorized: false },
  });
  const target = new Client({
    connectionString: requireEnv("TARGET_DATABASE_URL"),
    ssl: { rejectUnauthorized: false },
  });

  await source.connect();
  await target.connect();

  try {
    if (DRY_RUN) console.log("DRY RUN — reading only, nothing will be written.\n");

    console.log("Authentication");
    // Password hashes live on auth.users; copying the row verbatim is what keeps
    // existing logins working. auth.identities is what makes email/password
    // sign-in resolve to that user.
    await copyTable(source, target, "auth", "users", { orderBy: "t.created_at" });
    await copyTable(source, target, "auth", "identities", { orderBy: "t.created_at" });

    console.log("\nApplication data");
    for (const table of PUBLIC_TABLES) {
      // Parent specialties must exist before their children reference them.
      const orderBy =
        table === "specialties"
          ? "(t.parent_specialty_id is not null), t.created_at"
          : table === "discussion_comments"
            ? "(t.parent_id is not null), t.created_at"
            : undefined;
      await copyTable(source, target, "public", table, { orderBy });
    }

    console.log("\nReconciling trigger-created rows");
    for (const table of RECONCILE) await reconcile(source, target, table);

    console.log("\nVerification (source → target)");
    let mismatches = 0;
    for (const table of [...PUBLIC_TABLES, "users", "identities"]) {
      const schema = table === "users" || table === "identities" ? "auth" : "public";
      if (!(await tableExists(source, schema, table))) continue;
      const q = `select count(*)::int as n from ${schema}.${table}`;
      const [{ rows: s }, { rows: t }] = await Promise.all([source.query(q), target.query(q)]);
      const same = s[0].n === t[0].n;
      if (!same) mismatches++;
      if (!same || process.env.VERBOSE) {
        console.log(`  ${same ? "ok  " : "DIFF"} ${schema}.${table}: ${s[0].n} → ${t[0].n}`);
      }
    }

    if (DRY_RUN) {
      console.log("\nDry run finished.");
    } else if (mismatches === 0) {
      console.log("\nAll tables match. Database migration complete.");
    } else {
      console.log(`\n${mismatches} table(s) differ — see DIFF lines above.`);
      process.exitCode = 1;
    }
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error("\nMigration failed:", err.message);
  process.exit(1);
});
