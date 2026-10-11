/**
 * A link stored by a person, made safe to put in an href, a src or window.open.
 *
 * Resource links are typed in by admins and facilitators, and everybody who can
 * see the resource opens them. A `javascript:` URL in an iframe's src runs in
 * this app's origin — with the signed-in session in reach — the moment the
 * viewer opens, and in an href on the first click. `data:` and `vbscript:`
 * are the same idea by other means.
 *
 * So only absolute http(s) URLs are honoured. Everything else yields null and
 * the caller shows nothing. The database refuses other schemes too (see
 * 20261011120000); this is the second layer, for rows written before that.
 */
export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;   // not absolute — a bare storage path is not a link
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return url.toString();
}

/**
 * For the forms that store a link: empty is "no link", a web address is kept,
 * and anything else is refused with a message a person can act on — rather
 * than the database's constraint error after a file has already uploaded.
 */
export function linkFromInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const safe = safeExternalUrl(trimmed);
  if (!safe) throw new Error("Links must be web addresses starting with https:// or http://");
  return safe;
}
