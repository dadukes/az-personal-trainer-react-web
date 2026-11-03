import { describe, expect, it } from 'vitest';

import type { SessionExercise, WorkoutSessionSummary, WorkoutSetLogEntry } from '@/lib/api';
import { addSet, exerciseSummary, tickExercise, tickSet } from '@/lib/logbook';
import {
  dayKeyForDate,
  defaultLogTimes,
  defaultSourceFor,
  editSignature,
  editBlocksFromSession,
  lastDateForDayKey,
  monthGrid,
  onDate,
  planDayChoices,
  planDayTitles,
  recentDates,
  recentIndex,
  sessionName,
  tickedSetCount,
  timesProblem,
  toEditExercises,
  tooOldForXp,
  workoutsOnDate,
} from '@/lib/logbookPast';

const set = (n: number, over: Partial<WorkoutSetLogEntry> = {}): WorkoutSetLogEntry => ({
  id: `s${n}`,
  session_id: 'w1',
  user_id: 'u',
  created_at: '2026-11-02T08:00:00Z',
  exercise_id: 'exr_bench',
  name: 'Bench Press',
  section: 'main',
  swapped_from: null,
  skipped: false,
  set_number: n,
  reps: 8,
  weight: 40,
  weight_unit: 'kg',
  duration_seconds: null,
  completed: true,
  ...over,
});

const bench: SessionExercise = {
  key: 'main|bench press',
  section: 'main',
  exercise_id: 'exr_bench',
  name: 'Bench Press',
  type: 'reps',
  swapped_from: null,
  skipped: false,
  status: 'logged',
  done_by: null,
  earns_xp: true,
  sets: [set(1), set(2, { reps: 7 }), set(3, { completed: false })],
  target: { sets: 3, reps: 8, weight: 40, weight_unit: 'kg', duration_seconds: null },
  planned: { name: 'Bench Press', type: 'reps', sets: 3, reps: '8', rest_seconds: 90, exercise_id: 'exr_bench', cues: ['Elbows in'] },
};

const legSwings: SessionExercise = {
  key: 'warmup|leg swings',
  section: 'warmup',
  exercise_id: null,
  name: 'Leg Swings',
  type: 'mobility',
  swapped_from: null,
  skipped: false,
  status: 'not_logged',
  done_by: null,
  earns_xp: true,
  sets: [],
  target: { sets: 1, reps: null, weight: null, weight_unit: null, duration_seconds: 30 },
  planned: { name: 'Leg Swings', type: 'mobility', sets: 1, duration_seconds: 30 },
};

const sidePlank: SessionExercise = {
  key: 'cooldown|side plank',
  section: 'cooldown',
  exercise_id: 'exr_plank',
  name: 'Side Plank',
  type: 'timed',
  swapped_from: null,
  skipped: false,
  status: 'logged',
  done_by: null,
  earns_xp: true,
  sets: [set(1, { name: 'Side Plank', section: 'cooldown', reps: null, weight: null, weight_unit: null, duration_seconds: 60 })],
  target: { sets: 1, reps: null, weight: null, weight_unit: null, duration_seconds: 30 },
  planned: { name: 'Side Plank', type: 'timed', sets: 1, duration_seconds: 30, is_per_side: true },
};

