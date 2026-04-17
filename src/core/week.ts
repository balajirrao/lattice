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
