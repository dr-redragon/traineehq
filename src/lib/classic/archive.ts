/**
 * How long an archived register has left.
 *
 * The window itself lives in the database — `classic_register_archive()`
 * returns a `purge_at` with every row, and everything here is read off that
 * rather than counting fifteen days over again in the browser. A clock that
 * disagreed with the one enforcing the deadline would be worse than no clock:
 * it would promise a day that is not there.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days remaining, rounded up.
 *
 * Up rather than down so a register archived a minute ago reads "15 days
 * left" rather than "14": the count answers "how long have I got", and the
 * honest answer on the first day is the whole fifteen. Never negative — past
 * the deadline is its own state, not a negative number of days.
 */
export function daysUntilPurge(purgeAt: string, now: Date = new Date()): number {
  const remaining = new Date(purgeAt).getTime() - now.getTime();
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  return Math.ceil(remaining / DAY_MS);
}

/**
 * The countdown as an organiser reads it.
 *
 * The last day is called out rather than rounded to "1 day", because that is
 * the one where the difference between acting now and acting tomorrow is the
 * register itself.
 */
export function purgeCountdown(purgeAt: string, now: Date = new Date()): string {
  const remaining = new Date(purgeAt).getTime() - now.getTime();
  if (!Number.isFinite(remaining) || remaining <= 0) return "Due to be deleted";
  if (remaining < DAY_MS) return "Less than a day left";
  const days = daysUntilPurge(purgeAt, now);
  return `${days} ${days === 1 ? "day" : "days"} left`;
}

/** "3 days ago", for the date it went into the archive. */
export function archivedAgo(archivedAt: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(archivedAt).getTime();
  if (!Number.isFinite(elapsed)) return "recently";
  if (elapsed < 60 * 60 * 1000) return "in the last hour";
  if (elapsed < DAY_MS) {
    const hours = Math.floor(elapsed / (60 * 60 * 1000));
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(elapsed / DAY_MS);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
