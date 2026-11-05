import { describe, expect, it } from 'vitest';

import { formatExerciseName, formatMuscle } from '@/lib/exercise';
import { isFeatureEnabled, parseFlagValue } from '@/lib/featureFlags';

describe('formatExerciseName', () => {
  it.each([
    ['cable curl', 'Cable Curl'],
    ['push-up', 'Push-up'],
    ['cable rear delt row (with rope)', 'Cable Rear Delt Row (With Rope)'],
    ['bench press on a ball', 'Bench Press on a Ball'],
    ['ez barbell curl', 'EZ Barbell Curl'],
    ['dumbbell rear delt row_shoulder', 'Dumbbell Rear Delt Row Shoulder'],
  ])('%s becomes %s', (input, expected) => {
    expect(formatExerciseName(input)).toBe(expected);
  });

  it.each(['Hammer Curl', 'Push-up', 'My RDL variation'])('leaves %s as it is', (name) => {
    expect(formatExerciseName(name)).toBe(name);
  });
});

describe('formatMuscle', () => {
  it.each([
    ['LATISSIMUS DORSI', 'Latissimus dorsi'],
    ['lats', 'Lats'],
    ['Body Weight', 'Body weight'],
  ])('%s becomes %s', (input, expected) => {
    expect(formatMuscle(input)).toBe(expected);
  });
});

describe('feature flags', () => {
  it.each([
    ['1', true],
    ['true', true],
    ['0', false],
    ['', false],
    [undefined, false],
    [null, false],
  ])('value %j reads as %j', (value, expected) => {
    expect(parseFlagValue(value)).toBe(expected);
  });

  it('the design system page is off unless asked for', () => {
    expect(isFeatureEnabled('designSystem')).toBe(false);
  });
});
