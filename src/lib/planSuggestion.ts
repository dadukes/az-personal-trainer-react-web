/**
 * Coach plan suggestions (redesign phase 7): turns a suggestion from the API
 * into what its card shows. Mirrored on mobile in `lib/plan-suggestion.ts`, with
 * the same test cases.
 *
 * A suggestion is either a whole new week, or changes to some days of the
 * active plan. A day change that differs from the live day by a single exercise
 * is shown as a before and after swap.
 */
import type { DashboardDayPlan, DashboardExercise, PlanSuggestion } from '@/lib/api';
import { exerciseMeta } from '@/lib/exercise';

export const WEEK_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type WeekdayKey = (typeof WEEK_ORDER)[number];

const SHORT: Record<WeekdayKey, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export function dayName(day: WeekdayKey): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

export interface SuggestionExerciseRow {
  name: string;
  target: string;
}

export interface SuggestionDayRow {
  day: WeekdayKey;
  short: string;
  /** "Upper Body A", "Rest", or "Removed" for a day the change takes out. */
  workout: string;
  /** "45 min", or empty. */
  time: string;
  isWorkout: boolean;
  exercises: SuggestionExerciseRow[];
}

export type SuggestionCardView =
  | {
      layout: 'week';
      title: string;
      meta: string;
      rows: SuggestionDayRow[];
      acceptLabel: string;
    }
  | {
      layout: 'day';
      day: WeekdayKey;
      title: string;
      meta: string;
      exercises: SuggestionExerciseRow[];
      removedNote: string | null;
      acceptLabel: string;
    }
  | {
      layout: 'swap';
      day: WeekdayKey;
      title: string;
      before: string;
      after: string;
      acceptLabel: string;
    };

function dayExercises(day: DashboardDayPlan | null | undefined): DashboardExercise[] {
  if (!day || day.is_rest_day) return [];
  return [...(day.warmup ?? []), ...(day.exercises ?? []), ...(day.cooldown ?? [])];
}

function mainExercises(day: DashboardDayPlan | null | undefined): DashboardExercise[] {
  if (!day || day.is_rest_day) return [];
  return day.exercises ?? [];
}

function isWorkoutDay(day: DashboardDayPlan | null | undefined): day is DashboardDayPlan {
  return !!day && !day.is_rest_day;
}

function exerciseRow(ex: DashboardExercise): SuggestionExerciseRow {
  return { name: ex.name, target: exerciseMeta(ex).replace(/(\d)-(\d)/g, '$1–$2') };
}

function minutesText(minutes: number | undefined): string {
  return minutes ? `${minutes} min` : '';
}

