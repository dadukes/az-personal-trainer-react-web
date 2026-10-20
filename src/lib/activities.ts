import type { ActivityItem, ActivityType, HrCurveSegment, WorkoutSetLogEntry, ZoneSeconds } from '@/lib/api';
import { sourceAppLabel } from '@/lib/body';

/**
 * Display helpers for activities outside guided workouts (`GET /activities`, the
 * dashboard's `week_activities`). Zones and labels come from the backend; nothing
 * here computes heart-rate maths.
 */

const TYPE_LABELS: Record<ActivityType, string> = {
  full_workout: 'Workout',
  micro_win: 'Quick win',
  walk: 'Walk',
  cardio: 'Cardio',
  class: 'Class',
  other: 'Activity',
};

/** "Run", "Strength training", else the type's label ("Cardio", "Walk"…). */
export function activityTitle(item: Pick<ActivityItem, 'name' | 'activity_type'>): string {
  return item.name ?? TYPE_LABELS[item.activity_type] ?? 'Activity';
}

/** Where an activity came from, in the user's words: "Garmin Connect", "Logged with coach", "Quick log". */
export function activitySourceLabel(item: Pick<ActivityItem, 'source' | 'source_app'>): string {
  if (item.source === 'coach') return 'Logged with coach';
  if (item.source === 'app') return 'Quick log';
  return sourceAppLabel(item.source_app);
}

/** Cycling-type device sessions, for an icon that matches ("Cycling", "Indoor cycling"). */
export function isCycling(item: Pick<ActivityItem, 'name'>): boolean {
  return /cycl|bik|ride/i.test(item.name ?? '');
}

/**
 * The user's own words on a coach / quick log ("Yoga with Sam"). Device rows keep their
 * title in `name`, so their notes aren't repeated.
 */
export function activityNote(item: Pick<ActivityItem, 'source' | 'notes'>): string | null {
  if (isDeviceActivity(item)) return null;
  const note = item.notes?.trim();
  return note ? note : null;
}

export function isDeviceActivity(item: Pick<ActivityItem, 'source'>): boolean {
  return item.source === 'health_connect' || item.source === 'apple_health';
}

/** `32 min · 5.4 km` (distance in the user's system); empty parts are dropped. */
export function activityStats(
  item: Pick<ActivityItem, 'duration_minutes' | 'distance_km'>,
  system: 'metric' | 'imperial',
): string {
  const parts: string[] = [];
  if (item.duration_minutes != null && item.duration_minutes > 0) {
    parts.push(formatMinutes(item.duration_minutes));
  }
  if (item.distance_km != null && item.distance_km > 0) {
    parts.push(
      system === 'imperial'
        ? `${(item.distance_km / 1.609344).toFixed(1)} mi`
        : `${item.distance_km.toFixed(1)} km`,
    );
  }
  return parts.join(' · ');
}

export function formatMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Zone names for labels; colour is never the only signal. */
export const ZONE_LABELS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'] as const;

export const ZONE_DESCRIPTIONS = ['Very light', 'Light', 'Moderate', 'Hard', 'Max'] as const;

/** Whole minutes per zone, for a bar legend. */
export function zoneMinutes(zones: ZoneSeconds): number[] {
  return zones.map((s) => Math.round(s / 60));
}

/** Short lower-case noun for a notice: "run", "treadmill run", "HIIT" stays as is. */
export function activityNoun(item: Pick<ActivityItem, 'name' | 'activity_type'>): string {
  const title = activityTitle(item);
  return title === title.toUpperCase() ? title : title.charAt(0).toLowerCase() + title.slice(1);
}

/** Sort key for a day list: when it started, else when it ended. */
export function activityTime(item: Pick<ActivityItem, 'started_at' | 'completed_at'>): string {
  return item.started_at ?? item.completed_at;
}

/** Coach and quick logs are the user's own entries, so they can be edited; imports can't. */
export function isEditableActivity(item: Pick<ActivityItem, 'source'>): boolean {
  return item.source === 'app' || item.source === 'coach';
}

/** Types an edit can switch between (the quick-log set plus the coach's). */
export const EDITABLE_TYPES: { type: ActivityType; label: string }[] = [
  { type: 'cardio', label: 'Cardio' },
  { type: 'walk', label: 'Walk' },
  { type: 'class', label: 'Class' },
  { type: 'full_workout', label: 'Workout' },
  { type: 'other', label: 'Other' },
  { type: 'micro_win', label: 'Quick win' },
];

/** `5.4 km` / `3.4 mi`. */
export function formatDistance(km: number, system: 'metric' | 'imperial', digits = 1): string {
  return system === 'imperial' ? `${(km / 1.609344).toFixed(digits)} mi` : `${km.toFixed(digits)} km`;
}

/**
 * Pace for runs and walks (`5:32 /km`), speed for rides (`24.1 km/h`); null without both
 * a duration and a distance, or for types where neither means much.
 */
