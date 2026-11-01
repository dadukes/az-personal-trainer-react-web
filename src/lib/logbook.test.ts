import { describe, expect, it } from 'vitest';

import {
  addExercise,
  addSet,
  applyPlanChanges,
  carryWeight,
  exerciseSummary,
  exerciseTarget,
  firstOpenIndex,
  FORGOT_AFTER_MS,
  forgotFinishAt,
  lastAndRestText,
  lastSessionsByKey,
  lastSetText,
  lastTimeText,
  nextOpenIndex,
  planChanges,
  removeExercise,
  removeSet,
  sectionDone,
  sectionFoldNote,
  seedLastSessions,
  setRounds,
  setSetValues,
  skipExercise,
  swapExercise,
  tickAll,
  tickExercise,
  tickSection,
  tickSet,
  toLogbookExercises,
  unfinishedExercises,
  workoutTally,
} from '@/lib/logbook';
import { type Block, toLoggedExercises } from '@/lib/workoutSession';

const lift = (name: string, overrides: Partial<Block> = {}, count = 3): Block => ({
  key: `main-${name}`,
  name,
  section: 'main',
  type: 'reps',
  restSeconds: 90,
  repText: '8-10',
  repTarget: 8,
  weight: 22.5,
  weightUnit: 'kg',
  isPerSide: false,
  sets: Array.from({ length: count }, () => ({
    reps: 8,
    weight: overrides.weight ?? 22.5,
    completed: false,
    durationSeconds: overrides.durationSeconds,
  })),
  ...overrides,
});
const warm = (name: string) => lift(name, { key: `warmup-${name}`, section: 'warmup', type: 'timed', durationSeconds: 30, restSeconds: 0, weight: 0 }, 1);
const cool = (name: string) => lift(name, { key: `cooldown-${name}`, section: 'cooldown', type: 'cardio', restSeconds: 0, weight: 0, targetDurationMinutes: 10, durationSeconds: 600 }, 1);
const done = (blocks: Block[]) => blocks.map((b) => b.sets.map((s) => s.completed));