/** "2h 55" for a week's total; "45 min" under an hour. */
export function weekTotalText(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}`;
}

function dayRow(day: WeekdayKey, plan: DashboardDayPlan | null | undefined, removed = false): SuggestionDayRow {
  const workout = isWorkoutDay(plan);
  return {
    day,
    short: SHORT[day],
    workout: removed ? 'Removed' : workout ? plan.focus || 'Workout' : 'Rest',
    time: workout ? minutesText(plan.estimated_duration_minutes) : '',
    isWorkout: workout,
    exercises: workout ? mainExercises(plan).map(exerciseRow) : [],
  };
}

/** The changed days, in week order. */
export function changedDays(suggestion: PlanSuggestion): WeekdayKey[] {
  if (suggestion.kind === 'week') return [...WEEK_ORDER];
  return WEEK_ORDER.filter((day) => day in suggestion.payload.changes);
}

function joinDays(days: WeekdayKey[]): string {
  const names = days.map(dayName);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The one exercise that differs, when the day keeps every other exercise in
 * the same place and only one name changes.
 */
export function singleExerciseSwap(
  before: DashboardDayPlan | null | undefined,
  after: DashboardDayPlan | null | undefined,
): { from: DashboardExercise; to: DashboardExercise } | null {
  if (!isWorkoutDay(before) || !isWorkoutDay(after)) return null;
  if ((before.focus ?? '') !== (after.focus ?? '')) return null;
  const a = dayExercises(before);
  const b = dayExercises(after);
  if (a.length !== b.length || a.length === 0) return null;
  let swap: { from: DashboardExercise; to: DashboardExercise } | null = null;
  for (let i = 0; i < a.length; i += 1) {
    const same = a[i].name.trim().toLowerCase() === b[i].name.trim().toLowerCase();
    if (same) continue;
    if (swap) return null;
    swap = { from: a[i], to: b[i] };
  }
  return swap;
}

export function suggestionCardView(suggestion: PlanSuggestion): SuggestionCardView {
  if (suggestion.kind === 'week') {
    const plan = suggestion.payload.plan;
    const rows = WEEK_ORDER.map((day) => dayRow(day, plan[day]));
    const workouts = rows.filter((r) => r.isWorkout);
    const minutes = WEEK_ORDER.reduce((sum, day) => {
      const d = plan[day];
      return sum + (isWorkoutDay(d) ? d.estimated_duration_minutes ?? 0 : 0);
    }, 0);
    const count = `${workouts.length} workout${workouts.length === 1 ? '' : 's'}`;
    return {
      layout: 'week',
      title: 'Your week',
      meta: minutes > 0 ? `${count} · ${weekTotalText(minutes)} a week` : count,
      rows,
      acceptLabel: 'Accept this plan',
    };
  }

  const { changes, previous } = suggestion.payload;
  const days = changedDays(suggestion);

  if (days.length === 1) {
    const day = days[0];
    const after = changes[day] ?? null;
    const before = previous[day] ?? null;
    const swap = singleExerciseSwap(before, after);
    if (swap && after) {
      return {
        layout: 'swap',
        day,
        title: `${after.focus || 'Workout'}, ${dayName(day)}`,
        before: `${swap.from.name} · ${exerciseRow(swap.from).target}`,
        after: `${swap.to.name} · ${exerciseRow(swap.to).target}`,
        acceptLabel: 'Use this swap',
      };
    }
    if (isWorkoutDay(after)) {
      const kept = new Set(dayExercises(after).map((ex) => ex.name.trim().toLowerCase()));
      const removed = dayExercises(before).filter((ex) => !kept.has(ex.name.trim().toLowerCase()));
      const was = isWorkoutDay(before) ? before.estimated_duration_minutes : undefined;
      const now = after.estimated_duration_minutes;
      const count = mainExercises(after).length;
      let meta = `${count} exercise${count === 1 ? '' : 's'}`;
      if (now && was && now !== was) meta = `${now} min, ${now < was ? 'down' : 'up'} from ${was}`;
      else if (now) meta = `${now} min · ${meta}`;
      return {
        layout: 'day',
        day,
        title: `${dayName(day)}: ${after.focus || 'Workout'}`,
        meta,
        exercises: mainExercises(after).map(exerciseRow),
        removedNote: removed.length > 0 ? `Taken out: ${removed.map((ex) => ex.name).join(', ')}.` : null,
        acceptLabel: `Accept ${dayName(day)}`,
      };
    }
    return {
      layout: 'day',
      day,
      title: after ? `${dayName(day)}: Rest` : `${dayName(day)}: no workout`,
      meta: isWorkoutDay(before) ? `Was ${before.focus || 'a workout'}` : 'Nothing planned',
      exercises: [],
      removedNote: null,
      acceptLabel: `Accept ${dayName(day)}`,
    };
  }

  return {
    layout: 'week',
    title: 'Changes to your week',
    meta: joinDays(days),
    rows: days.map((day) => dayRow(day, changes[day], changes[day] === null)),
    acceptLabel: 'Accept changes',
  };
}

/** The card once accepted: a title, a line, and where "See plan" goes. */
export function savedView(
  suggestion: PlanSuggestion,
  today: Date = new Date(),
): { title: string; body: string; planDay: WeekdayKey | null } {
  if (suggestion.kind === 'week') {
    const plan = suggestion.payload.plan;
    // The next workout from today, wrapping into next week.
    const todayIndex = (today.getDay() + 6) % 7;
    let next: WeekdayKey | null = null;
    for (let i = 0; i < 7; i += 1) {
      const day = WEEK_ORDER[(todayIndex + i) % 7];
      if (isWorkoutDay(plan[day])) {
        next = day;
        break;
      }
    }
    const when = next === null ? null : next === WEEK_ORDER[todayIndex] ? 'today' : dayName(next);
    return {
      title: 'Plan saved',
      body: when ? `Your next workout is ${when}.` : 'It has no workouts yet.',
      planDay: null,
    };
  }
  const view = suggestionCardView(suggestion);
  if (view.layout === 'swap') {
    return {
      title: 'Plan updated',
      body: `${dayName(view.day)} now has ${view.after.split(' · ')[0]}.`,
      planDay: view.day,
    };
  }
  const days = changedDays(suggestion);
  if (days.length === 1) {
    return { title: `${dayName(days[0])} updated`, body: 'It’s ready for your next workout.', planDay: days[0] };
  }
  return { title: 'Plan updated', body: `${joinDays(days)} changed.`, planDay: null };
}

/** The grey line an earlier card collapses to once a tweak replaced it. */
export function replacedText(suggestion: PlanSuggestion): string {
  const view = suggestionCardView(suggestion);
  let what: string = view.title;
  if (view.layout === 'week') what = suggestion.kind === 'week' ? view.meta : `changes to ${view.meta}`;
  return `Earlier version: ${what}. Replaced by your tweak.`;
}

/** Quick replies while a suggestion waits, so tweaking is one tap. */
export function suggestionChips(suggestion: PlanSuggestion): string[] {
  const view = suggestionCardView(suggestion);
  if (view.layout === 'week' && suggestion.kind === 'week') {
    return ['Fewer days a week', 'Shorter sessions', 'Explain the plan'];
  }
  if (view.layout === 'swap') return ['Suggest another one', 'Keep the original'];
  return ['Shorter still', 'Make it easier', 'Explain the change'];
}

/** Mark the given suggestions replaced, wherever they sit in the chat. */
export function markReplaced<T extends { suggestion?: PlanSuggestion }>(messages: T[], ids: string[]): T[] {
  if (ids.length === 0) return messages;
  const set = new Set(ids);
  return messages.map((m) =>
    m.suggestion && set.has(m.suggestion.id) && m.suggestion.status === 'pending'
      ? { ...m, suggestion: { ...m.suggestion, status: 'replaced' as const } }
      : m,
  );
}

/** One line for a past chat's transcript, where cards are read-only. */
export function historyLine(suggestion: PlanSuggestion): string {
  const view = suggestionCardView(suggestion);
  const what = view.layout === 'week' && suggestion.kind === 'days' ? `Changes to ${view.meta}` : view.title;
  const state =
    suggestion.status === 'accepted' ? 'accepted' : suggestion.status === 'replaced' ? 'replaced' : 'not accepted';
  return `Suggested plan: ${what} (${state})`;
}