export function paceOrSpeed(
  item: Pick<ActivityItem, 'activity_type' | 'name' | 'duration_minutes' | 'distance_km'>,
  system: 'metric' | 'imperial',
): { label: 'Avg pace' | 'Avg speed'; value: string } | null {
  const minutes = item.duration_minutes ?? 0;
  const km = item.distance_km ?? 0;
  if (minutes <= 0 || km <= 0) return null;
  if (item.activity_type !== 'cardio' && item.activity_type !== 'walk') return null;
  const dist = system === 'imperial' ? km / 1.609344 : km;
  const unit = system === 'imperial' ? 'mi' : 'km';
  if (isCycling(item)) {
    return { label: 'Avg speed', value: `${(dist / (minutes / 60)).toFixed(1)} ${unit}/h` };
  }
  const secondsPerUnit = Math.round((minutes * 60) / dist);
  const m = Math.floor(secondsPerUnit / 60);
  const s = secondsPerUnit % 60;
  return { label: 'Avg pace', value: `${m}:${String(s).padStart(2, '0')} /${unit}` };
}

/** A guided workout's name: the plan day's focus, else the weekday ("Monday"). */
export function workoutTitle(workout: { title: string | null; day: string | null }): string {
  if (workout.title) return workout.title;
  if (workout.day) return workout.day.charAt(0).toUpperCase() + workout.day.slice(1);
  return 'Workout';
}