describe('logbook actions', () => {
  it('ticks and unticks any set', () => {
    let blocks = [lift('A'), cool('Walk')];
    blocks = tickSet(blocks, 1, 0, true);
    blocks = tickSet(blocks, 0, 2, true);
    expect(done(blocks)).toEqual([[false, false, true], [true]]);
    blocks = tickSet(blocks, 0, 2, false);
    expect(done(blocks)[0]).toEqual([false, false, false]);
  });

  it('ticks a whole exercise, and that undoes a skip', () => {
    let blocks = skipExercise([lift('A')], 0, true);
    blocks = tickExercise(blocks, 0, true);
    expect(done(blocks)[0]).toEqual([true, true, true]);
    expect(blocks[0].skipped).toBe(false);
  });

  it('ticks a section or everything, leaving skipped exercises alone', () => {
    let blocks = [warm('W'), lift('A'), lift('B'), cool('Walk')];
    blocks = tickSection(blocks, 'warmup', true);
    expect(done(blocks)).toEqual([[true], [false, false, false], [false, false, false], [false]]);
    blocks = skipExercise(blocks, 2, true);
    blocks = tickAll(blocks, true);
    expect(done(blocks)).toEqual([[true], [true, true, true], [false, false, false], [true]]);
    expect(toLoggedExercises(blocks)[2].skipped).toBe(true);
    blocks = tickAll(blocks, false);
    expect(done(blocks).flat().some(Boolean)).toBe(false);
  });

  it('skipping clears the ticks, so it cannot log as both', () => {
    let blocks = tickExercise([lift('A')], 0, true);
    blocks = skipExercise(blocks, 0, true);
    expect(toLoggedExercises(blocks)[0]).toMatchObject({ skipped: true });
    expect(done(blocks)[0]).toEqual([false, false, false]);
    expect(skipExercise(blocks, 0, false)[0].skipped).toBe(false);
  });

  it('entering rounds ticks that many, and lowering it unticks the rest', () => {
    let blocks = [lift('Bike', { type: 'cardio', cardioFormat: 'intervals', intervals: { rounds: 4, work_seconds: 30, recover_seconds: 60 }, weight: 0 }, 4)];
    blocks = setRounds(blocks, 0, 3);
    expect(done(blocks)[0]).toEqual([true, true, true, false]);
    blocks = setRounds(blocks, 0, 1);
    expect(done(blocks)[0]).toEqual([true, false, false, false]);
  });

  it('adds a set that copies the last one, unticked, and removes the last set down to one', () => {
    let blocks = [lift('A', {}, 2)];
    blocks = setSetValues(blocks, 0, 1, { weight: 70, reps: 6 }, false);
    blocks = tickSet(blocks, 0, 1, true);
    blocks = addSet(blocks, 0);
    expect(blocks[0].sets[2]).toMatchObject({ weight: 70, reps: 6, completed: false, weightEdited: false });
    blocks = removeSet(removeSet(removeSet(blocks, 0), 0), 0);
    expect(blocks[0].sets).toHaveLength(1);
  });

  it('adds an exercise before the cool-down, and it logs', () => {
    let blocks = addExercise([warm('W'), lift('A'), cool('Walk')], { name: 'Face Pull', exerciseId: 'exr_9' }, 'kg');
    expect(blocks.map((b) => b.name)).toEqual(['W', 'A', 'Face Pull', 'Walk']);
    expect(blocks[2]).toMatchObject({ addedToday: true, section: 'main', weight: 0 });
    expect(blocks[2].sets).toHaveLength(3);
    expect(blocks[2].sets[0]).toMatchObject({ reps: 10, weight: 0, completed: false });
    blocks = tickExercise(blocks, 2, true);
    expect(toLoggedExercises(blocks)[2]).toMatchObject({ name: 'Face Pull', exercise_id: 'exr_9', skipped: false, section: 'main' });
  });

  it('gives added exercises different keys, even after a removal', () => {
    const pick = { name: 'Face Pull' };
    let blocks = addExercise(addExercise([lift('A')], pick, 'kg'), pick, 'kg');
    blocks = removeExercise(blocks, 1);
    blocks = addExercise(blocks, pick, 'kg');
    const keys = blocks.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('removes an exercise from the log altogether', () => {
    const blocks = removeExercise([lift('A'), lift('B'), cool('Run')], 1);
    expect(toLoggedExercises(blocks).map((e) => e.name)).toEqual(['A', 'Run']);
  });

  describe('entering numbers', () => {
    it('"use this for the next sets" changes only unticked sets below', () => {
      let blocks = [lift('A', { weight: 60 }, 4)];
      blocks = tickSet(tickSet(blocks, 0, 0, true), 0, 2, true);
      blocks = setSetValues(blocks, 0, 1, { weight: 65, reps: 5 }, true);
      expect(blocks[0].sets.map((s) => s.weight)).toEqual([60, 65, 60, 65]);
      expect(blocks[0].sets.map((s) => s.reps)).toEqual([8, 5, 8, 5]);
    });

    it('with it off, changes only that set', () => {
      const blocks = setSetValues([lift('A', { weight: 60 })], 0, 0, { weight: 65 }, false);
      expect(blocks[0].sets.map((s) => s.weight)).toEqual([65, 60, 60]);
    });

    it('leaves whichever value was not sent, and saves cardio minutes and distance', () => {
      let blocks = [cool('Run')];
      blocks = setSetValues(blocks, 0, 0, { distanceKm: 5.4 }, false);
      blocks = setSetValues(blocks, 0, 0, { durationSeconds: 1500 }, false);
      blocks = tickSet(blocks, 0, 0, true);
      expect(toLoggedExercises(blocks)[0]).toMatchObject({ distance_km: 5.4 });
      expect(toLoggedExercises(blocks)[0].sets[0].duration_seconds).toBe(1500);
    });

    it('a blank weight logs as no load, as today', () => {
      const blocks = tickSet([lift('A', { weight: 0 }, 1)], 0, 0, true);
      expect(toLoggedExercises(blocks)[0].sets[0]).toMatchObject({ weight: 0, completed: true });
    });
  });

  describe('swap and swap back', () => {
    const history = [{ set_number: 1, reps: 8, weight: 60, weight_unit: 'kg' as const, duration_seconds: null, distance_km: null }];

    it('brings the plan and its cues back, and drops history from the other movement', () => {
      const planned = { name: 'Bench', exerciseId: 'exr_1' };
      let blocks = [lift('Bench', { exercise_id: 'exr_1', cues: ['Lower slowly'], plannedCues: ['Lower slowly'], planned, lastSets: history }, 2)];
      blocks = swapExercise(blocks, 0, { name: 'Machine Press', exerciseId: 'exr_2' });
      expect(blocks[0]).toMatchObject({ name: 'Machine Press', swappedFrom: 'Bench' });
      expect(blocks[0].cues).toBeUndefined();
      expect(blocks[0].lastSets).toBeUndefined();
      expect(blocks[0].sets.map((s) => s.weight)).toEqual([0, 0]);

      blocks = swapExercise(blocks, 0, planned);
      expect(blocks[0]).toMatchObject({ name: 'Bench', exercise_id: 'exr_1', cues: ['Lower slowly'] });
      expect(blocks[0].swappedFrom).toBeUndefined();
    });

    it('keeps sets already ticked', () => {
      let blocks = tickSet([lift('A', { weight: 60 }, 2)], 0, 0, true);
      blocks = swapExercise(blocks, 0, { name: 'Machine Press' });
      expect(blocks[0].sets[0]).toMatchObject({ weight: 60, completed: true });
    });
  });

  describe('last sessions', () => {
    const last = (weight: number, reps: number[] = [10, 9]) => ({
      exercise_id: 'exr_1',
      name: 'A',
      session_id: 's1',
      performed_at: '2026-10-08T08:00:00Z',
      sets: reps.map((r, i) => ({ set_number: i + 1, reps: r, weight, weight_unit: 'kg' as const, duration_seconds: null, distance_km: null })),
    });

    it('keeps the sets for display and carries the load, by the exercise key', () => {
      const blocks = seedLastSessions([lift('A', { weight: 0 }, 2)], { 'main-A': last(62.5) });
      expect(blocks[0].lastSets).toHaveLength(2);
      expect(blocks[0].sets.map((s) => s.weight)).toEqual([62.5, 62.5]);
    });

    it('a heavier plan still wins, and a number already entered is kept', () => {
      let blocks = setSetValues([lift('A', { weight: 70 }, 2)], 0, 0, { weight: 75 }, false);
      blocks = seedLastSessions(blocks, { 'main-A': last(62.5) });
      expect(blocks[0].sets.map((s) => s.weight)).toEqual([75, 70]);

      let other = setSetValues([lift('A', { weight: 0 }, 2)], 0, 0, { weight: 75 }, false);
      other = seedLastSessions(other, { 'main-A': last(62.5) });
      expect(other[0].sets.map((s) => s.weight)).toEqual([75, 62.5]);
    });

    it('a different unit last time leaves the weight blank rather than convert it', () => {
      const blocks = seedLastSessions([lift('A', { weight: 0, weightUnit: 'lb' }, 2)], { 'main-A': last(62.5) });
      expect(blocks[0].sets.map((s) => s.weight)).toEqual([0, 0]);
      expect(blocks[0].lastSets).toHaveLength(2);
    });
  });

  it('a draft saved before the logbook opens and carries on', () => {
    const stored = tickSet([lift('A'), cool('Run')], 0, 0, true);
    const fromDisk = JSON.parse(JSON.stringify(stored)) as Block[];
    const blocks = addSet(tickSet(fromDisk, 0, 1, true), 0);
    expect(done(blocks)[0]).toEqual([true, true, false, false]);
    expect(toLoggedExercises(blocks)[0].sets).toHaveLength(4);
  });
});

describe('workoutTally', () => {
  it('counts ticked sets, leaving skipped exercises out of both numbers', () => {
    let blocks = tickSet([lift('A'), lift('B')], 0, 0, true);
    expect(workoutTally(blocks)).toEqual({ done: 1, total: 6 });
    blocks = skipExercise(blocks, 1, true);
    expect(workoutTally(blocks)).toEqual({ done: 1, total: 3 });
  });
});

describe('which exercise is open', () => {
  it('starts on the first main exercise, past the folded warm-up', () => {
    expect(firstOpenIndex([warm('W'), lift('A')])).toBe(1);
  });

  it('uses the warm-up when that is all there is, and nothing when all done', () => {
    expect(firstOpenIndex([warm('W')])).toBe(0);
    expect(firstOpenIndex(tickExercise([warm('W')], 0, true))).toBeNull();
  });

  it('moves down to the next unfinished, then wraps to anything left above', () => {
    let blocks = [warm('W'), lift('A'), lift('B'), lift('C')];
    expect(nextOpenIndex(blocks, 1)).toBe(2);
    blocks = tickExercise(blocks, 2, true);
    expect(nextOpenIndex(blocks, 1)).toBe(3);
    expect(nextOpenIndex(blocks, 3)).toBe(1);
  });

  it('passes over skipped exercises and never reopens the warm-up', () => {
    const blocks = skipExercise([warm('W'), lift('A'), lift('B')], 2, true);
    expect(nextOpenIndex(blocks, 1)).toBeNull();
  });
});

describe('sections', () => {
  it('a section is done when everything not skipped is, and an empty one never is', () => {
    let blocks = [warm('W1'), warm('W2'), lift('A')];
    expect(sectionDone(blocks, 'warmup')).toBe(false);
    expect(sectionDone(blocks, 'cooldown')).toBe(false);
    blocks = skipExercise(tickExercise(blocks, 0, true), 1, true);
    expect(sectionDone(blocks, 'warmup')).toBe(true);
  });

  it('the folded line says what is in it, then how far along', () => {
    let blocks = [warm('Circles'), warm('Bands')];
    expect(sectionFoldNote(blocks, 'warmup', (n) => n)).toBe('Circles, Bands');
    blocks = tickExercise(blocks, 0, true);
    expect(sectionFoldNote(blocks, 'warmup', (n) => n)).toBe('1 of 2 done');
    blocks = tickExercise(blocks, 1, true);
    expect(sectionFoldNote(blocks, 'warmup', (n) => n)).toBe('2 done');
  });
});

describe('unfinishedExercises', () => {
  it('lists what is left, without skipped or finished ones', () => {
    let blocks = tickSet([lift('A'), lift('B'), lift('C')], 0, 0, true);
    blocks = skipExercise(tickExercise(blocks, 1, true), 2, true);
    expect(unfinishedExercises(blocks)).toEqual([{ name: 'A', left: 2 }]);
  });
});

describe('exercise lines', () => {
  it('shows the target before anything is done', () => {
    const block = lift('A');
    expect(exerciseTarget(block)).toBe('3 × 8-10 · 22.5 kg');
    expect(exerciseSummary(block)).toBe('3 × 8-10 · 22.5 kg');
  });

  it('leaves the load off with no weight, and adds each side', () => {
    expect(exerciseSummary(lift('A', { weight: 0, isPerSide: true }))).toBe('3 × 8-10 each side');
  });

  it('shows progress, then what was done', () => {
    let blocks = tickSet([lift('A')], 0, 0, true);
    expect(exerciseSummary(blocks[0])).toBe('1 of 3 sets · 3 × 8-10 · 22.5 kg');
    blocks = tickExercise(setSetValues(blocks, 0, 2, { reps: 7 }, false), 0, true);
    expect(exerciseSummary(blocks[0])).toBe('3 sets · 22.5 kg · 8, 8, 7');
  });

  it('spells out each set when weights differ, and handles blank weights', () => {
    const blocks = tickExercise(setSetValues([lift('A', {}, 2)], 0, 1, { weight: 25 }, false), 0, true);
    expect(exerciseSummary(blocks[0])).toBe('8 × 22.5, 8 × 25');
    expect(exerciseSummary(tickExercise([lift('A', { weight: 0 }, 2)], 0, true)[0])).toBe('2 sets · 8, 8');
  });

  it('covers skipped, timed, cardio and intervals', () => {
    expect(exerciseSummary(skipExercise([lift('A')], 0, true)[0])).toBe('Skipped');

    const hold = lift('P', { type: 'timed', durationSeconds: 45, weight: 0, isPerSide: true }, 2);
    expect(exerciseSummary(hold)).toBe('2 × 45s each side');
    expect(exerciseSummary(tickExercise([hold], 0, true)[0])).toBe('2 sets · 45s');

    const carry = lift('Carry', { type: 'timed', durationSeconds: 45, weight: 20 }, 2);
    expect(exerciseSummary(tickExercise([carry], 0, true)[0])).toBe('2 sets · 45s · 20 kg');

    let walk = [cool('Walk')];
    expect(exerciseSummary(walk[0])).toBe('10 min');
    walk = tickExercise(setSetValues(walk, 0, 0, { distanceKm: 1.1 }, false), 0, true);
    expect(exerciseSummary(walk[0])).toBe('10 min · 1.1 km');

    let bike = [lift('Bike', { type: 'cardio', cardioFormat: 'intervals', intervals: { rounds: 6, work_seconds: 30, recover_seconds: 60 }, durationSeconds: 30, weight: 0 }, 6)];
    expect(exerciseSummary(bike[0])).toBe('6 rounds');
    bike = setRounds(bike, 0, 4);
    expect(exerciseSummary(bike[0])).toBe('4 of 6 rounds');
  });
});

describe('last time', () => {
  const set = (reps: number | null, weight: number | null, extra = {}) => ({
    set_number: 1, reps, weight, weight_unit: weight ? ('kg' as const) : null, duration_seconds: null, distance_km: null, ...extra,
  });

  it('is null with no history', () => {
    expect(lastTimeText(lift('A'))).toBeNull();
    expect(lastTimeText(lift('A', { lastSets: [] }))).toBeNull();
  });

  it('reads one weight, several weights and no weight', () => {
    expect(lastTimeText(lift('A', { lastSets: [set(10, 20), set(10, 20), set(9, 20)] }))).toBe('Last time 20 kg × 10, 10, 9');
    expect(lastTimeText(lift('A', { lastSets: [set(10, 20), set(8, 22.5)] }))).toBe('Last time 20 × 10, 22.5 × 8');
    expect(lastTimeText(lift('A', { lastSets: [set(12, 0), set(11, null)] }))).toBe('Last time 12, 11');
  });

  it('reads holds and cardio', () => {
    const hold = lift('P', { type: 'timed', lastSets: [set(null, null, { duration_seconds: 30 }), set(null, null, { duration_seconds: 25 })] });
    expect(lastTimeText(hold)).toBe('Last time 30s, 25s');
    expect(lastTimeText({ ...cool('Walk'), lastSets: [set(null, null, { duration_seconds: 600, distance_km: 1.1 })] })).toBe('Last time 10 min, 1.1 km');
    expect(lastTimeText({ ...cool('Walk'), lastSets: [set(null, null, { duration_seconds: 600 })] })).toBe('Last time 10 min');
  });

  it('adds rest, and is null with neither', () => {
    expect(lastAndRestText(lift('A', { lastSets: [set(10, 20)] }))).toBe('Last time 20 kg × 10 · Rest 90 s');
    expect(lastAndRestText(lift('A'))).toBe('Rest 90 s');
    expect(lastAndRestText(lift('A', { restSeconds: 0 }))).toBeNull();
  });

  it('points an interval at its timer instead of a rest', () => {
    const bike = lift('Bike', { type: 'cardio', cardioFormat: 'intervals', intervals: { rounds: 6, work_seconds: 30, recover_seconds: 60 }, restSeconds: 60 });
    expect(lastAndRestText(bike)).toBe('Use the timer, or just enter your rounds');
  });
});

describe('forgotFinishAt', () => {
  const tick = '2026-11-01T07:52:00Z';
  const at = Date.parse(tick);

  it('offers the last tick once enough time has passed', () => {
    expect(forgotFinishAt({ lastTickAt: tick }, at + FORGOT_AFTER_MS - 1)).toBeNull();
    expect(forgotFinishAt({ lastTickAt: tick }, at + FORGOT_AFTER_MS)).toBe(tick);
  });

  it('has nothing to ask with no tick, or a bad one', () => {
    expect(forgotFinishAt({ lastTickAt: null }, at + FORGOT_AFTER_MS * 2)).toBeNull();
    expect(forgotFinishAt({ lastTickAt: 'nonsense' }, at)).toBeNull();
  });
});

describe('planChanges', () => {
  it('lists added and swapped exercises only', () => {
    let blocks = [lift('A'), lift('B')];
    expect(planChanges(blocks)).toEqual([]);
    blocks = swapExercise(blocks, 1, { name: 'Landmine' });
    blocks = addExercise(blocks, { name: 'Face Pull' }, 'kg');
    expect(planChanges(blocks)).toEqual([
      { key: 'main-B', name: 'Landmine', replaced: 'B' },
      { key: expect.stringContaining('Face Pull'), name: 'Face Pull' },
    ]);
  });

  it('a swap undone is no longer a change', () => {
    let blocks = swapExercise([lift('A')], 0, { name: 'Landmine' });
    blocks = swapExercise(blocks, 0, { name: 'A' });
    expect(planChanges(blocks)).toEqual([]);
  });
});

describe('carryWeight', () => {
  it('carries down, stopping at a set done or given its own weight', () => {
    let blocks = [lift('A', { weight: 60 }, 4)];
    blocks = setSetValues(blocks, 0, 3, { weight: 50 }, false);
    blocks = carryWeight(blocks, 0, 0, 65);
    expect(blocks[0].sets.map((s) => s.weight)).toEqual([65, 65, 65, 50]);

    blocks = tickSet(blocks, 0, 1, true);
    blocks = carryWeight(blocks, 0, 0, 70);
    expect(blocks[0].sets.map((s) => s.weight)).toEqual([70, 65, 65, 50]);
  });
});

describe('lastSetText', () => {
  const set = (reps: number | null, weight: number | null, extra = {}) => ({
    set_number: 1, reps, weight, weight_unit: null, duration_seconds: null, distance_km: null, ...extra,
  });

  it('reads each kind of set, and a dash with none', () => {
    expect(lastSetText(set(10, 20))).toBe('20 × 10');
    expect(lastSetText(set(12, 0))).toBe('12');
    expect(lastSetText(set(null, null, { duration_seconds: 30 }))).toBe('30s');
    expect(lastSetText(set(null, null, { duration_seconds: 600, distance_km: 1.1 }))).toBe('10 min, 1.1 km');
    expect(lastSetText(undefined)).toBe('–');
  });
});

describe('sending a workout', () => {
  it('logs both sides of a per-side hold, and leaves everything else alone', () => {
    const blocks = tickAll([
      lift('Side Plank', { type: 'timed', durationSeconds: 30, weight: 0, isPerSide: true }, 1),
      lift('Plank', { type: 'timed', durationSeconds: 30, weight: 0 }, 1),
      lift('Bench', {}, 1),
    ], true);
    const logged = toLogbookExercises(blocks);
    expect(logged[0].sets[0].duration_seconds).toBe(60);
    expect(logged[1].sets[0].duration_seconds).toBe(30);
    expect(logged[2].sets[0]).toMatchObject({ reps: 8, weight: 22.5, duration_seconds: null });
  });
});

describe('lastSessionsByKey', () => {
  const result = (exercise_id: string | null, name: string) => ({
    exercise_id, name, session_id: 's', performed_at: '2026-10-01T00:00:00Z', sets: [],
  });

  it('matches on id and name, ignoring case', () => {
    const blocks = [lift('Bench', { exercise_id: 'exr_1' }), lift('Typed'), lift('Never')];
    const byKey = lastSessionsByKey(blocks, [result('exr_1', 'BENCH'), result(null, 'typed')]);
    expect(Object.keys(byKey)).toEqual(['main-Bench', 'main-Typed']);
  });
});

describe('applyPlanChanges', () => {
  const planned = { name: 'Press', exercise_id: 'exr_1', sets: 3, reps: '10', notes: 'Go slow', cues: ['Ribs down'] };
  const day = { is_rest_day: false, focus: 'Upper', warmup: [{ name: 'Circles' }], exercises: [planned], cooldown: [{ name: 'Walk' }] };
  const setup = () => {
    let blocks = [lift('Press', { exercise_id: 'exr_1' })];
    blocks = swapExercise(blocks, 0, { name: 'Landmine', exerciseId: 'exr_2' });
    blocks = addExercise(blocks, { name: 'Face Pull', exerciseId: 'exr_9' }, 'kg');
    return setSetValues(blocks, 1, 0, { reps: 15 }, true);
  };

  it('changes nothing with nothing kept', () => {
    expect(applyPlanChanges(day, setup(), []).exercises).toEqual([planned]);
  });

  it('a kept swap takes the planned place, keeping its sets and reps', () => {
    const next = applyPlanChanges(day, setup(), ['main-Press']);
    expect(next.exercises).toHaveLength(1);
    expect(next.exercises?.[0]).toMatchObject({ name: 'Landmine', exercise_id: 'exr_2', sets: 3, reps: '10' });
    expect(next.exercises?.[0].notes).toBeUndefined();
    expect(next.warmup).toEqual(day.warmup);
    expect(next.focus).toBe('Upper');
  });

  it('a kept addition goes on the end, with what was done', () => {
    const blocks = setup();
    const next = applyPlanChanges(day, blocks, [blocks[1].key]);
    expect(next.exercises?.map((e) => e.name)).toEqual(['Press', 'Face Pull']);
    expect(next.exercises?.[1]).toMatchObject({ exercise_id: 'exr_9', sets: 3, reps: '15', type: 'reps' });
  });

  it('passes over a swap whose planned exercise has left the plan', () => {
    const next = applyPlanChanges({ ...day, exercises: [{ name: 'Other' }] }, setup(), ['main-Press']);
    expect(next.exercises).toEqual([{ name: 'Other' }]);
  });
});
