import { describe, expect, it } from 'vitest';

import { activityRowMeta, compactDuration, groupByWeek, weekGroupHeader, workoutRowMeta } from '@/lib/activities';

describe('groupByWeek', () => {
  it('keeps list order and starts a group at each new week', () => {
    const groups = groupByWeek([
      { id: 'a', week_start: '2026-11-02' },
      { id: 'b', week_start: '2026-11-02' },
      { id: 'c', week_start: '2026-10-26' },
    ]);
    expect(groups.map((g) => [g.weekStart, g.items.map((i) => i.id)])).toEqual([
      ['2026-11-02', ['a', 'b']],
      ['2026-10-26', ['c']],
    ]);
  });
});

describe('weekGroupHeader', () => {
  const today = new Date(2026, 10, 5); // Thu 5 Nov
  const week = (start: string, end: string) => ({ week_start: start, week_end: end, sessions: 4, duration_minutes: 160, distance_km: 12 });

  it('leaves this week without totals, since they head the screen', () => {
    expect(weekGroupHeader('2026-11-02', week('2026-11-02', '2026-11-08'), 'metric', today)).toEqual({ title: 'This week', totals: null });
  });

  it('gives older weeks their totals', () => {
    expect(weekGroupHeader('2026-10-26', week('2026-10-26', '2026-11-01'), 'metric', today)).toEqual({
      title: 'Last week',
      totals: '4 sessions · 2 h 40 min · 12.0 km',
    });
  });
});

describe('compactDuration', () => {
  it('fits the big number', () => {
    expect(compactDuration(45)).toBe('45m');
    expect(compactDuration(93)).toBe('1h 33');
    expect(compactDuration(65)).toBe('1h 05');
    expect(compactDuration(120)).toBe('2h');
  });
});

describe('row meta', () => {
  const workout = { duration_minutes: 31, distance_km: null, source: 'app', recorded_by: null };

  it('counts ticked sets only, and leaves them out until the server sends them', () => {
    expect(workoutRowMeta({ ...workout, done_sets: 17 }, 'Tue 3 Nov', 'metric')).toBe('Tue 3 Nov · 31 min · 17 sets');
    expect(workoutRowMeta(workout, 'Tue 3 Nov', 'metric')).toBe('Tue 3 Nov · 31 min');
  });

  it('names who logged or recorded it', () => {
    expect(workoutRowMeta({ ...workout, done_sets: 0, source: 'coach' }, 'Mon', 'metric')).toBe('Mon · 31 min · Logged with coach');
  });

  it('puts a quick log note before its numbers', () => {
    expect(
      activityRowMeta({ duration_minutes: 40, distance_km: 12, source: 'app', source_app: null, notes: 'Run' }, 'Thu 29 Oct', 'metric'),
    ).toBe('Thu 29 Oct · Run · 40 min · 12.0 km · Quick log');
  });
});
