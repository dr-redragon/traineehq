/**
 * Where to send somebody after they sign in.
 *
 * Both sign-in pages take the page the auth guard turned the visitor away from
 * and return them to it. That value arrives from router state, so it has to be
 * treated as untrusted: a `from` of "https://example.invalid" would turn a
 * sign-in form into an open redirect, and one of "//example.invalid" would too —
 * a protocol-relative URL is an absolute one wearing a path's clothes, and is
 * the case a naive `startsWith("/")` check lets through.
 *
 * Only a path within this application is honoured. Anything else falls back.
 */
export function safeDestination(requested: unknown, fallback: string): string {
  if (typeof requested !== "string") return fallback;

  const path = requested.trim();
  if (!path.startsWith("/")) return fallback;      // absolute or relative to elsewhere
  if (path.startsWith("//")) return fallback;      // protocol-relative
  if (path.startsWith("/\\")) return fallback;     // some browsers read \ as /

  // A backslash anywhere in the authority position is treated as a separator by
  // enough parsers to be worth refusing outright rather than reasoning about.
  if (path.includes("\\")) return fallback;

  return path;
}
