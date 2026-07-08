/**
 * Client-side workout-completion helpers.
 *
 * The dashboard API does not report whether a given day's workout has been done
 * (see backend-gaps.md), so the web app tracks completion locally, keyed by the
 * active plan + the calendar date the workout belongs to.
 */

export const DAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/** Local (not UTC) `YYYY-MM-DD` for a date — matches how the week view buckets days. */
export function localISODate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * The calendar date a given weekday key maps to in the current forward week
 * (today counts as offset 0), mirroring `buildWeekLabels` on Home.
 */
export function dateForDayKey(dayKey: string, base: Date = new Date()): string {
  const targetDow = DAY_KEYS.indexOf(dayKey);
  if (targetDow < 0) return localISODate(base);
  const offset = (targetDow - base.getDay() + 7) % 7;
  const d = new Date(base);
  d.setDate(base.getDate() + offset);
  return localISODate(d);
}

/** Stable key for a completed workout: scoped to the plan so a new plan resets marks. */
export function completionKey(planId: string | undefined, dateISO: string): string {
  return `${planId ?? 'noplan'}::${dateISO}`;
}
