import { describe, expect, it } from 'vitest';

import type { ActivityItem, DashboardDayPlan, HistoryItem, HistoryWorkout } from '@/lib/api';
import {
  dateLabel,
  doneLine,
  doneTodayLabel,
  greetingFor,
  healthStats,
  homeWeek,
  isPlanDayDone,
  latestMissed,
  nextWorkout,
  recentLine,
  sleepLabel,
  splitFocus,
  workoutDoneOn,
  workoutMeta,
} from '@/lib/home';

const ex = (name: string) => ({ name, sets: 3, reps: '10' });
const day = (focus: string, extra: Partial<DashboardDayPlan> = {}): DashboardDayPlan => ({
  is_rest_day: false,
  focus,
  estimated_duration_minutes: 45,
  exercises: [ex('Row'), ex('Press')],
  ...extra,
});
const rest: DashboardDayPlan = { is_rest_day: true };
// Thursday 5 November 2026, mid-morning.
const now = new Date(2026, 10, 5, 9, 30);
const plan = {
  monday: day('Upper A'),
  tuesday: day('Lower A'),
  wednesday: rest,
  thursday: day('Upper B'),
  friday: day('Lower B'),
  saturday: rest,
  sunday: rest,
};

describe('greeting and date', () => {
  it('greets by the time of day', () => {
    expect(greetingFor(8)).toBe('Good morning');
    expect(greetingFor(14)).toBe('Good afternoon');
    expect(greetingFor(19)).toBe('Good evening');
  });

  it('reads the date as "Thursday 5 Nov"', () => {
    expect(dateLabel(now)).toBe('Thursday 5 Nov');
  });
});

describe('workoutMeta', () => {
  it('gives the length, the count and the extras', () => {
    expect(workoutMeta(day('X', { warmup: [ex('Circles')] }))).toBe('45 min · 2 exercises + warm-up');
    expect(workoutMeta(day('X', { warmup: [ex('a')], cooldown: [ex('b')] }))).toBe('45 min · 2 exercises + warm-up');
  });

  it('leaves out what the plan doesn\'t say', () => {
    expect(workoutMeta(day('X', { estimated_duration_minutes: undefined, exercises: [ex('Row')] }))).toBe('1 exercise');
    expect(workoutMeta({ is_rest_day: false })).toBe('');
  });
});

describe('homeWeek', () => {
  const done = new Set(['2026-11-02']);
  const activities: Record<string, ActivityItem[]> = { '2026-11-04': [{ id: 'a' } as ActivityItem] };
  const week = homeWeek(plan, (d) => done.has(d), activities, now);

  it('runs Monday to Sunday', () => {
    expect(week.days.map((d) => d.letter).join('')).toBe('MTWTFSS');
    expect(week.days[0].date).toBe('2026-11-02');
    expect(week.days[6].date).toBe('2026-11-08');
  });

  it('marks done, today, planned and rest', () => {
    expect(week.days.map((d) => d.state)).toEqual(['done', 'planned', 'rest', 'today', 'planned', 'rest', 'rest']);
  });

  it('counts the plan\'s workouts and the ones done', () => {
    expect(week.planned).toBe(4);
    expect(week.done).toBe(1);
  });

  it('keeps other activity separate from the plan', () => {
    expect(week.days[2].otherCount).toBe(1);
    expect(week.days[2].state).toBe('rest');
    expect(week.days[2].label).toBe('Wednesday 4: rest day, plus another activity');
  });

  it('finds the latest missed plan day', () => {
    expect(week.days[1].missed).toBe(true);
    expect(week.days[3].missed).toBe(false);
    expect(latestMissed(week)?.dayKey).toBe('tuesday');
    expect(week.days[1].label).toBe('Tuesday 3: Lower A, not ticked');
  });

  it('shows today as done once it is', () => {
    const doneToday = homeWeek(plan, (d) => d === '2026-11-05', {}, now);
    expect(doneToday.days[3].state).toBe('done');
    expect(doneToday.days[3].isToday).toBe(true);
  });

  it('has no plan days without a plan', () => {
    const empty = homeWeek(null, () => false, {}, now);
    expect(empty.planned).toBe(0);
    expect(empty.days.filter((d) => d.state === 'today')).toHaveLength(1);
    expect(latestMissed(empty)).toBeNull();
  });
});

describe('nextWorkout', () => {
  it('is tomorrow when tomorrow has one', () => {
    expect(nextWorkout(plan, now)).toEqual({ dayKey: 'friday', when: 'Tomorrow', title: 'Lower B', minutes: 45 });
  });

  it('skips rest days and names the weekday', () => {
    const saturday = new Date(2026, 10, 7, 18);
    expect(nextWorkout(plan, saturday)?.when).toBe('Monday');
  });

  it('is null without a plan', () => {
    expect(nextWorkout({ monday: rest }, now)).toBeNull();
  });
});

