/**
 * Pure logic for the Progress tab: the level line, the strength headline, the 28-day
 * consistency grid and the health trend summary. No React Native imports, so it is tested
 * in plain Node. Kept identical to the mobile app's `lib/progress.ts`.
 */

// ─── Dates ────────────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` plus `days`, on the calendar (noon UTC keeps DST out of it). */
export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Monday of the Mon–Sun week holding `dateISO`. */
export function mondayOf(dateISO: string): string {
  const day = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  return addDaysISO(dateISO, -((day + 6) % 7));
}

// ─── Level ────────────────────────────────────────────────────────────────────

export interface LevelLine {
  level: number;
  /** "1,090 / 1,500 XP" */
  label: string;
  /** 0–100, for the bar's width. */
  percent: number;
  /** No XP yet: the label is a sentence, so it's set as text rather than as a number. */
  fresh: boolean;
}

/** `xp_to_next_level` is the XP total that reaches the next level, as the server sends it. */
export function levelLine(g: { current_level: number; current_xp: number; xp_to_next_level: number }): LevelLine {
  const percent = g.xp_to_next_level > 0 ? Math.min(100, Math.max(0, (g.current_xp / g.xp_to_next_level) * 100)) : 0;
  return {
    level: g.current_level,
    // A brand-new account reads an invite, not "0 / 500 XP".
    label:
      g.current_xp > 0
        ? `${g.current_xp.toLocaleString('en-US')} / ${g.xp_to_next_level.toLocaleString('en-US')} XP`
        : 'Your first workout earns XP',
    percent: Math.round(percent),
    fresh: g.current_xp <= 0,
  };
}

// ─── Strength ─────────────────────────────────────────────────────────────────

/** The big line on the Strength card: "4 of 6 lifts up", or how many are tracked. */
export function strengthHeadline(s: { exercises_tracked: number; exercises_improved: number }): string {
  if (s.exercises_improved > 0) return `${s.exercises_improved} of ${s.exercises_tracked} lifts up`;
  return `${s.exercises_tracked} ${s.exercises_tracked === 1 ? 'lift' : 'lifts'} tracked`;
}

// ─── Consistency grid ─────────────────────────────────────────────────────────

/** `workout` is a workout from the app or the coach; `other` is any other activity. */
export type DayMark = 'workout' | 'other' | 'none' | 'future';

export interface GridDay {
  date: string;
  mark: DayMark;
  today: boolean;
}

export const GRID_WEEKS = 4;

/** The first day the grid shows: the Monday `weeks - 1` weeks before this one. */
export function gridStart(todayISO: string, weeks = GRID_WEEKS): string {
  return addDaysISO(mondayOf(todayISO), -7 * (weeks - 1));
}

/**
 * Whole Mon–Sun weeks ending with this one, oldest first: a workout wins the day over
 * anything else, and days after today are `future`.
 */
export function consistencyGrid(
  items: readonly { kind: 'workout' | 'activity'; date: string }[],
  todayISO: string,
  weeks = GRID_WEEKS,
): GridDay[] {
  const marks = new Map<string, DayMark>();
  for (const item of items) {
    if (item.kind === 'workout') marks.set(item.date, 'workout');
    else if (!marks.has(item.date)) marks.set(item.date, 'other');
  }
  const start = gridStart(todayISO, weeks);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const date = addDaysISO(start, i);
    const mark: DayMark = date > todayISO ? 'future' : (marks.get(date) ?? 'none');
    return { date, mark, today: date === todayISO };
  });
}

/** True while the history read so far could still hold days the grid shows. */
export function needsOlderHistory(
  items: readonly { date: string }[],
  nextCursor: string | null,
  todayISO: string,
  weeks = GRID_WEEKS,
): boolean {
  if (!nextCursor) return false;
  if (items.length === 0) return true;
  const oldest = items.reduce((min, i) => (i.date < min ? i.date : min), items[0].date);
  return oldest >= gridStart(todayISO, weeks);
}

/** Read out for screen readers: "12 training days in the last 4 weeks, 9 with a workout". */
export function gridSummary(days: readonly GridDay[]): string {
  const trained = days.filter((d) => d.mark === 'workout' || d.mark === 'other').length;
  const workouts = days.filter((d) => d.mark === 'workout').length;
  const weeks = Math.round(days.length / 7);
  return `${trained} training ${trained === 1 ? 'day' : 'days'} in the last ${weeks} weeks, ${workouts} with a workout`;
}

/** Nothing trained in the window yet: the card invites instead of showing an empty grid's numbers. */
export function gridIsEmpty(days: readonly GridDay[]): boolean {
  return !days.some((d) => d.mark === 'workout' || d.mark === 'other');
}

// ─── Health trends ────────────────────────────────────────────────────────────

export interface TrendSummary {
  average: number | null;
  daysWithData: number;
  days: number;
}

/**
 * The mean of the days that have a value, over the `days` ending today. Days with no value
 * are left out, never counted as zero.
 */
export function trendSummary<K extends string>(
  logs: readonly ({ logged_date: string } & Partial<Record<K, number | null>>)[],
  key: K,
  days: number,
  todayISO: string,
): TrendSummary {
  const from = addDaysISO(todayISO, -(days - 1));
  const values: number[] = [];
  for (const log of logs) {
    if (log.logged_date < from || log.logged_date > todayISO) continue;
    const v = log[key];
    if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
  }
  return {
    average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    daysWithData: values.length,
    days,
  };
}

/** The line under a trend's number. One day is not a trend yet, so it says what draws one. */
export function trendMeta(label: string, daysWithData: number, days: number): string {
  if (daysWithData === 0) return `No ${label.toLowerCase()} in the last ${days} days`;
  if (daysWithData === 1) return `${label}, 1 of ${days} days. Another day draws the trend.`;
  return `${label} average, ${daysWithData} of ${days} days`;
}

/** Which of `keys` have a value on some day in the `days` ending today (default 30). */
export function keysWithRecentData<K extends string>(
  logs: readonly ({ logged_date: string } & Partial<Record<K, number | null>>)[],
  keys: readonly K[],
  todayISO: string,
  days = 30,
): K[] {
  const from = addDaysISO(todayISO, -(days - 1));
  return keys.filter((key) =>
    logs.some((log) => log.logged_date >= from && log.logged_date <= todayISO && typeof log[key] === 'number'),
  );
}
