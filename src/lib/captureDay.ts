/**
 * Which day a quick log or measurement is for: Today, Yesterday, or an earlier day.
 * Pure, so it runs in plain Node. Kept identical to the mobile app's `lib/capture-day.ts`.
 */

/** How far back the day picker goes. */
export const MAX_DAYS_BACK = 60;
/** Older than this earns no XP (the server's rule for past workouts and activities). */
export const XP_DAYS = 7;

export function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Whole days from `dateISO` back to `todayISO` (0 for today). */
export function daysBack(dateISO: string, todayISO: string): number {
  const [a, b] = [dateISO, todayISO].map((iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}

/** "Today", "Yesterday" or "Tue 3 Nov". */
export function dayChoiceLabel(dateISO: string, todayISO: string): string {
  const back = daysBack(dateISO, todayISO);
  if (back === 0) return 'Today';
  if (back === 1) return 'Yesterday';
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * When to say it happened. Today sends nothing, so the server uses now; an earlier day
 * keeps the current clock time on that date, in the device's zone.
 */
export function completedAtFor(dateISO: string, todayISO: string, now: Date): string | undefined {
  if (daysBack(dateISO, todayISO) <= 0) return undefined;
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes()).toISOString();
}

/** A line under the picker when the day is too old for XP; null otherwise. */
export function pastDayNote(dateISO: string, todayISO: string): string | null {
  return daysBack(dateISO, todayISO) > XP_DAYS ? 'More than a week ago, so it counts for your history but earns no XP.' : null;
}
