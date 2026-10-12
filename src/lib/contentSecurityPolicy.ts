import { createHash } from "node:crypto";

/**
 * The site's Content Security Policy, written into index.html at build time.
 *
 * GitHub Pages cannot send response headers, so the policy travels as a
 * <meta http-equiv> tag. That carries every directive below except
 * frame-ancestors, which browsers only honour as a header.
 *
 * What it is for: if a stored value ever does reach the page as script —
 * a `javascript:` link, an injected <script>, an inline handler — the browser
 * refuses to run it. Scripts may come only from this origin, plus the one
 * inline theme script in index.html, allowed by its hash rather than by
 * 'unsafe-inline'. The hash is computed from the built HTML, so editing that
 * script cannot leave a stale hash behind.
 *
 * Node-only: imported by vite.config.ts, never by the app.
 */

/** sha256 source expressions for every inline <script> (one with no src). */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    const attrs = match[1] ?? "";
    if (/\ssrc\s*=/i.test(attrs)) continue;
    const digest = createHash("sha256").update(match[2], "utf8").digest("base64");
    hashes.push(`'sha256-${digest}'`);
  }
  return hashes;
}

export function buildCsp(opts: { supabaseUrl: string; scriptHashes: string[] }): string {
  const supabase = new URL(opts.supabaseUrl);
  const api = supabase.origin;
  const realtime = `wss://${supabase.host}`;

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", ...opts.scriptHashes],
    // Radix and the toaster set inline styles; the theme font comes from Google.
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "connect-src": ["'self'", api, realtime],
    // Signed storage URLs, QR codes (data:), downloads (blob:), logos.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "blob:", "https:"],
    // PDFs open in <object> from signed storage URLs.
    "object-src": ["'self'", "blob:", api],
    // Resources link to any https site and to YouTube embeds.
    "frame-src": ["'self'", "blob:", "https:"],
    "worker-src": ["'self'", "blob:"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };

  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

/** index.html with the policy as the first thing in <head>. */
export function withCspMeta(html: string, supabaseUrl: string): string {
  const csp = buildCsp({ supabaseUrl, scriptHashes: inlineScriptHashes(html) });
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;
  return html.replace(/<head>/i, `<head>\n    ${meta}`);
}
