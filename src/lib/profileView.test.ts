import { describe, expect, it } from 'vitest';

import { addToList, daysText, profileSections, type ProfileFacts } from '@/lib/profileView';
import { formatDistance, formatRepeatDistance, displayToKm } from '@/lib/units';

const base: ProfileFacts = {
  display_name: 'Sam',
  primary_goal: 'muscle_gain',
  coach_personality: 'analyst',
  available_days: ['friday', 'monday', 'wednesday'],
  fitness_level: 'intermediate',
  preferred_duration_minutes: 45,
  limitations: [],
  equipment_available: null,
  fears: ['Burnout'],
  birth_year: null,
  height_cm: null,
  sex: null,
  max_heart_rate: null,
  preferred_unit_system: 'metric',
};

describe('profileSections', () => {
  it('reads each section, with invites where the parts that matter are missing', () => {
    const [about, training, plan, body] = profileSections(base);
    expect(about.rows.map((r) => r.value)).toEqual(['Sam', 'Build strength', 'Analyst']);
    expect(training.rows[0]).toEqual({ label: 'Days', value: 'Mon, Wed, Fri', sub: '3 a week' });
    expect(plan.rows).toEqual([{ label: 'What throws you off', value: 'Burnout' }]);
    expect(plan.invite?.action).toBe('Add injuries or equipment');
    expect(body.rows).toEqual([]);
    expect(body.invite?.title).toBe('Add your birth year and height');
  });

  it('drops the invites once there is something to show', () => {
    const [, , plan, body] = profileSections({
      ...base,
      limitations: ['lower back pain'],
      height_cm: 178,
      preferred_unit_system: 'imperial',
      sex: 'male',
    });
    expect(plan.invite).toBeUndefined();
    expect(plan.rows[0].value).toBe('Lower back pain');
    expect(body.invite).toBeUndefined();
    expect(body.rows.map((r) => r.value)).toEqual(['5′10″', 'Male']);
  });
});

describe('lists and days', () => {
  it('adds comma-separated items once, ignoring case', () => {
    expect(addToList(['Dumbbells'], 'bench, dumbbells,  Bands ')).toEqual(['Dumbbells', 'bench', 'Bands']);
    expect(addToList([], '  ')).toEqual([]);
  });
  it('keeps week order', () => {
    expect(daysText(['sunday', 'tuesday'])).toBe('Tue, Sun');
  });
});

describe('distance in the user units', () => {
  it('formats and converts', () => {
    expect(formatDistance(5, 'metric')).toBe('5 km');
    expect(formatDistance(5, 'imperial')).toBe('3.1 mi');
    expect(displayToKm(1, 'imperial')).toBeCloseTo(1.609, 3);
    expect(formatRepeatDistance(800, 'metric')).toBe('800 m');
    expect(formatRepeatDistance(1500, 'metric')).toBe('1.5 km');
    expect(formatRepeatDistance(800, 'imperial')).toBe('0.5 mi');
  });
});
