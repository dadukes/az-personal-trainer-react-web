import type {
  DashboardDayPlan,
  DashboardExercise,
  LoggedExercise,
  SessionExercise,
  WeightUnit,
  WorkoutSessionSummary,
} from '@/lib/api';
import { toLogbookExercises } from '@/lib/logbook';
import { DAY_KEYS, localISODate } from '@/lib/workout';
import { buildBlock, isCountdownBlock, type Block, type SetActual } from '@/lib/workoutSession';

/**
 * Logging a workout afterwards and editing a saved one: what the logbook's Log and Edit modes
 * read and send. Pure logic, tested in Vitest. Mirrors the mobile app's `lib/logbook-past.ts`,
 * on web's model, where each exercise holds its own sets.
 */

// ─── Edit: a saved workout into the logbook, and back ─────────────────────────

/** The plan's entry, or one made from what was logged when it wasn't on the plan. */
function asPlanned(exercise: SessionExercise): DashboardExercise {
  if (exercise.planned) return { ...exercise.planned, type: exercise.type };
  const target = exercise.target;
  const first = exercise.sets[0];
  const reps = target?.reps ?? first?.reps ?? null;
  const seconds = target?.duration_seconds ?? first?.duration_seconds ?? null;
  return {
    name: exercise.name,
    type: exercise.type,
    exercise_id: exercise.exercise_id ?? undefined,
    sets: Math.max(1, target?.sets ?? exercise.sets.length),
    reps: reps != null ? String(reps) : undefined,
    duration_seconds: seconds != null && seconds > 0 ? seconds : undefined,
    target_weight: target?.weight ?? undefined,
    weight_unit: target?.weight_unit ?? undefined,
    rest_seconds: 0,
  };
}

/** A per-side hold is saved as both sides together, and edited as one side, as it was entered. */
function loggedSets(exercise: SessionExercise, block: Block): SetActual[] | null {
  if (exercise.status !== 'logged' || exercise.sets.length === 0) return null;
  const perSideHold = isCountdownBlock(block) && block.isPerSide;
  return exercise.sets.map((set, si) => ({
    reps: set.reps ?? block.repTarget,
    weight: set.weight ?? 0,
    // What was saved is the person's own number, so nothing seeds over it.
    weightEdited: true,
    completed: set.completed && !set.skipped,
    durationSeconds: set.duration_seconds == null ? undefined : perSideHold ? Math.round(set.duration_seconds / 2) : set.duration_seconds,
    distanceKm: si === 0 && block.type === 'cardio' ? (exercise.distance_km ?? undefined) : undefined,
  }));
}

/**
 * A saved workout, ready to change. Exercises with nothing logged start unticked at their
 * target. A swap shows under its new name, with the plan's exercise as the way back. Keys are
 * the server's, which are unique within a workout.
 */
export function editBlocksFromSession(exercises: SessionExercise[], unit: WeightUnit): Block[] {
  return exercises.map((exercise, i) => {
    const built = buildBlock(asPlanned(exercise), exercise.section, i, unit);
    const loggedUnit = exercise.sets.find((s) => s.weight_unit)?.weight_unit;
    let block: Block = {
      ...built,
      key: exercise.key,
      weightUnit: loggedUnit ?? built.weightUnit,
      wasLogged: exercise.status === 'logged' && exercise.sets.length > 0,
      doneBy: exercise.status === 'done' && exercise.done_by ? exercise.done_by : undefined,
      addedToday: exercise.planned ? undefined : true,
      skipped: exercise.status === 'logged' && exercise.skipped ? true : undefined,
    };
    if (exercise.swapped_from) {
      block = {
        ...block,
        name: exercise.name,
        exercise_id: exercise.exercise_id ?? undefined,
        swappedFrom: exercise.swapped_from,
        cues: undefined,
        addedToday: undefined,
      };
    }
    return { ...block, sets: loggedSets(exercise, block) ?? block.sets };
  });
}

/**
 * What `PUT /workouts/sessions/{id}` gets. An exercise that had sets is always sent, so
 * unticking it all keeps it, skipped. One the coach or a watch counted, or one never logged,
 * goes only once something in it is ticked; left out, it stays as it was.
 */
export function toEditExercises(blocks: Block[]): LoggedExercise[] {
  return toLogbookExercises(blocks).filter((_, bi) => blocks[bi].wasLogged === true || blocks[bi].sets.some((s) => s.completed));
}

/** Whether anything that would be saved has changed. */
export function editSignature(blocks: Block[], start: Date, end: Date): string {
  return JSON.stringify({ start: start.getTime(), end: end.getTime(), exercises: toEditExercises(blocks) });
}

/** Sets ticked across the whole workout. */
export function tickedSetCount(blocks: Block[]): number {
  return blocks.reduce((acc, b) => acc + b.sets.filter((s) => s.completed).length, 0);
}

// ─── Log: dates and times ─────────────────────────────────────────────────────

