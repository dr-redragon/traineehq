// The one look every TraineeHQ email shares.
//
// The same design as the Supabase Auth templates in supabase/templates/: a
// dark band with the TraineeHQ wordmark, an accent rule, a small uppercase
// kicker, an Archivo heading, a square button and a footer saying why the
// email came. Every edge function that sends mail builds its message with
// renderEmail() so the hub's own emails and Supabase's read as one product.
//
// This file is the source. Each function deploys on its own, so each carries a
// copy named email-layout.ts. Edit this file, then run `npm run sync:email`;
// a unit test fails if any copy has drifted.
//
// Colours default to TraineeHQ red. Set EMAIL_ACCENT, EMAIL_INK or
// EMAIL_GROUND (hex, in Supabase → Edge Functions → Secrets) to match the
// colour scheme chosen for the Supabase templates. No redeploy is needed.

export interface EmailPalette {
  accent: string;
  ink: string;
  ground: string;
}

export const DEFAULT_PALETTE: EmailPalette = { accent: "#dd2b0f", ink: "#201e1d", ground: "#f3f2f2" };

const FONT = "'Archivo', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const TEXT = "#3d3a39";
const MUTED = "#605d5d";
const RULE = "#d9d6d6";

const HEX = /^#[0-9a-f]{6}$/i;

/** The palette from the EMAIL_* secrets, falling back per colour to the default. */
export function paletteFromEnv(): EmailPalette {
  // Read through globalThis so this file also loads outside Deno, in the tests.
  const env = (globalThis as { Deno?: { env?: { get(name: string): string | undefined } } }).Deno?.env;
  const pick = (name: string, fallback: string) => {
    const v = String(env?.get?.(name) ?? "").trim();
    return HEX.test(v) ? v : fallback;
  };
  return {
    accent: pick("EMAIL_ACCENT", DEFAULT_PALETTE.accent),
    ink: pick("EMAIL_INK", DEFAULT_PALETTE.ink),
    ground: pick("EMAIL_GROUND", DEFAULT_PALETTE.ground),
  };
}

/** Escape anything interpolated into an email: names, notes and titles are user-written. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) =>
  "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a: string, b: string, t: number) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
const luminance = (h: string) => {
  const [r, g, b] = rgb(h).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The shades the layout needs, worked out from the three chosen colours. */
function shades(p: EmailPalette) {
  const lum = luminance(p.accent);
  return {
    ...p,
    deep: mix(p.accent, "#000000", lum > 0.3 ? 0.5 : 0.22),
    tint: mix(p.accent, "#ffffff", 0.93),
    light: mix(p.accent, "#ffffff", 0.5),
    buttonText: (1.05) / (lum + 0.05) >= 3 ? "#ffffff" : "#201e1d",
  };
}

/** A paragraph of body copy. The html is used as given: escape anything user-written first. */
export function paragraph(html: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${TEXT}">${html}</p>`;
}

/** Small print, under the main message. */
export function small(html: string): string {
  return `<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${MUTED}">${html}</p>`;
}

/** Label-and-value rows, for the details of a request. Values are escaped here. */
export function details(rows: [string, unknown][]): string {
  const body = rows
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `<tr>
        <td width="110" style="width:110px;padding:8px 12px 8px 0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};vertical-align:top;white-space:nowrap">${esc(k)}</td>
        <td style="padding:8px 0;font-size:15px;color:${TEXT};vertical-align:top">${esc(v)}</td>
      </tr>`)
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;border-top:1px solid ${RULE};border-bottom:1px solid ${RULE};width:100%">${body}</table>`;
}

export interface EmailParts {
  /** The small uppercase line above the heading, e.g. "Account request". */
  kicker: string;
  heading: string;
  /** Body html, built with paragraph(), details() and small(). */
  body: string;
  button?: { label: string; url: string };
  /** A boxed note under the button: a reviewer's reason, a "wasn't you?" warning. Html. */
  notice?: string;
  /** Why the person got this email, at the foot. Plain text; escaped here. */
  reason: string;
  /** The inbox preview line. Plain text; escaped here. */
  preheader?: string;
  /** Overrides the "TraineeHQ" sign-off, e.g. a register's own name. Plain text. */
  from?: string;
}

const SITE_URL = "https://traineehq.com";

export function renderEmail(parts: EmailParts, palette: EmailPalette = paletteFromEnv()): string {
  const c = shades(palette);
  const button = parts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 8px">
        <tr><td bgcolor="${c.accent}" style="background:${c.accent}">
          <a href="${esc(parts.button.url)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:700;color:${c.buttonText};text-decoration:none">${esc(parts.button.label)}&nbsp;&rarr;</a>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:${MUTED}">
        Button not working? Copy this link into your browser:<br>
        <a href="${esc(parts.button.url)}" style="color:${c.deep};word-break:break-all">${esc(parts.button.url)}</a>
      </p>`
    : "";
  const notice = parts.notice
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0">
        <tr><td style="background:${c.tint};border-left:3px solid ${c.accent};padding:14px 16px;font-size:14px;line-height:1.6;color:${TEXT}">${parts.notice}</td></tr>
      </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <title>${esc(parts.heading)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${c.ground};-webkit-text-size-adjust:100%">
  ${parts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${c.ground}">${esc(parts.preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.ground}" style="background:${c.ground}">
    <tr><td align="center" style="padding:32px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:${FONT}">
        <tr><td bgcolor="${c.ink}" style="background:${c.ink};padding:20px 32px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="14" height="14" bgcolor="${c.accent}" style="background:${c.accent};width:14px;height:14px;font-size:0;line-height:0">&nbsp;</td>
            <td style="padding-left:10px;font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#ffffff">TraineeHQ</td>
          </tr></table>
          <p style="margin:6px 0 0;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${c.light}">Higher specialty training</p>
        </td></tr>
        <tr><td height="4" bgcolor="${c.accent}" style="background:${c.accent};height:4px;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td bgcolor="#ffffff" style="background:#ffffff;padding:36px 32px 32px">
          <p style="margin:0 0 10px;font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:${c.deep}">${esc(parts.kicker)}</p>
          <h1 style="margin:0 0 20px;font-family:${FONT};font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;color:${c.ink}">${esc(parts.heading)}</h1>
          ${parts.body}
          ${button}
          ${notice}
          ${parts.from ? `<p style="margin:26px 0 0;font-size:14px;color:${MUTED}">&mdash; ${esc(parts.from)}</p>` : ""}
        </td></tr>
        <tr><td style="padding:20px 32px 0;border-top:2px solid ${RULE}">
          <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:${MUTED}">${esc(parts.reason)}</p>
          <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED}">
            <strong style="color:${c.ink}">TraineeHQ</strong> &middot; Resources for NHS higher specialty trainees &middot;
            <a href="${SITE_URL}" style="color:${c.deep};text-decoration:underline">traineehq.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
