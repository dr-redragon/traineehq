/**
 * Which search results a person is allowed to be shown.
 *
 * The database is the boundary: row-level security already refuses to hand a
 * signed-in user rows from a specialty they are not assigned to, and no filter
 * written here could loosen that. What this adds is the rule the database does
 * not encode — a specialty an admin has switched to inactive, or moved to
 * another deanery, is withdrawn from the people assigned to it, and its
 * sections, files and threads go with it.
 *
 * It is kept as plain functions over ids so the rule can be tested directly,
 * and so it can be applied a second time on the client after the queries come
 * back. That second pass is deliberate belt-and-braces: the queries filter
 * server-side, and if one of those filters is ever dropped or an embedded
 * filter silently stops applying, the results are still trimmed here rather
 * than quietly widening.
 */

/** The ids of the specialties a person may see, for fast repeated lookup. */
export function toVisibleIdSet(
  specialties: readonly { id: string }[] | undefined,
): Set<string> {
  return new Set((specialties ?? []).map((s) => s.id));
}

/**
 * Whether a row hanging off a specialty may be shown.
 *
 * `allowUnscoped` covers rows that deliberately belong to no specialty — a
 * contact in the general directory, say, which every signed-in person is meant
 * to find. Everything else with no specialty is treated as not visible, so a
 * missing join cannot turn into an accidental pass.
 */
export function isVisibleForSpecialty(
  specialtyId: string | null | undefined,
  visible: ReadonlySet<string>,
  { allowUnscoped = false }: { allowUnscoped?: boolean } = {},
): boolean {
  if (specialtyId == null) return allowUnscoped;
  return visible.has(specialtyId);
}

/** Drops the rows whose specialty is not visible, keeping order. */
export function keepVisible<T>(
  rows: readonly T[] | undefined,
  specialtyIdOf: (row: T) => string | null | undefined,
  visible: ReadonlySet<string>,
  opts: { allowUnscoped?: boolean } = {},
): T[] {
  return (rows ?? []).filter((row) => isVisibleForSpecialty(specialtyIdOf(row), visible, opts));
}

/**
 * The same match the database does for a search term, run over a list already
 * in memory.
 *
 * The specialties a person can see are fetched in full for the rail anyway, so
 * searching them means filtering that list rather than asking the server again
 * — one fewer round trip, and no chance of the query and the rail disagreeing
 * about which specialties exist.
 */
export function matchesTerm(term: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return false;
  return fields.some((f) => (f ?? "").toLowerCase().includes(needle));
}
