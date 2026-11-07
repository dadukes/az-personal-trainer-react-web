import { describe, expect, it } from 'vitest';

import { addDaysISO, completedAtFor, dayChoiceLabel, daysBack, pastDayNote } from '@/lib/captureDay';

describe('capture day', () => {
  it('labels days', () => {
    expect(dayChoiceLabel('2026-11-07', '2026-11-07')).toBe('Today');
    expect(dayChoiceLabel('2026-11-06', '2026-11-07')).toBe('Yesterday');
    expect(dayChoiceLabel('2026-11-03', '2026-11-07')).toBe('Tue 3 Nov');
  });

  it('steps across months', () => {
    expect(addDaysISO('2026-11-01', -1)).toBe('2026-10-31');
    expect(daysBack('2026-10-31', '2026-11-07')).toBe(7);
  });

  it('sends no time for today, and the same clock time on an earlier day', () => {
    const now = new Date(2026, 10, 7, 18, 30);
    expect(completedAtFor('2026-11-07', '2026-11-07', now)).toBeUndefined();
    const at = new Date(completedAtFor('2026-11-05', '2026-11-07', now)!);
    expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([5, 18, 30]);
  });

  it('says when a day is too old for XP', () => {
    expect(pastDayNote('2026-10-31', '2026-11-07')).toBeNull();
    expect(pastDayNote('2026-10-30', '2026-11-07')).toMatch(/no XP/);
  });
});
