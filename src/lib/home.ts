/**
 * What Home shows: the hero for today, the week strip, health in one row and the most recent
 * activity. Pure logic, mirrored on mobile in `lib/home.ts`.
 */
import type { ActivityItem, DashboardDayPlan, HistoryItem, HistoryWorkout } from '@/lib/api';
import { activityStats, activityTitle, formatMinutes, workoutTitle } from '@/lib/activities';
import { localISODate } from '@/lib/workout';

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type Plan = Record<string, DashboardDayPlan> | null | undefined;

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** The plan's workout for a weekday, or null for a rest day or no plan. */
export function workoutFor(plan: Plan, dayKey: string): DashboardDayPlan | null {
  const day = plan?.[dayKey];
  return day && !day.is_rest_day ? day : null;
}

export function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** "Thursday 5 Nov". */
export function dateLabel(now: Date): string {
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = now.toLocaleDateString('en-GB', { month: 'short' });
  return `${weekday} ${now.getDate()} ${month}`;
}

/**
 * The coach names a day "Upper Body B (Incline Press & Back Sculpt)": the name, then what it
 * works. Home and the plan day show them as a title and a line under it.
 */
export function splitFocus(focus: string | null | undefined): { title: string; subtitle: string | null } {
  const text = focus?.trim() || 'Workout';
  const match = /^(.+?)\s*\((.+)\)$/.exec(text);
  return match ? { title: match[1], subtitle: match[2] } : { title: text, subtitle: null };
}

/** "45 min · 8 exercises + warm-up", leaving out what the plan doesn't say. */
export function workoutMeta(day: DashboardDayPlan): string {
  const count = day.exercises?.length ?? 0;
  const warmup = (day.warmup?.length ?? 0) > 0 ? ' + warm-up' : '';
  const exercises = count > 0 ? `${count} ${count === 1 ? 'exercise' : 'exercises'}${warmup}` : null;
  const minutes = day.estimated_duration_minutes ? `${day.estimated_duration_minutes} min` : null;
  return [minutes, exercises].filter(Boolean).join(' · ');
}

export type WeekDayState = 'done' | 'today' | 'planned' | 'rest';

export interface WeekDay {
  date: string;
  dayKey: string;
  letter: string;
  dayOfMonth: number;
  state: WeekDayState;
  isToday: boolean;
  /** The plan's workout name that day, or null for a rest day. */
  title: string | null;
  /** Activities outside the plan: a separate mark, never the plan's tick. */
  otherCount: number;
  /** A past plan day whose workout isn't ticked. */
  missed: boolean;
  /** For a screen reader: "Monday 2 November: done, plus another activity". */
  label: string;
}

export interface HomeWeek {
  days: WeekDay[];
  /** Plan days with a workout this week. */
  planned: number;
  /** Days this week whose planned workout is done. */
  done: number;
}

/**
 * Monday to Sunday of the current week. A day is done when its planned workout is, today
 * stands out until then, other plan days are planned and the rest are rest.
 */
export function homeWeek(
  plan: Plan,
  isDone: (dateISO: string) => boolean,
  weekActivities: Record<string, ActivityItem[]>,
  now: Date,
): HomeWeek {
  const today = localISODate(now);
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i): WeekDay => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const date = localISODate(d);
    const dayKey = DAY_KEYS[d.getDay()];
    const workout = workoutFor(plan, dayKey);
    const done = isDone(date);
    const isToday = date === today;
    const state: WeekDayState = done ? 'done' : isToday ? 'today' : workout ? 'planned' : 'rest';
    const otherCount = weekActivities[date]?.length ?? 0;
    const status = done ? 'done' : workout ? `${splitFocus(workout.focus).title}${date < today ? ', not ticked' : ''}` : 'rest day';
    const other = otherCount === 0 ? '' : otherCount === 1 ? ', plus another activity' : `, plus ${otherCount} other activities`;
    return {
      date,
      dayKey,
      letter: LETTERS[d.getDay()],
      dayOfMonth: d.getDate(),
      state,
      isToday,
      title: workout ? splitFocus(workout.focus).title : null,
      otherCount,
      missed: Boolean(workout) && !done && date < today,
      label: `${capitalize(dayKey)} ${d.getDate()}${isToday ? ', today' : ''}: ${status}${other}`,
    };
  });
  return {
    days,
    planned: days.filter((d) => d.title !== null).length,
    done: days.filter((d) => d.state === 'done').length,
  };
}

/** The latest missed plan day this week, for "Did it? Log it". */
export function latestMissed(week: HomeWeek): WeekDay | null {
  const missed = week.days.filter((d) => d.missed);
  return missed.length > 0 ? missed[missed.length - 1] : null;
}

export interface NextWorkout {
  dayKey: string;
  /** "Tomorrow", or the weekday's name. */
  when: string;
  title: string;
  minutes: number | null;
}

