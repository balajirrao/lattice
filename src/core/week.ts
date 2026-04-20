/**
 * ISO 8601 week helpers. Pure. No Date side effects beyond the caller's input.
 *
 * Week id format: `YYYY-Www` (e.g. `2026-W17`). Lexicographic order matches
 * chronological order, which lets us sort week notes with a plain string sort.
 */

/** Compute the ISO week id for a date. */
export function weekId(date: Date): string {
  // Shift to the Thursday of the current ISO week (ISO weeks are defined so
  // that each week contains exactly one Thursday).
  const t = new Date(Date.UTC(
    date.getFullYear(), date.getMonth(), date.getDate(),
  ));
  const day = t.getUTCDay() || 7; // Mon=1..Sun=7
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Title used for storage: `weekly/<id>`. */
export function weekTitle(id: string): string {
  return `weekly/${id}`;
}

/** True if the given note title is a weekly note. */
export function isWeeklyTitle(title: string): boolean {
  return /^weekly\/\d{4}-W\d{2}$/.test(title);
}

/** Extract week id from a weekly title, or null if not weekly. */
export function titleToWeekId(title: string): string | null {
  return isWeeklyTitle(title) ? title.slice("weekly/".length) : null;
}

/**
 * Given a set of existing week ids and a target id, find the most recent
 * predecessor (lexicographically less than target). Returns null if none.
 */
export function mostRecentPrevWeek(
  existing: readonly string[],
  target: string,
): string | null {
  const prior = existing.filter((id) => id < target).sort();
  return prior.length > 0 ? prior[prior.length - 1] : null;
}

/** Weekday labels used for day-section blocks inside a week note. */
export const WEEKDAY_NAMES = [
  "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
] as const;

/** Return the weekday label ("Mon".."Sun") for the given local date. */
export function weekdayFor(date: Date): typeof WEEKDAY_NAMES[number] {
  const d = date.getDay(); // 0=Sun..6=Sat
  return WEEKDAY_NAMES[d === 0 ? 6 : d - 1];
}

/** Monday 00:00 UTC of the Monday-start ISO week for a given id. */
function isoWeekStartUtc(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1..7 (Mon..Sun)
  const start = new Date(jan4);
  start.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (week - 1) * 7);
  return start;
}

/** Start (Mon) and end (Sun) of the ISO week identified by `id`. UTC dates. */
export function weekRange(id: string): { start: Date; end: Date } {
  const m = /^(\d{4})-W(\d{2})$/.exec(id);
  if (!m) throw new Error(`not a week id: ${id}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  const start = isoWeekStartUtc(year, week);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Format a week id as a human date range, e.g. "Apr 20 – 26".
 * Collapses repeated month; expands year on year-crossing weeks.
 */
export function formatWeekRange(id: string): string {
  const { start, end } = weekRange(id);
  const sy = start.getUTCFullYear();
  const ey = end.getUTCFullYear();
  const sm = MONTHS[start.getUTCMonth()];
  const em = MONTHS[end.getUTCMonth()];
  const sd = start.getUTCDate();
  const ed = end.getUTCDate();
  if (sy !== ey) return `${sm} ${sd}, ${sy} – ${em} ${ed}, ${ey}`;
  if (sm === em) return `${sm} ${sd} – ${ed}`;
  return `${sm} ${sd} – ${em} ${ed}`;
}
