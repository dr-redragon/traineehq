import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_HEAD,
  PUBLIC_PAGES,
  findPublicPage,
  renderPublicPageHtml,
  renderSitemap,
} from "./publicPages";

const shell = readFileSync(resolve(__dirname, "../../index.html"), "utf8");

describe("publicPages", () => {
  it("matches the default head in index.html", () => {
    expect(shell).toContain(`<title>${DEFAULT_HEAD.title}</title>`);
    expect(shell).toContain(`<meta name="description" content="${DEFAULT_HEAD.description}" />`);
    expect(shell).toContain('<meta name="robots" content="noindex, nofollow" />');
  });

  it.each(PUBLIC_PAGES)("renders an indexable head for $path", (page) => {
    const html = renderPublicPageHtml(shell, page);
    expect(html).toContain('<meta name="robots" content="index, follow" />');
    expect(html).not.toMatch(/content="noindex/);
    expect(html).toContain(`<link rel="canonical" href="https://traineehq.com${page.path}" />`);
    expect(html).toContain(`<title>${page.title}</title>`);
    expect(html).toContain(`<meta property="og:url" content="https://traineehq.com${page.path}" />`);
  });

  it("lists every public page in the sitemap", () => {
    const xml = renderSitemap();
    for (const p of PUBLIC_PAGES) expect(xml).toContain(`<loc>https://traineehq.com${p.path}</loc>`);
  });

  it("finds pages with or without a trailing slash, and nothing else", () => {
    expect(findPublicPage("/welcome")?.path).toBe("/welcome");
    expect(findPublicPage("/welcome/")?.path).toBe("/welcome");
    expect(findPublicPage("/")).toBeUndefined();
    expect(findPublicPage("/dashboard")).toBeUndefined();
  });
});
