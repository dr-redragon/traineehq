import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  DEFAULT_HEAD,
  INDEX,
  NOINDEX,
  canonicalUrl,
  findPublicPage,
} from "@/lib/publicPages";

function setMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLink(rel: string, href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

/**
 * Keeps the title, description, robots and canonical tags in step with the
 * route. Renders nothing; mount it once inside the router.
 *
 * A crawler loads each URL fresh and reads the head the build wrote for it
 * (see lib/publicPages.ts); this is for in-app navigation, so that leaving
 * /welcome for the dashboard does not carry /welcome's "index" along with it.
 */
export function PageHead() {
  const { pathname } = useLocation();

  useEffect(() => {
    const page = findPublicPage(pathname);
    const head = page ?? DEFAULT_HEAD;
    const url = page ? canonicalUrl(page) : null;

    document.title = head.title;
    setMeta('meta[name="description"]', "name", "description", head.description);
    setMeta('meta[name="robots"]', "name", "robots", page ? INDEX : NOINDEX);
    setMeta('meta[property="og:title"]', "property", "og:title", head.title);
    setMeta('meta[property="og:description"]', "property", "og:description", head.description);
    setLink("canonical", url);
    if (url) setMeta('meta[property="og:url"]', "property", "og:url", url);
    else document.head.querySelector('meta[property="og:url"]')?.remove();
  }, [pathname]);

  return null;
}
