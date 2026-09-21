/**
 * A short "how long ago" label, for places too narrow for a full date.
 *
 * `DriveRow.tsx` already has a similar helper for its own Updated column,
 * where there is a whole table column to spend on it. This is for a place
 * with far less room — a dashboard widget row, stacked above an equally
 * small resource type — so it goes further: "3d ago" rather than "3 days
 * ago", "2w ago" rather than "2 weeks ago". Past a month it falls back to a
 * bare month and year, since by then the exact day is rarely the point.
 */
export function formatRelativeCompact(date?: string | null): string {
  if (!date) return "—";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "—";

  const days = Math.floor((Date.now() - parsed.getTime()) / 86_400_000);
  if (days < 0) return "Today"; // a clock skew away, not a future resource
  if (days < 1) return "Today";
  if (days === 1) return "Yest.";
  if (days < 7) return `${days}d ago`;
  if (days < 31) return `${Math.floor(days / 7)}w ago`;
  return parsed.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
