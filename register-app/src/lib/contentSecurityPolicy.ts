/**
 * The content security policy, built for one Supabase project.
 *
 * It is the second line of defence against script injection — the first being
 * that React escapes everything it renders and nothing in this app uses
 * dangerouslySetInnerHTML. With this policy, markup that did somehow get
 * through still could not run script, load script from elsewhere, or send
 * data anywhere but this project's own Supabase.
 *
 *   script-src 'self'      no inline script, no eval, nothing from a CDN
 *   connect-src            this Supabase project only (https and realtime wss)
 *   img-src                'self', generated images, and the project's storage
 *                          (certificate logos)
 *   style-src 'unsafe-inline'   Radix positions popovers with inline styles;
 *                          styles cannot run code, script-src is what matters
 *   object-src / base-uri / form-action   closed
 *
 * It ships as a <meta> tag so it also applies inside the native apps, which
 * have no response headers. `frame-ancestors` cannot be set from a meta tag;
 * netlify.toml and vercel.json send it as a header.
 */
export function contentSecurityPolicy(supabaseUrl: string | undefined): string {
  let origin = "";
  try {
    origin = supabaseUrl ? new URL(supabaseUrl).origin : "";
  } catch { /* not a URL: connect-src stays 'self' */ }
  const ws = origin.replace(/^http/, "ws");

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob:${origin ? ` ${origin}` : ""}`,
    `connect-src 'self'${origin ? ` ${origin} ${ws}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function withCspMeta(html: string, supabaseUrl: string | undefined): string {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(supabaseUrl)}" />`;
  return html.replace("<head>", `<head>\n    ${tag}`);
}
