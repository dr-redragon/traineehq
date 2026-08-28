/**
 * Helpers for building PostgREST filter expressions safely.
 *
 * `.or()` / `.and()` take a *string* expression that PostgREST parses itself, so any
 * user- or route-supplied value interpolated into one has to be quoted. Unquoted, a
 * value containing `,` `.` `(` `)` ends the current condition and starts a new one —
 * letting a search box rewrite the filter it is embedded in.
 *
 * Column-level filters built through the query builder (`.eq()`, `.ilike()`, `.in()`)
 * are parameterised by supabase-js and need none of this.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True when the value is a well-formed UUID — use before interpolating an id. */
export function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

/**
 * Quote a value for use inside an `.or()` / `.and()` expression.
 * PostgREST treats a double-quoted string as a single literal; `\` and `"` are
 * escaped so the quoting cannot be broken out of.
 */
export function orFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Quote a user-supplied search term as an `ilike` pattern for an `.or()` expression.
 * Wildcards the caller did not intend (`%`, `_`) are escaped, then the whole pattern
 * is quoted, so a term like `a,b)` or `100%` cannot alter the filter.
 */
export function orIlikePattern(term: string): string {
  const escaped = term.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&");
  return orFilterValue(`%${escaped}%`);
}