/** The next plan day with a workout after today, within a week. */
export function nextWorkout(plan: Plan, now: Date): NextWorkout | null {
  for (let offset = 1; offset <= 7; offset += 1) {
    const d = new Date(now);
    d.setDate(now.getDate() + offset);
    const dayKey = DAY_KEYS[d.getDay()];
    const workout = workoutFor(plan, dayKey);
    if (workout) {
      return {
        dayKey,
        when: offset === 1 ? 'Tomorrow' : capitalize(dayKey),
        title: splitFocus(workout.focus).title,
        minutes: workout.estimated_duration_minutes ?? null,
      };
    }
  }
  return null;
}

/** Today's saved workout, newest first, from the history page Home already loads. */
export function workoutDoneOn(items: HistoryItem[], dateISO: string): (HistoryWorkout & { id: string }) | null {
  const found = items.find((item) => item.kind === 'workout' && item.date === dateISO);
  return found && found.kind === 'workout' ? { ...found.workout, id: found.id } : null;
}

/** "48 min · +72 XP". Sets are left out: `total_sets` counts unticked ones too. */
export function doneLine(workout: HistoryWorkout): string {
  return [
    workout.duration_minutes > 0 ? `${Math.round(workout.duration_minutes)} min` : null,
    workout.xp_earned > 0 ? `+${workout.xp_earned} XP` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "Done today, 7:58 am". */
export function doneTodayLabel(workout: HistoryWorkout): string {
  const time = new Date(workout.completed_at)
    .toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\s?([ap])\.?m\.?/i, ' $1m')
    .toLowerCase();
  return `Done today, ${time}`;
}

export interface HealthNumbers {
  sleep_hours: number | null;
  resting_heart_rate: number | null;
  step_count: number | null;
  active_calories_burned: number | null;
}

export interface HealthStat {
  key: keyof HealthNumbers;
  value: string;
  label: string;
}

/** "7h 12", or "7h" on the hour. */
export function sleepLabel(hours: number): string {
  let whole = Math.floor(hours);
  let minutes = Math.round((hours - whole) * 60);
  if (minutes === 60) {
    whole += 1;
    minutes = 0;
  }
  return minutes === 0 ? `${whole}h` : `${whole}h ${String(minutes).padStart(2, '0')}`;
}

/** Only the numbers there are: a missing one renders nothing rather than a dash. */
export function healthStats(health: HealthNumbers): HealthStat[] {
  const stats: (HealthStat | null)[] = [
    health.sleep_hours != null && health.sleep_hours > 0 ? { key: 'sleep_hours', value: sleepLabel(health.sleep_hours), label: 'Sleep' } : null,
    health.resting_heart_rate != null && health.resting_heart_rate > 0
      ? { key: 'resting_heart_rate', value: String(Math.round(health.resting_heart_rate)), label: 'Resting HR' }
      : null,
    health.step_count != null && health.step_count > 0
      ? { key: 'step_count', value: Math.round(health.step_count).toLocaleString('en-GB'), label: 'Steps' }
      : null,
    health.active_calories_burned != null && health.active_calories_burned > 0
      ? { key: 'active_calories_burned', value: Math.round(health.active_calories_burned).toLocaleString('en-GB'), label: 'Active kcal' }
      : null,
  ];
  return stats.filter((s): s is HealthStat => s !== null);
}

export interface RecentLine {
  title: string;
  /** "Wed · 5.2 km · 31 min". */
  meta: string;
}

function dayWord(dateISO: string, now: Date): string {
  const today = localISODate(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dateISO === today) return 'Today';
  if (dateISO === localISODate(yesterday)) return 'Yesterday';
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short' });
}

/** One line of Home's Recent list: a workout or an activity, by day. */
export function recentLine(item: HistoryItem, system: 'metric' | 'imperial', now: Date): RecentLine {
  const day = dayWord(item.date, now);
  if (item.kind === 'workout') {
    const minutes = item.workout.duration_minutes > 0 ? formatMinutes(item.workout.duration_minutes) : null;
    return { title: splitFocus(workoutTitle(item.workout)).title, meta: [day, minutes].filter(Boolean).join(' · ') };
  }
  const stats = activityStats(item.activity, system);
  return { title: activityTitle(item.activity), meta: [day, stats].filter(Boolean).join(' · ') };
}

/**
 * Whether a plan day is done. The server's `completed_days` decides. A mark on this device
 * only covers the moment between a confirmed save and the next dashboard answer, so it counts
 * when the server hasn't answered since it was made (or at all, offline), and never for a date
 * after today: older builds dated some marks into the next week.
 */
export function isPlanDayDone(
  dateISO: string,
  serverDates: ReadonlySet<string>,
  mark: { completedAt: string } | undefined,
  serverAnsweredAt: string | null,
  today: string,
): boolean {
  if (serverDates.has(dateISO)) return true;
  if (!mark || dateISO > today) return false;
  return serverAnsweredAt === null || mark.completedAt > serverAnsweredAt;
}