describe('editStateFromSession', () => {
  it('opens a saved workout with its own sets, ticks and weights', () => {
    const state = editBlocksFromSession([legSwings, bench], 'kg');
    expect(state.map((b) => b.key)).toEqual(['warmup|leg swings', 'main|bench press']);
    expect(state[1].sets.map((s) => [s.reps, s.weight, s.completed])).toEqual([
      [8, 40, true],
      [7, 40, true],
      [8, 40, false],
    ]);
    expect(state[1].restSeconds).toBe(90);
    expect(state[1].wasLogged).toBe(true);
    // Nothing logged: unticked, at the plan's target.
    expect(state[0].wasLogged).toBe(false);
    expect(state[0].sets).toHaveLength(1);
    expect(state[0].sets[0].completed).toBe(false);
    expect(state[0].sets[0].durationSeconds).toBe(30);
  });

  it('shows a per-side hold as one side, and saves both sides as before', () => {
    const state = editBlocksFromSession([sidePlank], 'kg');
    expect(state[0].sets[0].durationSeconds).toBe(30);
    expect(toEditExercises(state)[0].sets[0].duration_seconds).toBe(60);
  });

  it('shows a swap under its new name, with the plan as the way back', () => {
    const swapped: SessionExercise = { ...bench, key: 'main|dumbbell press', name: 'Dumbbell Press', exercise_id: 'exr_db', swapped_from: 'Bench Press' };
    const state = editBlocksFromSession([swapped], 'kg');
    expect(state[0].name).toBe('Dumbbell Press');
    expect(state[0].swappedFrom).toBe('Bench Press');
    expect(state[0].planned?.name).toBe('Bench Press');
    expect(toEditExercises(state)[0]).toMatchObject({ name: 'Dumbbell Press', swapped_from: 'Bench Press' });
  });

  it('keeps an exercise added that day as off the plan', () => {
    const extra: SessionExercise = { ...bench, key: 'main|face pull', name: 'Face Pull', exercise_id: null, planned: null, target: null };
    const state = editBlocksFromSession([extra], 'lb');
    expect(state[0].addedToday).toBe(true);
    expect(state[0].sets).toHaveLength(3);
    // The logged unit wins over the profile's.
    expect(state[0].weightUnit).toBe('kg');
  });

  it("says what the coach or the watch counted, until something's ticked", () => {
    const watched: SessionExercise = { ...bench, status: 'done', done_by: 'watch', sets: [] };
    const state = editBlocksFromSession([watched], 'kg');
    expect(exerciseSummary(state[0])).toBe('Recorded on your watch');
  });
});

describe('toEditExercises', () => {
  it('always sends what had sets, and the rest only once something is ticked', () => {
    let state = editBlocksFromSession([legSwings, bench], 'kg');
    expect(toEditExercises(state).map((e) => e.name)).toEqual(['Bench Press']);
    state = tickSet(state, 0, 0, true);
    expect(toEditExercises(state).map((e) => e.name)).toEqual(['Leg Swings', 'Bench Press']);
  });

  it('sends a logged exercise unticked all the way as skipped, rather than dropping it', () => {
    let state = editBlocksFromSession([bench], 'kg');
    state = tickExercise(state, 0, false);
    const [sent] = toEditExercises(state);
    expect(sent.skipped).toBe(true);
    expect(sent.sets).toHaveLength(3);
  });
});

describe('editSignature', () => {
  const start = new Date('2026-11-02T07:00:00Z');
  const end = new Date('2026-11-02T08:00:00Z');

  it('stays the same until something that would be saved changes', () => {
    const state = editBlocksFromSession([legSwings, bench], 'kg');
    const before = editSignature(state, start, end);
    // A change to an exercise that won't be sent isn't a change.
    expect(editSignature(addSet(state, 0), start, end)).toBe(before);
    expect(editSignature(state, start, new Date(end.getTime() + 300_000))).not.toBe(before);
    const ticked = tickSet(state, 1, 2, true);
    expect(editSignature(ticked, start, end)).not.toBe(before);
    expect(tickedSetCount(ticked)).toBe(3);
  });
});

