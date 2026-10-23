#!/usr/bin/env node
// Load a specialty's documents and links into TraineeHQ from a manifest, the
// way an admin would through "Add resource": each file is uploaded to the
// `resources` bucket and gets a resources row in the right section.
//
//   node scripts/import-specialty-documents.mjs content/nwpgmd/ent/manifest.json [--dry-run]
//
// Signs in as an admin (TRAINEEHQ_ADMIN_EMAIL / TRAINEEHQ_ADMIN_PASSWORD) with
// the app's own URL and publishable key from .env, so row-level security
// applies exactly as in the app. SUPABASE_SERVICE_ROLE_KEY may be given
// instead of the login.
//
// Sections: each manifest section is filed into the specialty's first existing
// section whose name matches its `match` pattern, so documents land in the
// sections admins already made; a section with no match is created under the
// manifest's name. Re-running is safe: a resource whose title is already in
// that section is skipped.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const MIME = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** The same types AddResourceDialog gives a dropped file. */
export function resourceTypeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".pptx" || ext === ".ppt") return "presentation";
  return "document";
}

/**
 * Where each manifest section goes: the first existing subsection (in display
 * order) whose name matches, else a new one. Two manifest sections never
 * share a subsection unless the admin's own naming makes them.
 */
export function planSections(sections, subsections) {
  const ordered = [...subsections].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return sections.map((section) => {
    const re = new RegExp(section.match, "i");
    const existing = ordered.find((s) => re.test(s.name));
    return { section, subsection: existing ?? null, create: !existing };
  });
}

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, "utf8").split("\n")
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/))
      .filter(Boolean).map((m) => [m[1], m[2]]),
  );
}

async function main() {
  const args = process.argv.slice(2);
  const manifestPath = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  if (!manifestPath) {
    console.error("usage: import-specialty-documents.mjs <manifest.json> [--dry-run]");
    process.exit(2);
  }
  const dir = path.dirname(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  // Every file the manifest names must be here before anything is written.
  for (const s of manifest.sections) for (const r of s.resources) {
    if (r.file && !fs.existsSync(path.join(dir, r.file))) throw new Error(`Missing file: ${r.file}`);
  }

  const env = { ...readEnv(path.resolve(".env")), ...process.env };
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or .env)");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let userId = null;
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    if (!env.TRAINEEHQ_ADMIN_EMAIL || !env.TRAINEEHQ_ADMIN_PASSWORD) {
      throw new Error("Set TRAINEEHQ_ADMIN_EMAIL and TRAINEEHQ_ADMIN_PASSWORD (an admin of the deanery)");
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: env.TRAINEEHQ_ADMIN_EMAIL, password: env.TRAINEEHQ_ADMIN_PASSWORD,
    });
    if (error) throw new Error(`Sign-in failed: ${error.message}`);
    userId = data.user.id;
  }

  const { data: deaneries, error: dErr } = await supabase.from("deaneries").select("id, name");
  if (dErr) throw dErr;
  const deanery = deaneries.find((d) => d.name.toLowerCase().includes(manifest.specialty.deanery));
  if (!deanery) throw new Error(`No deanery matching "${manifest.specialty.deanery}"`);

  const { data: specialties, error: sErr } = await supabase
    .from("specialties").select("id, name, short_name")
    .eq("deanery_id", deanery.id).is("deleted_at", null);
  if (sErr) throw sErr;
  const specRe = new RegExp(manifest.specialty.match, "i");
  const matches = specialties.filter((s) => specRe.test(`${s.name} ${s.short_name}`));
  if (matches.length !== 1) {
    throw new Error(`Expected one specialty matching /${manifest.specialty.match}/, found ${matches.map((s) => s.short_name).join(", ") || "none"}`);
  }
  const specialty = matches[0];
  console.log(`${deanery.name} · ${specialty.short_name} (${specialty.id})${dryRun ? " — dry run" : ""}`);

  const { data: subsections, error: subErr } = await supabase
    .from("subsections").select("id, name, sort_order").eq("specialty_id", specialty.id);
  if (subErr) throw subErr;
  let nextSectionOrder = Math.max(-1, ...subsections.map((s) => s.sort_order ?? 0)) + 1;

  let added = 0, skipped = 0;
  for (const { section, subsection: found, create } of planSections(manifest.sections, subsections)) {
    let subsection = found;
    if (create) {
      console.log(`\n+ section "${section.name}" (new)`);
      if (!dryRun) {
        const { data, error } = await supabase.from("subsections")
          .insert({ specialty_id: specialty.id, name: section.name, sort_order: nextSectionOrder++ })
          .select("id, name").single();
        if (error) throw error;
        subsection = data;
      }
    } else {
      console.log(`\n= section "${section.name}" → existing "${subsection.name}"`);
    }

    const existing = subsection?.id
      ? (await supabase.from("resources").select("title, sort_order").eq("subsection_id", subsection.id)).data ?? []
      : [];
    const titles = new Set(existing.map((r) => r.title.trim().toLowerCase()));
    let nextOrder = Math.max(-1, ...existing.map((r) => r.sort_order ?? 0)) + 1;

    for (const r of section.resources) {
      if (titles.has(r.title.trim().toLowerCase())) {
        console.log(`  · ${r.title} (already there)`);
        skipped++;
        continue;
      }
      console.log(`  + ${r.title}${r.file ? ` [${r.file}]` : ` → ${r.url}`}`);
      if (dryRun) { added++; continue; }

      let fileUrl = null, fileSize = null;
      if (r.file) {
        const body = fs.readFileSync(path.join(dir, r.file));
        const ext = path.extname(r.file).toLowerCase();
        fileUrl = `${specialty.id}/${subsection.id}/${crypto.randomUUID()}${ext}`;
        const { error } = await supabase.storage.from("resources")
          .upload(fileUrl, body, { contentType: MIME[ext] ?? "application/octet-stream" });
        if (error) throw new Error(`Upload failed for ${r.file}: ${error.message}`);
        fileSize = body.length;
      }
      const { error } = await supabase.from("resources").insert({
        title: r.title,
        description: [r.description, r.source ? `Source: ${r.source}` : null].filter(Boolean).join("\n\n") || null,
        resource_type: r.file ? resourceTypeFor(r.file) : "link",
        subsection_id: subsection.id,
        file_url: fileUrl,
        external_url: r.url ?? null,
        file_size: fileSize,
        added_by: userId,
        sort_order: nextOrder++,
      });
      if (error) throw new Error(`Could not add "${r.title}": ${error.message}`);
      added++;
    }
  }
  console.log(`\n${dryRun ? "Would add" : "Added"} ${added}, skipped ${skipped} already present.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
