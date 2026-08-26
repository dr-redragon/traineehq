// Server-side ZIP builder for resource downloads.
// Accepts a list of storage paths (+ optional folder labels + display names),
// streams each file from the "resources" bucket, packages them into a ZIP,
// and returns the ZIP as a binary response with Content-Disposition: attachment.
//
// This bypasses Safari iframe blob-download restrictions because the browser
// receives a real HTTP response with attachment headers.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers":
    "Content-Disposition, X-Files-Included, X-Files-Skipped",
};

interface ZipItem {
  path: string;          // storage path inside the "resources" bucket
  fileName: string;      // desired file name inside the zip
  folderName?: string;   // optional sub-folder label inside the zip
}

interface ZipRequest {
  items: ZipItem[];
  zipName?: string;
}

const INVALID = /[\\/:*?"<>|]+/g;
const CONTROL = /[\u0000-\u001f\u007f]+/g;

function sanitize(name: string, fallback: string) {
  const out = (name ?? "")
    .replace(INVALID, "-")
    .replace(CONTROL, "")
    .replace(/\s+/g, " ")
    .trim();
  return out || fallback;
}

function uniquePath(candidate: string, used: Set<string>) {
  const key = candidate.toLowerCase();
  if (!used.has(key)) {
    used.add(key);
    return candidate;
  }
  const dot = candidate.lastIndexOf(".");
  const base = dot > 0 ? candidate.slice(0, dot) : candidate;
  const ext = dot > 0 ? candidate.slice(dot) : "";
  let n = 2;
  let next = `${base} (${n})${ext}`;
  while (used.has(next.toLowerCase())) {
    n++;
    next = `${base} (${n})${ext}`;
  }
  used.add(next.toLowerCase());
  return next;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    // Confirm the caller is authenticated (RLS will scope storage downloads).
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as ZipRequest;
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return new Response(JSON.stringify({ error: "No items to zip" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const zip = new JSZip();
    const used = new Set<string>();
    const skipped: string[] = [];
    let included = 0;

    for (const item of items) {
      if (!item?.path) {
        skipped.push(item?.fileName ?? "unknown");
        continue;
      }
      const { data, error } = await supabase.storage
        .from("resources")
        .download(item.path);
      if (error || !data) {
        console.error("download failed", item.path, error);
        skipped.push(item.fileName ?? item.path);
        continue;
      }
      const folderPrefix = item.folderName
        ? `${sanitize(item.folderName, "folder")}/`
        : "";
      const safeName = sanitize(item.fileName, "file");
      const finalPath = uniquePath(`${folderPrefix}${safeName}`, used);
      zip.file(finalPath, await data.arrayBuffer());
      included++;
    }

    if (included === 0) {
      return new Response(
        JSON.stringify({ error: "No files could be downloaded", skipped }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const zipBytes = await zip.generateAsync({ type: "uint8array" });
    const zipName = sanitize(
      (body.zipName ?? "resources").replace(/\.zip$/i, ""),
      "resources",
    );

    return new Response(zipBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}.zip"`,
        "X-Files-Included": String(included),
        "X-Files-Skipped": String(skipped.length),
      },
    });
  } catch (e) {
    console.error("zip-resources error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
