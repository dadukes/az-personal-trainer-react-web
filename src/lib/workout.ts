import type { DashboardDayPlan } from '@/lib/api';
import type { WorkoutDay } from '@/store/useAppStore';

/**
 * Workout-completion helpers.
 *
 * The dashboard's `completed_days` is the authoritative, cross-device source of truth
 * (see backend-gaps.md #6). The web app keeps a small `localStorage` mirror keyed by the
 * active plan + the calendar date the workout belongs to as an optimistic overlay, so the
 * "done" badge shows instantly after finishing, before the next dashboard refresh.
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

/**
 * The calendar date a weekday key maps to within the **current Monday-start week**
 * (in local time). Mirrors how the dashboard's `completed_days` map is scoped, so a
 * server-reported weekday can be matched against the date-keyed week cells — and a
 * next-week cell that shares a weekday name is not mistaken for a completed day.
 */
export function currentWeekDateForDayKey(dayKey: string, base: Date = new Date()): string {
  const targetDow = DAY_KEYS.indexOf(dayKey);
  if (targetDow < 0) return localISODate(base);
  const daysSinceMonday = (base.getDay() + 6) % 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - daysSinceMonday);
  const offsetFromMonday = (targetDow + 6) % 7;
  const d = new Date(monday);
  d.setDate(monday.getDate() + offsetFromMonday);
  return localISODate(d);
}

/** Stable key for a completed workout: scoped to the plan so a new plan resets marks. */
export function completionKey(planId: string | undefined, dateISO: string): string {
  return `${planId ?? 'noplan'}::${dateISO}`;
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The next five days from `today` as Home's "Upcoming week" cells, read from the
 * active plan. Also used by Coach to refresh the store after a plan is accepted.
 */
export function buildWeekPlan(
  plan: Record<string, DashboardDayPlan> | null | undefined,
  today: Date = new Date(),
): WorkoutDay[] {
  if (!plan) return [];
  const todayKey = DAY_KEYS[today.getDay()];
  return [0, 1, 2, 3, 4].map((offset) => {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    const key = DAY_KEYS[d.getDay()];
    const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : DAY_ABBR[d.getDay()];
    const date = localISODate(d);
    const dayPlan = plan[key];
    const status = (key === todayKey ? 'today' : 'planned') as 'today' | 'planned' | 'rest';
    if (!dayPlan || dayPlan.is_rest_day) {
      return { day: label, key, date, status, title: 'Rest', duration: '-' };
    }
    return {
      day: label,
      key,
      date,
      status,
      title: dayPlan.focus ?? 'Workout',
      duration: dayPlan.estimated_duration_minutes ? `${dayPlan.estimated_duration_minutes}m` : '-',
    };
  });
}
