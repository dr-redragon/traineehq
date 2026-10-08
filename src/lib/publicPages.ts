/**
 * The pages search engines may index, and the head each one carries.
 *
 * Everything else stays noindex: the shell in index.html says so, and it is
 * what every other path is served. Two things read this list —
 *
 *  - the build (vite.config.ts), which writes a copy of the shell per page with
 *    this head swapped in, plus sitemap.xml. GitHub Pages serves /welcome from
 *    welcome.html with a 200; without the file it would fall through to
 *    404.html, and a page answered with a 404 status is never indexed however
 *    good its tags are.
 *  - the app (components/PageHead.tsx), which applies the same head on
 *    client-side navigation, so moving between pages never leaves one page's
 *    tags on another.
 */

export const SITE_URL = "https://traineehq.com";

export interface PageHeadTags {
  title: string;
  description: string;
}

export interface PublicPage extends PageHeadTags {
  /** Route path, as in App.tsx. Also the canonical URL's path. */
  path: string;
}

/** What index.html carries. Keep the two in step. */
export const DEFAULT_HEAD: PageHeadTags = {
  title: "HST Training Hub | NHS Higher Specialty Training Resources",
  description:
    "A secure, centralised hub of curricula, exam preparation, operative videos and key contacts for NHS Higher Surgical and Medical Specialty Trainees.",
};

export const NOINDEX = "noindex, nofollow";
export const INDEX = "index, follow";

export const PUBLIC_PAGES: PublicPage[] = [
  {
    path: "/welcome",
    title: "HST Training Hub | Resources for NHS Higher Specialty Trainees",
    description:
      "A centralised resource hub for NHS Higher Surgical and Medical Specialty Trainees: curricula, exam preparation, operative videos and key contacts in one secure platform.",
  },
  {
    path: "/request-access",
    title: "Request Access | HST Training Hub",
    description:
      "Request an account for the HST Training Hub, the resource hub for NHS Higher Specialty Trainees. Accounts are approved by the programme admin team.",
  },
  {
    path: "/contact",
    title: "Contact | HST Training Hub",
    description:
      "Get in touch with the HST Training Hub programme admin team about the hub, your account or a resource.",
  },
];

export function findPublicPage(pathname: string): PublicPage | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return PUBLIC_PAGES.find((p) => p.path === path);
}

export function canonicalUrl(page: PublicPage): string {
  return SITE_URL + page.path;
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The shell's HTML with this page's head in place of the default one. Throws
 * if a tag it expects is missing, so a change to index.html that would
 * silently ship an unindexable page fails the build instead.
 */
export function renderPublicPageHtml(shell: string, page: PublicPage): string {
  const title = escapeAttr(page.title);
  const description = escapeAttr(page.description);
  const url = escapeAttr(canonicalUrl(page));

  const swaps: [RegExp, string][] = [
    [/<title>[^<]*<\/title>/, `<title>${title}</title>`],
    [/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${description}" />`],
    [/<meta name="robots" content="[^"]*" \/>/, `<meta name="robots" content="${INDEX}" />\n    <link rel="canonical" href="${url}" />`],
    [/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${title}" />`],
    [/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${description}" />\n    <meta property="og:url" content="${url}" />`],
  ];

  return swaps.reduce((html, [pattern, replacement]) => {
    if (!pattern.test(html)) {
      throw new Error(`publicPages: index.html has no tag matching ${pattern} to replace for ${page.path}`);
    }
    return html.replace(pattern, replacement);
  }, shell);
}

export function renderSitemap(pages: PublicPage[] = PUBLIC_PAGES): string {
  const urls = pages.map((p) => `  <url>\n    <loc>${canonicalUrl(p)}</loc>\n  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
