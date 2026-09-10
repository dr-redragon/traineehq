/**
 * The register's three bands, and the colours it shows them in.
 *
 * Its own module rather than sitting beside the table it is used by: a file that
 * exports both a component and a plain function loses fast refresh, and this is
 * shared by the table and the report.
 *
 * null is "no adjusted percentage" — the trainee was eligible for none of the
 * sessions in scope — which is a different thing from 0% and is shown muted
 * rather than red.
 */
export function pctColor(p: number | null): string {
  if (p === null) return "var(--muted)";
  if (p >= 80) return "var(--good)";
  if (p >= 60) return "var(--warn)";
  return "var(--bad)";
}