describe('dates and times', () => {
  const now = new Date(2026, 10, 3, 18, 47);

  it('offers today and the two days before', () => {
    expect(recentDates(now)).toEqual(['2026-11-03', '2026-11-02', '2026-11-01']);
    expect(recentIndex('2026-11-02', now)).toBe(1);
    expect(recentIndex('2026-10-20', now)).toBeNull();
  });

  it('starts a log ending now, rounded down, on the chosen day', () => {
    const { start, end } = defaultLogTimes('2026-11-01', now, 50);
    expect([end.getDate(), end.getHours(), end.getMinutes()]).toEqual([1, 18, 45]);
    expect((end.getTime() - start.getTime()) / 60_000).toBe(50);
    expect((defaultLogTimes('2026-11-03', now, undefined).end.getTime() - defaultLogTimes('2026-11-03', now, undefined).start.getTime()) / 60_000).toBe(45);
  });

  it('keeps the clock time when the date changes', () => {
    const moved = onDate(new Date(2026, 10, 3, 7, 10), '2026-10-28');
    expect([moved.getMonth(), moved.getDate(), moved.getHours(), moved.getMinutes()]).toEqual([9, 28, 7, 10]);
  });

  it('refuses an end before the start, or in the future', () => {
    expect(timesProblem(new Date(2026, 10, 3, 8), new Date(2026, 10, 3, 7), now)).toBe('End time must be after the start');
    expect(timesProblem(new Date(2026, 10, 3, 18), new Date(2026, 10, 3, 19), now)).toBe("End time can't be in the future");
    expect(timesProblem(new Date(2026, 10, 3, 7), new Date(2026, 10, 3, 8), now)).toBeNull();
  });

  it('knows when a workout is too old to earn XP', () => {
    expect(tooOldForXp(new Date(2026, 9, 28, 18), now)).toBe(false);
    expect(tooOldForXp(new Date(2026, 9, 26, 18), now)).toBe(true);
  });

  it('logs a plan day to its latest date, today or before', () => {
    // 3 November 2026 is a Tuesday.
    expect(lastDateForDayKey('tuesday', now)).toBe('2026-11-03');
    expect(lastDateForDayKey('thursday', now)).toBe('2026-10-29');
    expect(lastDateForDayKey('monday', now)).toBe('2026-11-02');
  });

  it('lays a month out Monday first', () => {
    // 1 November 2026 is a Sunday, so six blanks lead.
    const cells = monthGrid(2026, 10);
    expect(cells.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(cells.filter(Boolean)).toHaveLength(30);
  });
});

describe('which workout', () => {
  const plan = {
    monday: { is_rest_day: false, focus: 'Upper A', exercises: [{ name: 'Bench Press' }] },
    tuesday: { is_rest_day: true },
    thursday: { is_rest_day: false, focus: 'Lower A', exercises: [{ name: 'Squat' }] },
    friday: { is_rest_day: false, focus: 'Empty' },
  };

  it('lists the workout days, Monday first, and picks the one the date falls on', () => {
    const choices = planDayChoices(plan);
    expect(choices.map((c) => c.key)).toEqual(['monday', 'thursday']);
    expect(dayKeyForDate('2026-11-02')).toBe('monday');
    expect(defaultSourceFor(choices, '2026-11-02')).toBe('monday');
    expect(defaultSourceFor(choices, '2026-11-03')).toBeNull();
    expect(planDayTitles(plan)).toEqual({ monday: 'Upper A', thursday: 'Lower A' });
  });

  it('finds workouts already on a date and names them from the plan', () => {
    const session = (id: string, completed: string, day: string | null): WorkoutSessionSummary => ({
      id,
      user_id: 'u',
      plan_id: day ? 'p1' : null,
      day,
      started_at: completed,
      completed_at: completed,
      duration_seconds: 3600,
      total_sets: 10,
      xp_earned: 50,
      created_at: completed,
    });
    const sessions = [session('a', new Date(2026, 10, 2, 8).toISOString(), 'thursday'), session('b', new Date(2026, 10, 1, 8).toISOString(), null)];
    const found = workoutsOnDate(sessions, '2026-11-02');
    expect(found.map((s) => s.id)).toEqual(['a']);
    expect(workoutsOnDate(sessions, '2026-11-02', 'a')).toEqual([]);
    expect(sessionName(found[0], 'p1', plan)).toBe('Lower A');
    expect(sessionName(sessions[1], 'p1', plan)).toBe('a workout');
  });
});