describe('the done card', () => {
  const workout: HistoryWorkout = {
    id: 'w1',
    plan_id: 'p',
    day: 'thursday',
    title: 'Upper B',
    started_at: '2026-11-05T07:10:00',
    completed_at: '2026-11-05T07:58:00',
    duration_minutes: 48,
    total_sets: 22,
    xp_earned: 72,
    source: 'app',
    coach_logged: false,
    avg_hr: null,
    max_hr: null,
    recorded_by: null,
    distance_km: null,
  };
  const items: HistoryItem[] = [
    { kind: 'workout', id: 'w1', completed_at: workout.completed_at, date: '2026-11-05', week_start: '2026-11-02', workout },
  ];

  it('finds today\'s workout in the history page', () => {
    expect(workoutDoneOn(items, '2026-11-05')?.id).toBe('w1');
    expect(workoutDoneOn(items, '2026-11-04')).toBeNull();
  });

  it('gives minutes and XP, not sets', () => {
    expect(doneLine(workout)).toBe('48 min · +72 XP');
    expect(doneLine({ ...workout, duration_minutes: 0, xp_earned: 0 })).toBe('');
  });

  it('gives the time it finished', () => {
    expect(doneTodayLabel(workout)).toBe('Done today, 7:58 am');
  });
});

describe('health', () => {
  it('reads sleep as hours and minutes', () => {
    expect(sleepLabel(7.2)).toBe('7h 12');
    expect(sleepLabel(8)).toBe('8h');
    expect(sleepLabel(6.999)).toBe('7h');
  });

  it('shows only the numbers there are', () => {
    expect(healthStats({ sleep_hours: 7.2, resting_heart_rate: 58, step_count: 6240, active_calories_burned: 412 })).toEqual([
      { key: 'sleep_hours', value: '7h 12', label: 'Sleep' },
      { key: 'resting_heart_rate', value: '58', label: 'Resting HR' },
      { key: 'step_count', value: '6,240', label: 'Steps' },
      { key: 'active_calories_burned', value: '412', label: 'Active kcal' },
    ]);
    expect(healthStats({ sleep_hours: null, resting_heart_rate: 0, step_count: 3100, active_calories_burned: null })).toEqual([
      { key: 'step_count', value: '3,100', label: 'Steps' },
    ]);
  });
});

describe('recentLine', () => {
  it('reads a workout and an activity by day', () => {
    const workout = {
      kind: 'workout',
      id: 'w',
      completed_at: '',
      date: '2026-11-03',
      week_start: '2026-11-02',
      workout: { title: 'Lower A', day: 'tuesday', duration_minutes: 31 },
    } as HistoryItem;
    const run = {
      kind: 'activity',
      id: 'a',
      completed_at: '',
      date: '2026-11-04',
      week_start: '2026-11-02',
      activity: { name: 'Easy Run', activity_type: 'cardio', duration_minutes: 31, distance_km: 5.2 },
    } as HistoryItem;
    expect(recentLine(workout, 'metric', now)).toEqual({ title: 'Lower A', meta: 'Tue · 31 min' });
    expect(recentLine(run, 'metric', now)).toEqual({ title: 'Easy Run', meta: 'Yesterday · 31 min · 5.2 km' });
  });
});

describe('splitFocus', () => {
  it('splits the name from what it works', () => {
    expect(splitFocus('Upper Body B (Incline Press & Back Sculpt)')).toEqual({ title: 'Upper Body B', subtitle: 'Incline Press & Back Sculpt' });
  });

  it('keeps a plain name whole', () => {
    expect(splitFocus('Full Body')).toEqual({ title: 'Full Body', subtitle: null });
    expect(splitFocus(undefined)).toEqual({ title: 'Workout', subtitle: null });
  });

  it('shortens the names on the week and in Recent', () => {
    const long = { monday: day('Upper A (Press & Pull)') };
    expect(homeWeek(long, () => false, {}, now).days[0].title).toBe('Upper A');
    expect(nextWorkout(long, now)?.title).toBe('Upper A');
  });
});

describe('isPlanDayDone', () => {
  const server = new Set(['2026-11-02']);
  const mark = { completedAt: '2026-11-05T09:00:00.000Z' };
  it('takes the server\'s word', () => {
    expect(isPlanDayDone('2026-11-02', server, undefined, '2026-11-05T10:00:00.000Z', '2026-11-05')).toBe(true);
  });
  it('counts a mark the server hasn\'t answered since', () => {
    expect(isPlanDayDone('2026-11-05', server, mark, '2026-11-05T08:00:00.000Z', '2026-11-05')).toBe(true);
    expect(isPlanDayDone('2026-11-05', server, mark, null, '2026-11-05')).toBe(true);
  });
  it('drops a mark once the server has answered without it', () => {
    expect(isPlanDayDone('2026-11-03', server, mark, '2026-11-05T10:00:00.000Z', '2026-11-05')).toBe(false);
  });
  it('never counts a mark dated after today', () => {
    expect(isPlanDayDone('2026-11-06', server, mark, null, '2026-11-05')).toBe(false);
  });
});