function parseLocalDate(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "This week", "Last week", else "Sep 29 – Oct 5" (year added when it isn't this year). */
export function weekRangeLabel(weekStart: string, weekEnd: string, today: Date = new Date()): string {
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const start = parseLocalDate(weekStart);
  const weeksAgo = Math.round((monday.getTime() - start.getTime()) / (7 * 24 * 3600 * 1000));
  if (weeksAgo === 0) return 'This week';
  if (weeksAgo === 1) return 'Last week';
  const end = parseLocalDate(weekEnd);
  const sameMonth = start.getMonth() === end.getMonth();
  const year = end.getFullYear() !== today.getFullYear() ? `, ${end.getFullYear()}` : '';
  const from = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const to = sameMonth ? String(end.getDate()) : end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${from} – ${to}${year}`;
}

/** `4 sessions · 2 h 40 min · 18.5 km`; zero parts are dropped. */
export function weekTotalsText(
  week: { sessions: number; duration_minutes: number; distance_km: number },
  system: 'metric' | 'imperial',
): string {
  const parts = [`${week.sessions} ${week.sessions === 1 ? 'session' : 'sessions'}`];
  if (week.duration_minutes > 0) parts.push(formatMinutes(week.duration_minutes));
  if (week.distance_km > 0) parts.push(formatDistance(week.distance_km, system));
  return parts.join(' · ');
}

/** Which part of the Activities timeline an entry falls in. */
export type TimelineGroupKind = 'today' | 'this_week' | 'week';

export interface TimelineGroup<T> {
  /** Stable key: `today`, `this_week` or `week:<monday>`. */
  key: string;
  kind: TimelineGroupKind;
  weekStart: string;
  items: T[];
}

function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Today, then earlier this week, then one group per older Mon–Sun week, in list order
 * (the API is newest first). Dates are the server's local `YYYY-MM-DD`, which the apps
 * keep on the device's timezone; an entry dated after today (a zone change) counts as today.
 */
export function groupTimeline<T extends { date: string; week_start: string }>(
  items: readonly T[],
  today: Date = new Date(),
): TimelineGroup<T>[] {
  const todayKey = dateKey(today);
  const monday = new Date(today);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const mondayKey = dateKey(monday);

  const groups: TimelineGroup<T>[] = [];
  for (const item of items) {
    const kind: TimelineGroupKind =
      item.date >= todayKey ? 'today' : item.week_start >= mondayKey ? 'this_week' : 'week';
    const key = kind === 'week' ? `week:${item.week_start}` : kind;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, kind, weekStart: item.week_start, items: [item] });
  }
  return groups;
}

/**
 * A timeline group's heading and totals. The current week's totals go on the first of its
 * groups only, labelled "This week" since they cover today and the earlier days together.
 */
export function timelineGroupHeader(
  group: Pick<TimelineGroup<unknown>, 'kind'>,
  week: { week_start: string; week_end: string; sessions: number; duration_minutes: number; distance_km: number } | undefined,
  system: 'metric' | 'imperial',
  firstOfWeek: boolean,
): { title: string; totals: string | null } {
  if (group.kind === 'week') {
    return week
      ? { title: weekRangeLabel(week.week_start, week.week_end), totals: weekTotalsText(week, system) }
      : { title: '', totals: null };
  }
  return {
    title: group.kind === 'today' ? 'Today' : 'Earlier this week',
    totals: week && firstOfWeek ? `This week: ${weekTotalsText(week, system)}` : null,
  };
}

/** Bpm range of each zone from the model's floors. Below the Z1 floor counts as Z1; Z5 is open-ended. */
export function zoneRanges(floors: readonly number[]): string[] {
  return floors.map((floor, i) => {
    if (i === 0) return `≤ ${floors[1] - 1}`;
    return i < floors.length - 1 ? `${floor}–${floors[i + 1] - 1}` : `${floor}+`;
  });
}

/** "Sunday, October 12, 2026 · 7:00 AM – 7:32 AM" (just the end time without a start). */
export function timeRangeText(startISO: string | null, endISO: string): string {
  const end = new Date(endISO);
  const start = startISO ? new Date(startISO) : null;
  const date = (start ?? end).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const t = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return start ? `${date} · ${t(start)} – ${t(end)}` : `${date} · ${t(end)}`;
}

const KG_PER_LB = 0.45359237;

/**
 * Total weight moved in a workout (reps × load over completed, not-skipped sets), in the
 * user's unit; null when nothing was lifted with a load. Sets logged in the other unit are
 * converted.
 */
export function workoutVolume(sets: WorkoutSetLogEntry[], system: 'metric' | 'imperial'): string | null {
  let kg = 0;
  for (const set of sets) {
    if (!set.completed || set.skipped || !set.reps || !set.weight || set.weight <= 0) continue;
    kg += set.reps * (set.weight_unit === 'lb' ? set.weight * KG_PER_LB : set.weight);
  }
  if (kg <= 0) return null;
  const value = system === 'imperial' ? kg / KG_PER_LB : kg;
  return `${Math.round(value).toLocaleString()} ${system === 'imperial' ? 'lb' : 'kg'}`;
}

/**
 * A workout's length: the longer of what was logged and the span of its watch recordings —
 * a workout ticked in afterwards or told to the coach is as long as the watch says it was.
 */
export function workoutDurationSeconds(
  loggedSeconds: number,
  recordings: Pick<ActivityItem, 'started_at' | 'completed_at' | 'duration_minutes'>[],
): number {
  if (recordings.length === 0) return loggedSeconds;
  const starts = recordings.map((r) =>
    r.started_at ? Date.parse(r.started_at) : Date.parse(r.completed_at) - (r.duration_minutes ?? 0) * 60000,
  );
  const span = (Math.max(...recordings.map((r) => Date.parse(r.completed_at))) - Math.min(...starts)) / 1000;
  return Math.max(loggedSeconds, Math.round(span));
}

/** `412 kcal`. */
export function formatCalories(kcal: number): string {
  return `${Math.round(kcal).toLocaleString()} kcal`;
}

/** `48 m` / `157 ft`. */
export function formatElevation(meters: number, system: 'metric' | 'imperial'): string {
  return system === 'imperial' ? `${Math.round(meters * 3.28084).toLocaleString()} ft` : `${Math.round(meters).toLocaleString()} m`;
}

/**
 * Top speed for rides (`38.2 km/h`); null otherwise. On foot one GPS spike turns a "best
 * pace" into nonsense, so runs and walks show only their average pace.
 */
export function maxSpeedText(
  item: Pick<ActivityItem, 'name' | 'max_speed_mps'>,
  system: 'metric' | 'imperial',
): string | null {
  if (!item.max_speed_mps || item.max_speed_mps <= 0 || !isCycling(item)) return null;
  const kmh = item.max_speed_mps * 3.6;
  return system === 'imperial' ? `${(kmh / 1.609344).toFixed(1)} mi/h` : `${kmh.toFixed(1)} km/h`;
}

/** Calories and climb summed over a workout's recordings; each null when none shared it. */
export function recordingTotals(
  recordings: Pick<ActivityItem, 'active_calories' | 'elevation_gain_m'>[],
): { calories: number | null; elevation: number | null } {
  const sum = (values: (number | null)[]) => {
    const present = values.filter((v): v is number => v != null && v > 0);
    return present.length > 0 ? present.reduce((a, b) => a + b, 0) : null;
  };
  return {
    calories: sum(recordings.map((r) => r.active_calories)),
    elevation: sum(recordings.map((r) => r.elevation_gain_m)),
  };
}

/** One point of the heart-rate chart: seconds since the first recording started. */
export interface HrChartPoint {
  t: number;
  bpm: number | null;
}

/**
 * The curves of one activity or of a workout's recordings on one time axis. A null point
 * at each later recording's start breaks the line, so the gap between a warm-up and the
 * main session stays empty. Each bucket sits at its middle.
 */
export function hrChartPoints(segments: HrCurveSegment[]): HrChartPoint[] {
  if (segments.length === 0) return [];
  const t0 = Date.parse(segments[0].started_at);
  const points: HrChartPoint[] = [];
  segments.forEach((segment, i) => {
    const start = (Date.parse(segment.started_at) - t0) / 1000;
    if (i > 0) points.push({ t: start, bpm: null });
    segment.bpm.forEach((bpm, k) => points.push({ t: start + (k + 0.5) * segment.bucket_seconds, bpm }));
  });
  return points;
}

/** Elapsed time for chart axes: `0:00`, `12:30`, `1:05:00`. */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/**
 * Columns for a detail page's stat tiles from `sm` up, so rows come out even: 4 → one row,
 * 5 or 6 → rows of 3, 7 or 8 → rows of 4. (Web only; phones always use two columns.)
 */
export function statGridClass(count: number): string {
  if (count <= 2) return 'sm:grid-cols-2';
  return count === 4 || count >= 7 ? 'sm:grid-cols-4' : 'sm:grid-cols-3';
}
