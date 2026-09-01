#!/usr/bin/env node
/**
 * Copy files in the "resources" storage bucket from one Supabase project to another.
 *
 *   node scripts/migrate-storage.mjs --dry-run
 *   node scripts/migrate-storage.mjs              # only files a resource row points at
 *   node scripts/migrate-storage.mjs --all        # every object in the bucket
 *
 * Environment:
 *   SOURCE_SUPABASE_URL         https://<ref>.supabase.co  to copy FROM
 *   SOURCE_SERVICE_ROLE_KEY     service_role key for that project
 *   TARGET_SUPABASE_URL         https://<ref>.supabase.co  to copy INTO
 *   TARGET_SERVICE_ROLE_KEY     service_role key for that project
 *
 * Service-role keys bypass RLS and can read and write any object. Treat them
 * like passwords: pass them in the environment, never commit them, and rotate
 * them if they leak.
 *
 * Default is referenced-only, and that is usually what you want. Deleting a
 * resource in this app has never deleted its storage object, so a long-lived
 * bucket accumulates orphans — on the project this was written for, 212 of 223
 * objects were unreferenced, 167 MB of the 167.4 MB total. --all copies those
 * too, if you would rather keep everything.
 *
 * Safe to re-run: an object already present in the target is skipped, and
 * uploads use upsert so a half-finished copy is simply completed.
 */

import { createClient } from "@supabase/supabase-js";

const BUCKET = "resources";
const DRY_RUN = process.argv.includes("--dry-run");
const COPY_ALL = process.argv.includes("--all");
const CONCURRENCY = 4;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. See the header of this file.`);
    process.exit(1);
  }
  return value;
}

const source = createClient(
  requireEnv("SOURCE_SUPABASE_URL"),
  requireEnv("SOURCE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);
const target = createClient(
  requireEnv("TARGET_SUPABASE_URL"),
  requireEnv("TARGET_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

/**
 * Turn a resources.file_url into a bucket path.
 * Older rows stored a full public URL — including, in at least one case, a URL
 * pointing at a different project entirely — while newer rows store a bare path.
 */
function toStoragePath(fileUrl) {
  if (!fileUrl) return null;
  const match = fileUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/resources\/(.+)$/);
  if (match) return decodeURIComponent(match[1].split("?")[0]);
  if (/^https?:\/\//i.test(fileUrl)) return null; // external link, not our storage
  return fileUrl;
}

/** Every object in the bucket, walked depth-first (list() is per-prefix). */
async function listAll(client, prefix = "") {
  const out = [];
  const pageSize = 100;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.storage
      .from(BUCKET)
      .list(prefix, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${prefix || "/"}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // A row with no id is a folder placeholder, not an object.
      if (entry.id === null) out.push(...(await listAll(client, path)));
      else out.push({ path, size: entry.metadata?.size ?? null });
    }

    if (data.length < pageSize) break;
  }
  return out;
}

/** Paths referenced by a resources row. */
async function listReferenced() {
  const { data, error } = await source.from("resources").select("file_url").not("file_url", "is", null);
  if (error) throw new Error(`read resources: ${error.message}`);

  const paths = new Set();
  for (const row of data) {
    const path = toStoragePath(row.file_url);
    if (path) paths.add(path);
  }
  return [...paths].map((path) => ({ path, size: null }));
}

async function copyOne({ path }) {
  const { data: blob, error: downloadError } = await source.storage.from(BUCKET).download(path);
  if (downloadError || !blob) {
    return { path, status: "missing", detail: downloadError?.message ?? "no body" };
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  const { error: uploadError } = await target.storage.from(BUCKET).upload(path, buffer, {
    contentType: blob.type || "application/octet-stream",
    upsert: true,
  });
  if (uploadError) return { path, status: "failed", detail: uploadError.message };

  return { path, status: "copied", bytes: buffer.length };
}

/** Run tasks with a small concurrency limit, reporting as they finish. */
async function runPool(items, worker, limit) {
  const results = [];
  let index = 0;
  let done = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const item = items[index++];
        const result = await worker(item);
        results.push(result);
        done++;
        const mark = result.status === "copied" ? "ok" : result.status.toUpperCase();
        console.log(`  [${done}/${items.length}] ${mark}  ${result.path}` +
          (result.detail ? ` — ${result.detail}` : ""));
      }
    }),
  );
  return results;
}

async function main() {
  console.log(COPY_ALL ? "Copying every object in the bucket." : "Copying referenced files only (--all for everything).");
  if (DRY_RUN) console.log("DRY RUN — nothing will be uploaded.");
  console.log();

  const wanted = COPY_ALL ? await listAll(source) : await listReferenced();
  if (wanted.length === 0) {
    console.log("Nothing to copy.");
    return;
  }

  const existing = new Set((await listAll(target)).map((o) => o.path));
  const todo = wanted.filter((o) => !existing.has(o.path));

  console.log(`${wanted.length} file(s) to migrate; ${wanted.length - todo.length} already in the target.`);
  if (todo.length === 0) {
    console.log("Storage already up to date.");
    return;
  }

  if (DRY_RUN) {
    for (const o of todo) console.log(`  would copy  ${o.path}`);
    console.log(`\nDry run finished — ${todo.length} file(s) would be copied.`);
    return;
  }

  console.log();
  const results = await runPool(todo, copyOne, CONCURRENCY);

  const copied = results.filter((r) => r.status === "copied");
  const missing = results.filter((r) => r.status === "missing");
  const failed = results.filter((r) => r.status === "failed");
  const bytes = copied.reduce((sum, r) => sum + (r.bytes ?? 0), 0);

  console.log(`\nCopied ${copied.length} file(s), ${(bytes / 1024 / 1024).toFixed(2)} MB.`);
  if (missing.length) {
    console.log(`${missing.length} referenced file(s) are not in the source bucket — the rows point at something that was deleted:`);
    for (const r of missing) console.log(`  ${r.path}`);
  }
  if (failed.length) {
    console.log(`${failed.length} upload(s) failed:`);
    for (const r of failed) console.log(`  ${r.path} — ${r.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("\nStorage migration failed:", err.message);
  process.exit(1);
});
