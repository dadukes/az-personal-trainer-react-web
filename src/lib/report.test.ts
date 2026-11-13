import { describe, expect, it } from 'vitest';

import type { ProgressReport } from '@/lib/api';
import {
  averageWeeklyMinutes,
  formatDuration,
  liftRow,
  minutesTick,
  monthTicks,
  niceScale,
  reportGrid,
  reportIsEmpty,
  sessionsSub,
  strengthTitle,
  weekRows,
  weightSub,
  zone2PlusPerWeek,
} from '@/lib/report';

function report(overrides: Partial<ProgressReport> = {}): ProgressReport {
  return {
    range: '4w',
    weeks_in_range: 4,
    from: '2026-10-19',
    to: '2026-11-11',
    averaged_from: '2026-10-19',
    summary: { sessions: 6, sessions_per_week: 1.8, active_days: 5, training_minutes: 480 },
    strength: null,
    weight: null,
    cardio: null,
    weeks: [
      { week_start: '2026-10-19', sessions: 2, duration_minutes: 120, distance_km: 0 },
      { week_start: '2026-10-26', sessions: 0, duration_minutes: 0, distance_km: 0 },
      { week_start: '2026-11-02', sessions: 3, duration_minutes: 300, distance_km: 5.2 },
      { week_start: '2026-11-09', sessions: 1, duration_minutes: 60, distance_km: 0 },
    ],
    days: [
      { date: '2026-10-20', mark: 'workout' },
      { date: '2026-10-22', mark: 'other' },
      { date: '2026-11-03', mark: 'workout' },
      { date: '2026-11-04', mark: 'other' },
      { date: '2026-11-10', mark: 'workout' },
    ],
    ...overrides,
  };
}

describe('formatDuration', () => {
  it('reads minutes, then hours and minutes', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1h 00');
    expect(formatDuration(143)).toBe('2h 23');
  });
});

describe('sessionsSub', () => {
  it('names the range, or the join day when averages start there', () => {
    expect(sessionsSub(report())).toBe('6 sessions in the last 4 weeks');
    expect(sessionsSub(report({ averaged_from: '2026-11-02', summary: { sessions: 1, sessions_per_week: 0.7, active_days: 1, training_minutes: 30 } })))
      .toBe('1 session since you joined on 2 Nov');
  });
});

describe('averageWeeklyMinutes', () => {
  it('averages over the days so far, at least a week', () => {
    // 24 days so far.
    expect(averageWeeklyMinutes(report())).toBeCloseTo(480 / (24 / 7));
    expect(averageWeeklyMinutes(report({ averaged_from: '2026-11-11' }))).toBe(480);
  });
});

describe('zone2PlusPerWeek', () => {
  it('sums zones 2 to 5, or is null without zones', () => {
    expect(zone2PlusPerWeek({ minutes_per_week: 62, sessions: 5, zone_minutes_per_week: [8, 31, 18, 5, 0] })).toBe(54);
    expect(zone2PlusPerWeek({ minutes_per_week: 62, sessions: 5, zone_minutes_per_week: null })).toBeNull();
    expect(zone2PlusPerWeek(null)).toBeNull();
  });
});

describe('liftRow', () => {
  it('shows e1RM in kg to one decimal, and the change signed', () => {
    expect(liftRow({ name: 'Leg Press', measure: 'e1rm_kg', from: 118, to: 131, sessions: 8, improved: true }, 'metric')).toEqual({
      name: 'Leg Press', first: '118.0', latest: '131.0', change: '+13.0', direction: 'up', measure: 'e1rm_kg',
    });
  });

  it('shows pounds whole, and reps as they are', () => {
    expect(liftRow({ name: 'Row', measure: 'e1rm_kg', from: 60, to: 58, sessions: 3, improved: false }, 'imperial')).toMatchObject({
      first: '132', latest: '128', change: '−4', direction: 'down',
    });
    expect(liftRow({ name: 'Push-up', measure: 'reps', from: 10, to: 10, sessions: 3, improved: false }, 'imperial')).toMatchObject({
      first: '10', latest: '10', change: '0', direction: 'flat',
    });
  });

  it("doesn't call a gain under the server's threshold up", () => {
    expect(liftRow({ name: 'Curl', measure: 'e1rm_kg', from: 20, to: 20.3, sessions: 2, improved: false }, 'metric').direction).toBe('flat');
  });
});

