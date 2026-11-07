import { describe, expect, it } from 'vitest';

import {
  addDaysISO,
  consistencyGrid,
  gridStart,
  gridSummary,
  keysWithRecentData,
  gridIsEmpty,
  levelLine,
  mondayOf,
  needsOlderHistory,
  strengthHeadline,
  trendMeta,
  trendSummary,
} from '@/lib/progress';

describe('dates', () => {
  it('adds days across months and DST', () => {
    expect(addDaysISO('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysISO('2026-03-29', -1)).toBe('2026-03-28');
  });

  it('finds the Monday of the week', () => {
    expect(mondayOf('2026-11-05')).toBe('2026-11-02'); // Thursday
    expect(mondayOf('2026-11-02')).toBe('2026-11-02'); // Monday
    expect(mondayOf('2026-11-08')).toBe('2026-11-02'); // Sunday
  });
});

describe('levelLine', () => {
  it('shows XP against the next level total', () => {
    expect(levelLine({ current_level: 3, current_xp: 1090, xp_to_next_level: 1500 })).toEqual({
      level: 3,
      label: '1,090 / 1,500 XP',
      percent: 73,
      fresh: false,
    });
  });

  it('invites instead of showing 0 XP', () => {
    const line = levelLine({ current_level: 1, current_xp: 0, xp_to_next_level: 500 });
    expect(line.label).toBe('Your first workout earns XP');
    expect(line.fresh).toBe(true);
  });

  it('keeps the bar between 0 and 100', () => {
    expect(levelLine({ current_level: 1, current_xp: 0, xp_to_next_level: 0 }).percent).toBe(0);
    expect(levelLine({ current_level: 1, current_xp: 900, xp_to_next_level: 500 }).percent).toBe(100);
  });
});

describe('strengthHeadline', () => {
  it('leads with the lifts that went up', () => {
    expect(strengthHeadline({ exercises_tracked: 6, exercises_improved: 4 })).toBe('4 of 6 lifts up');
  });

  it('counts tracked lifts when none went up', () => {
    expect(strengthHeadline({ exercises_tracked: 1, exercises_improved: 0 })).toBe('1 lift tracked');
    expect(strengthHeadline({ exercises_tracked: 5, exercises_improved: 0 })).toBe('5 lifts tracked');
  });
});

describe('consistencyGrid', () => {
  const today = '2026-11-05'; // Thursday

  it('covers four whole Mon–Sun weeks ending this week', () => {
    const grid = consistencyGrid([], today);
    expect(grid).toHaveLength(28);
    expect(grid[0].date).toBe('2026-10-12');
    expect(grid[27].date).toBe('2026-11-08');
    expect(gridStart(today)).toBe('2026-10-12');
  });

  it('marks workouts over other activity, today, and days still to come', () => {
    const grid = consistencyGrid(
      [
        { kind: 'activity', date: '2026-11-03' },
        { kind: 'workout', date: '2026-11-03' },
        { kind: 'activity', date: '2026-11-04' },
        { kind: 'workout', date: '2026-10-01' }, // before the grid
      ],
      today,
    );
    const byDate = new Map(grid.map((d) => [d.date, d]));
    expect(byDate.get('2026-11-03')?.mark).toBe('workout');
    expect(byDate.get('2026-11-04')?.mark).toBe('other');
    expect(byDate.get('2026-11-05')).toEqual({ date: today, mark: 'none', today: true });
    expect(byDate.get('2026-11-06')?.mark).toBe('future');
    expect(grid.filter((d) => d.mark === 'workout')).toHaveLength(1);
    expect(gridSummary(grid)).toBe('2 training days in the last 4 weeks, 1 with a workout');
  });
});

describe('needsOlderHistory', () => {
  const today = '2026-11-05';

  it('stops at the end of history', () => {
    expect(needsOlderHistory([{ date: '2026-11-01' }], null, today)).toBe(false);
  });

  it('reads on while the oldest item is still inside the grid', () => {
    expect(needsOlderHistory([{ date: '2026-11-01' }, { date: '2026-10-12' }], 'c', today)).toBe(true);
    expect(needsOlderHistory([{ date: '2026-11-01' }, { date: '2026-10-11' }], 'c', today)).toBe(false);
    expect(needsOlderHistory([], 'c', today)).toBe(true);
  });
});

describe('trendSummary', () => {
  const logs = [
    { logged_date: '2026-11-05', sleep_hours: 7 },
    { logged_date: '2026-11-04', sleep_hours: null },
    { logged_date: '2026-11-03', sleep_hours: 8 },
    { logged_date: '2026-10-20', sleep_hours: 4 },
  ];

  it('averages only the days with a value inside the range', () => {
    expect(trendSummary(logs, 'sleep_hours', 7, '2026-11-05')).toEqual({ average: 7.5, daysWithData: 2, days: 7 });
  });

  it('has no average without data', () => {
    expect(trendSummary(logs, 'sleep_hours', 7, '2026-12-31').average).toBeNull();
  });
});

describe('keysWithRecentData', () => {
  it('keeps metrics with a value in the last 30 days', () => {
    const logs = [
      { logged_date: '2026-11-01', sleep_hours: 7, stress_level: null },
      { logged_date: '2026-09-20', sleep_hours: null, stress_level: 3 },
    ];
    expect(keysWithRecentData(logs, ['sleep_hours', 'stress_level'] as const, '2026-11-05')).toEqual(['sleep_hours']);
  });
});

describe('empty states', () => {
  it('knows a grid with nothing trained is empty', () => {
    expect(gridIsEmpty([{ date: '2026-11-07', mark: 'none', today: true }, { date: '2026-11-08', mark: 'future', today: false }])).toBe(true);
    expect(gridIsEmpty([{ date: '2026-11-07', mark: 'other', today: true }])).toBe(false);
  });

  it('says what a trend needs instead of averaging one day', () => {
    expect(trendMeta('Sleep', 0, 7)).toBe('No sleep in the last 7 days');
    expect(trendMeta('Sleep', 1, 14)).toBe('Sleep, 1 of 14 days. Another day draws the trend.');
    expect(trendMeta('Sleep', 5, 14)).toBe('Sleep average, 5 of 14 days');
  });
});
