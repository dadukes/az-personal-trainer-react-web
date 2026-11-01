import { describe, expect, it } from 'vitest';

import {
  completedSetCount,
  createDraft,
  dueSaves,
  emptyWorkoutStore,
  finishActive,
  isRetryableFailure,
  newClientSessionId,
  nextBackoffMs,
  parseWorkoutStore,
  recordFailure,
  removePending,
  retryNow,
  secondsUntil,
  startedAgoLabel,
  updateDraft,
  type WorkoutLocalStore,
} from '@/lib/workoutDraft';
import type { Block } from '@/lib/workoutSession';

const NOW = Date.parse('2026-11-01T12:00:00Z');
const ISO = new Date(NOW).toISOString();

const blocks = (completed = false): Block[] =>
  [
    {
      key: 'main-0-Bench',
      name: 'Bench',
      section: 'main',
      type: 'reps',
      sets: [
        { reps: 8, weight: 60, completed },
        { reps: 8, weight: 60, completed: false },
      ],
    },
  ] as unknown as Block[];

const draft = (id = 'c1') =>
  createDraft({ clientSessionId: id, planId: 'p1', dayKey: 'monday', startedAt: ISO, blocks: blocks() });

const payload = {
  started_at: ISO,
  completed_at: ISO,
  duration_seconds: 60,
  exercises: [{ name: 'Bench', section: 'main' as const, sets: [] }],
};

const save = (id = 'c1') => ({ clientSessionId: id, planId: 'p1', dayKey: 'monday', dateISO: '2026-11-01', payload });

const withActive = (): WorkoutLocalStore => ({ ...emptyWorkoutStore(), active: draft() });

describe('stored value', () => {
  it('survives a round trip with everything needed to resume', () => {
    const store = withActive();
    expect(parseWorkoutStore(JSON.stringify(store))).toEqual(store);
  });

  it.each([null, undefined, '', 'not json', '42', 'null'])('reads %j as empty rather than crashing', (raw) => {
    expect(parseWorkoutStore(raw)).toEqual(emptyWorkoutStore());
  });

  it('drops a broken draft without losing a finished workout', () => {
    const finished = finishActive(withActive(), save(), NOW).pending[0];
    const parsed = parseWorkoutStore(JSON.stringify({ active: { clientSessionId: 'x' }, pending: [finished] }));
    expect(parsed.active).toBeNull();
    expect(parsed.pending).toEqual([finished]);
  });
});

describe('updateDraft', () => {
  it('moves lastTickAt when a set is ticked', () => {
    const next = updateDraft(draft(), blocks(true), ISO);
    expect(next.lastTickAt).toBe(ISO);
    expect(completedSetCount(next.blocks)).toBe(1);
  });

  it('leaves lastTickAt alone for any other change', () => {
    expect(updateDraft(draft(), blocks(), ISO).lastTickAt).toBeNull();
  });

  it('keeps the id and start time, so a resumed workout is the same workout', () => {
    const next = updateDraft(draft(), blocks(true), ISO);
    expect(next.clientSessionId).toBe('c1');
    expect(next.startedAt).toBe(ISO);
  });
});

describe('finishing', () => {
  it('moves the workout from draft to queue in one step, due right away', () => {
    const next = finishActive(withActive(), save(), NOW);
    expect(next.active).toBeNull();
    expect(next.pending[0]).toEqual(
      expect.objectContaining({ clientSessionId: 'c1', attempts: 0, nextAttemptAt: NOW, needsAttention: false }),
    );
  });

  it('a double-click queues it once', () => {
    const twice = finishActive(finishActive(withActive(), save(), NOW), save(), NOW + 50);
    expect(twice.pending).toHaveLength(1);
    expect(twice.pending[0].nextAttemptAt).toBe(NOW);
  });

  it('leaves a different workout in progress alone', () => {
    const next = finishActive({ ...emptyWorkoutStore(), active: draft('other') }, save('c1'), NOW);
    expect(next.active?.clientSessionId).toBe('other');
  });

  it('keeps several finished workouts until each is confirmed', () => {
    const store = finishActive(finishActive(withActive(), save('c1'), NOW), save('c2'), NOW);
    expect(store.pending.map((p) => p.clientSessionId)).toEqual(['c1', 'c2']);
    expect(removePending(store, 'c1').pending.map((p) => p.clientSessionId)).toEqual(['c2']);
  });
});

describe('failed saves', () => {
  const queued = () => finishActive(withActive(), save(), NOW);

  it.each([
    [null, true],
    [500, true],
    [503, true],
    [401, true],
    [403, true],
    [408, true],
    [429, true],
    [400, false],
    [404, false],
    [413, false],
  ])('status %j: retry is %j', (status, retry) => {
    expect(isRetryableFailure(status)).toBe(retry);
  });

  it('backs off, and stops growing at a minute', () => {
    expect([1, 2, 3, 4, 5, 50].map(nextBackoffMs)).toEqual([5000, 15000, 30000, 60000, 60000, 60000]);
  });

  it('a network failure keeps the workout and waits', () => {
    const next = recordFailure(queued(), 'c1', { status: null, message: 'offline' }, NOW);
    expect(next.pending[0]).toEqual(
      expect.objectContaining({ attempts: 1, nextAttemptAt: NOW + 5000, needsAttention: false, lastError: 'offline' }),
    );
    expect(dueSaves(next, NOW)).toEqual([]);
    expect(dueSaves(next, NOW + 5000)).toHaveLength(1);
  });

  it('coming back online does not wait out the delay', () => {
    const next = recordFailure(queued(), 'c1', { status: null, message: 'offline' }, NOW);
    expect(dueSaves(next, NOW, true)).toHaveLength(1);
  });

  it('a refusal keeps the workout and stops retrying until asked', () => {
    const next = recordFailure(queued(), 'c1', { status: 400, message: 'bad' }, NOW);
    expect(next.pending).toHaveLength(1);
    expect(next.pending[0].needsAttention).toBe(true);
    expect(dueSaves(next, NOW + 3_600_000, true)).toEqual([]);
    expect(dueSaves(retryNow(next, 'c1', NOW), NOW)).toHaveLength(1);
  });
});

describe('secondsUntil', () => {
  it('counts from the real clock, so a throttled timer catches up', () => {
    expect(secondsUntil(NOW + 60_000, NOW + 45_000)).toBe(15);
  });

  it('rounds up, and stops at zero', () => {
    expect(secondsUntil(NOW + 100, NOW)).toBe(1);
    expect(secondsUntil(NOW, NOW + 300_000)).toBe(0);
  });
});

describe('startedAgoLabel', () => {
  const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

  it.each([
    [0, 'started just now'],
    [38, 'started 38 min ago'],
    [125, 'started 2 h ago'],
  ])('%i minutes', (minutes, label) => {
    expect(startedAgoLabel(ago(minutes), new Date(NOW))).toBe(label);
  });

  it('names the day once hours stop being useful', () => {
    const local = new Date(2026, 10, 4, 12, 0);
    expect(startedAgoLabel(new Date(2026, 10, 3, 9, 0).toISOString(), local)).toBe('started yesterday');
    expect(startedAgoLabel(new Date(2026, 10, 2, 9, 0).toISOString(), local)).toBe('started Monday');
  });

  it('copes with a bad date', () => {
    expect(startedAgoLabel('nonsense', new Date(NOW))).toBe('started earlier');
  });
});

describe('newClientSessionId', () => {
  it('is a UUID the server accepts', () => {
    expect(newClientSessionId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