describe('strengthTitle', () => {
  it('leads with lifts up, else how many are tracked', () => {
    expect(strengthTitle({ exercises_tracked: 6, exercises_improved: 4 })).toBe('Strength: 4 of 6 lifts up');
    expect(strengthTitle({ exercises_tracked: 1, exercises_improved: 0 })).toBe('Strength: 1 lift tracked');
  });
});

describe('niceScale', () => {
  it('rounds to clean ticks', () => {
    expect(niceScale(78.2, 80.9, 3)).toEqual({ min: 78, max: 82, ticks: [78, 80, 82] });
    expect(niceScale(78.2, 80.9, 4)).toEqual({ min: 78, max: 81, ticks: [78, 79, 80, 81] });
    expect(niceScale(0, 190, 3, true)).toEqual({ min: 0, max: 200, ticks: [0, 100, 200] });
  });

  it('gives a flat series room', () => {
    const s = niceScale(80, 80, 3);
    expect(s.min).toBeLessThan(80);
    expect(s.max).toBeGreaterThan(80);
    expect(niceScale(0, 0, 3, true).max).toBeGreaterThan(0);
  });
});

describe('minutesTick', () => {
  it('reads hours on the axis', () => {
    expect(minutesTick(0)).toBe('0');
    expect(minutesTick(30)).toBe('30m');
    expect(minutesTick(120)).toBe('2h');
    expect(minutesTick(90)).toBe('1h 30');
  });
});

describe('monthTicks', () => {
  it('labels the first date and each new month, skipping one too close', () => {
    expect(monthTicks(['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'])).toEqual([
      { index: 0, label: 'Aug' },
      { index: 2, label: 'Sept' },
      { index: 6, label: 'Oct' },
    ]);
    expect(monthTicks(['2026-08-31', '2026-09-07'])).toEqual([{ index: 0, label: 'Aug' }]);
  });
});

describe('weightSub', () => {
  const weight = { latest_kg: 78.4, trend_kg_per_week: -0.21, change_kg: -2.3, span_days: 80, weigh_in_days: 31, points: [] };
  it('reads the trend in the user units', () => {
    expect(weightSub(weight, 'metric')).toBe('−0.2 kg / week over 80 days');
    expect(weightSub(weight, 'imperial')).toBe('−0.5 lb / week over 80 days');
    expect(weightSub({ ...weight, trend_kg_per_week: null }, 'metric')).toBe('A few more weigh-ins and the trend shows here');
  });
});

describe('reportGrid', () => {
  it('lays out one Monday-first column per week, with days after today as future', () => {
    const grid = reportGrid(report());
    expect(grid).toHaveLength(4);
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid[0][0]).toEqual({ date: '2026-10-19', mark: 'none', today: false });
    expect(grid[0][1].mark).toBe('workout');
    expect(grid[0][3].mark).toBe('other');
    expect(grid[3][2]).toEqual({ date: '2026-11-11', mark: 'none', today: true });
    expect(grid[3][3].mark).toBe('future');
  });
});

describe('weekRows', () => {
  it('lists the weeks newest first with their active days', () => {
    const rows = weekRows(report());
    expect(rows.map((r) => r.label)).toEqual(['This week', '2 Nov – 8 Nov', '26 Oct – 1 Nov', '19 Oct – 25 Oct']);
    expect(rows[1]).toMatchObject({ sessions: 3, minutes: 300, distanceKm: 5.2, activeDays: 2, workoutDays: 1, current: false });
    expect(rows[0].current).toBe(true);
  });
});

describe('reportIsEmpty', () => {
  it('is true only with no training, lifts or weigh-ins', () => {
    expect(reportIsEmpty(report())).toBe(false);
    expect(reportIsEmpty(report({ days: [] }))).toBe(true);
  });
});
