import type { RegisterSession } from "./types";

/**
 * Months and academic years.
 *
 * Ported from ent-teaching-register/index.html. Everything here works on the
 * 'YYYY-MM' string form, which sorts and compares correctly as text — which is
 * why the eligibility rules can use `<` and `>=` on months directly.
 *
 * The register year runs **August to July**: Aug 2025 – Jul 2026 is "2025/26".
 */

/** The sentinel a year picker uses for "every year, stacked". */
export const ALL_YEARS = "__all__";

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const MONTH_ABBR = MONTH_NAMES.map((m) => m.slice(0, 3));

/**
 * Normalise a typed month to 'YYYY-MM', or '' if it cannot be read.
 *
 * Deliberately forgiving, because organisers type these by hand: `2026-01`,
 * `01/2026`, `1/26`, `Jan 2026`, `january 2026`, `2026 March`, `sept 26`,
 * `202601` all work. Ordering matters — `YYYY-MM` is tried before `MM-YYYY`, so
 * `2026-01` is January 2026 and not something in the year 1.
 */
export function parseMonth(raw: string | null | undefined): string {
  if (!raw) return "";

  const s = String(raw).trim().toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";

  const pad = (n: number) => String(n).padStart(2, "0");

  let m = s.match(/^(\d{4})[-/ ](\d{1,2})$/);                 // YYYY-MM, YYYY/MM
  if (m) {
    const mo = +m[2];
    if (mo >= 1 && mo <= 12) return `${m[1]}-${pad(mo)}`;
  }

  m = s.match(/^(\d{1,2})[-/ ](\d{4})$/);                     // MM-YYYY, MM/YYYY
  if (m) {
    const mo = +m[1];
    if (mo >= 1 && mo <= 12) return `${m[2]}-${pad(mo)}`;
  }

  m = s.match(/^(\d{1,2})[-/ ](\d{2})$/);                     // MM/YY — assumed 2000s
  if (m) {
    const mo = +m[1];
    if (mo >= 1 && mo <= 12) return `20${m[2]}-${pad(mo)}`;
  }

  // Month names and abbreviations, either way round. 'sept' is listed
  // separately because it is neither the full name nor the three-letter form,
  // and people write it.
  const names: [string, number][] = [
    ...MONTH_NAMES.map((n, i): [string, number] => [n.toLowerCase(), i]),
    ...MONTH_ABBR.map((n, i): [string, number] => [n.toLowerCase(), i]),
    ["sept", 8],
  ];

  for (const [name, index] of names) {
    const after = s.match(new RegExp(`^${name}[a-z]* (\\d{2,4})$`));   // "jan 2026"
    const before = s.match(new RegExp(`^(\\d{2,4}) ${name}[a-z]*$`));  // "2026 march"
    const hit = after ?? before;
    if (hit) {
      const year = hit[1].length === 2 ? `20${hit[1]}` : hit[1];
      return `${year}-${pad(index + 1)}`;
    }
  }

  m = s.match(/^(\d{4})(\d{2})$/);                             // YYYYMM
  if (m) {
    const mo = +m[2];
    if (mo >= 1 && mo <= 12) return `${m[1]}-${m[2]}`;
  }

  return "";
}

/**
 * 'YYYY-MM' to a display string, e.g. "Jan 2026".
 *
 * `locale` is exposed so this can be asserted on; left undefined it follows the
 * browser, as the original does.
 */
export function formatMonth(value: string | null | undefined, locale?: string): string {
  if (!value) return "";
  const [y, mo] = value.split("-").map(Number);
  if (!y || !mo) return "";
  try {
    return new Date(y, mo - 1, 1).toLocaleDateString(locale, { month: "short", year: "numeric" });
  } catch {
    return `${MONTH_ABBR[mo - 1]} ${y}`;
  }
}

/** The calendar year an academic year starts in: Aug 2025 – Jul 2026 gives 2025. */
export function academicYearStart(month: string): number {
  const [y, m] = String(month).split("-").map(Number);
  return m >= 8 ? y : y - 1;
}

/** 2025 to "2025/26". */
export function academicYearLabel(startYear: number): string {
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

/** The academic year a month falls in, e.g. '2025-09' to "2025/26". */
export function academicYearOf(month: string): string {
  return academicYearLabel(academicYearStart(month));
}

/** "2025/26" to "Aug 2025 – Jul 2026". */
export function academicYearRange(label: string): string {
  const y = Number(String(label).split("/")[0]);
  return `Aug ${y} – Jul ${y + 1}`;
}

/** Today's month as 'YYYY-MM'. */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function currentAcademicYear(now: Date = new Date()): string {
  return academicYearLabel(now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1);
}

/** Sessions oldest first. Month strings sort correctly as text. */
export function sessionsSorted(sessions: RegisterSession[]): RegisterSession[] {
  return [...sessions].sort((a, b) => a.month.localeCompare(b.month));
}

/** Every academic year that has at least one teaching day, oldest first. */
export function availableAcademicYears(sessions: RegisterSession[]): string[] {
  return [...new Set(sessions.map((s) => academicYearOf(s.month)))].sort();
}

export function sessionsInYear(sessions: RegisterSession[], label: string): RegisterSession[] {
  return sessionsSorted(sessions).filter((s) => academicYearOf(s.month) === label);
}

/**
 * Which year a fresh view should open on: the current one when it has sessions,
 * otherwise the most recent one that does. `ALL_YEARS` when there are none at all.
 */
export function defaultAcademicYear(sessions: RegisterSession[], now: Date = new Date()): string {
  const years = availableAcademicYears(sessions);
  if (!years.length) return ALL_YEARS;
  const current = currentAcademicYear(now);
  return years.includes(current) ? current : years[years.length - 1];
}