/** A `YYYY-MM-DD` as a local date at midnight. */
export function parseLocalDate(dateISO: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** The same clock time on another day. */
export function onDate(time: Date, dateISO: string): Date {
  const day = parseLocalDate(dateISO);
  day.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return day;
}

/** Today and the two days before it, newest first, for the date chips. */
export function recentDates(now: Date): string[] {
  return [0, 1, 2].map((back) => {
    const d = new Date(now);
    d.setDate(now.getDate() - back);
    return localISODate(d);
  });
}

/** Which chip a date is: 0 today, 1 yesterday, 2 the day before, or null for any other. */
export function recentIndex(dateISO: string, now: Date): number | null {
  const index = recentDates(now).indexOf(dateISO);
  return index === -1 ? null : index;
}

const FIVE_MINUTES = 5 * 60 * 1000;

/**
 * A new log's times: ending now, rounded down to five minutes, on the chosen date, and starting
 * the plan's length earlier. On an earlier date that's the same clock time, which is easy to change.
 */
export function defaultLogTimes(dateISO: string, now: Date, minutes: number | undefined): { start: Date; end: Date } {
  const rounded = new Date(Math.floor(now.getTime() / FIVE_MINUTES) * FIVE_MINUTES);
  const end = onDate(rounded, dateISO);
  const length = minutes && minutes > 0 ? minutes : 45;
  return { start: new Date(end.getTime() - length * 60_000), end };
}

/** Workouts older than this when logged earn no XP. Matches the API's rule. */
export const XP_WINDOW_DAYS = 7;

/** Whether a workout ending then, logged now, is too old to earn XP. */
export function tooOldForXp(end: Date, now: Date): boolean {
  return now.getTime() - end.getTime() > XP_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/** Why the times can't be saved, or null when they can. */
export function timesProblem(start: Date, end: Date, now: Date): string | null {
  if (end.getTime() <= start.getTime()) {
    return 'End time must be after the start';
  }
  // The API allows five minutes for a phone's clock. One is plenty here.
  if (end.getTime() > now.getTime() + 60_000) {
    return "End time can't be in the future";
  }
  return null;
}

/** The days of a calendar month, Monday first, with nulls before the 1st to fill the first week. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d += 1) {
    cells.push(localISODate(new Date(year, month, d)));
  }
  return cells;
}

/** The weekday key (`monday`) of a date. */
export function dayKeyForDate(dateISO: string): string {
  return DAY_KEYS[parseLocalDate(dateISO).getDay()];
}

/** The latest date, today or earlier, that falls on a weekday: where "Already did it?" logs to. */
export function lastDateForDayKey(dayKey: string, now: Date): string {
  const target = DAY_KEYS.indexOf(dayKey);
  const d = new Date(now);
  if (target >= 0) {
    d.setDate(now.getDate() - ((now.getDay() - target + 7) % 7));
  }
  return localISODate(d);
}

// ─── Log: which workout ───────────────────────────────────────────────────────

/** A workout day on the plan, for the "Which workout?" list. */
export interface PlanDayChoice {
  key: string;
  plan: DashboardDayPlan;
}

const WEEK_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** The plan's workout days, Monday first. Rest days and empty days aren't a workout to log. */
export function planDayChoices(plan: Record<string, DashboardDayPlan> | null | undefined): PlanDayChoice[] {
  if (!plan) {
    return [];
  }
  return WEEK_ORDER.flatMap((key) => {
    const day = plan[key];
    const count = (day?.warmup?.length ?? 0) + (day?.exercises?.length ?? 0) + (day?.cooldown?.length ?? 0);
    return day && !day.is_rest_day && count > 0 ? [{ key, plan: day }] : [];
  });
}

/** Each workout day's name, by day key, for "Monday's Upper A isn't ticked". */
export function planDayTitles(plan: Record<string, DashboardDayPlan> | null | undefined): Record<string, string> {
  return Object.fromEntries(planDayChoices(plan).map((c) => [c.key, c.plan.focus ?? 'Workout']));
}

/** The plan day a date falls on, or null for a rest day or no plan: then it's an empty workout. */
export function defaultSourceFor(choices: PlanDayChoice[], dateISO: string): string | null {
  const key = dayKeyForDate(dateISO);
  return choices.some((c) => c.key === key) ? key : null;
}

/** Saved workouts that ended on a date, by the phone's calendar. */
export function workoutsOnDate(sessions: WorkoutSessionSummary[], dateISO: string, exceptId?: string): WorkoutSessionSummary[] {
  return sessions.filter((s) => s.id !== exceptId && localISODate(new Date(s.completed_at)) === dateISO);
}

/** "Lower Body A" when it was a day of the current plan, else "a workout". */
export function sessionName(
  session: WorkoutSessionSummary,
  planId: string | undefined,
  plan: Record<string, DashboardDayPlan> | null | undefined,
): string {
  const focus = session.plan_id && session.plan_id === planId && session.day ? plan?.[session.day]?.focus : undefined;
  return focus ?? 'a workout';
}
