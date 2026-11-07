import { describe, expect, it } from 'vitest';

import { formatIntervals, intervalWorkText, newPlanExercise, targetsClearedBy } from '@/lib/exercise';

describe('distance repeats', () => {
  it('reads as rounds of a distance, with the recovery', () => {
    expect(formatIntervals({ rounds: 4, work_distance_m: 800, recover_seconds: 90 })).toBe('4 × 800 m / 90s');
    expect(formatIntervals({ rounds: 3, work_distance_m: 1600, recover_seconds: 0 })).toBe('3 × 1.6 km');
    expect(formatIntervals({ rounds: 8, work_seconds: 60, recover_seconds: 90 })).toBe('8 × 60s/90s');
    expect(intervalWorkText({ work_seconds: 60 })).toBeNull();
  });
});

describe('the exercise editor', () => {
  it('builds a new plan exercise from a pick', () => {
    expect(newPlanExercise({ name: 'Goblet Squat', exerciseId: 'exr_1', targetMuscle: 'quads' })).toEqual({
      name: 'Goblet Squat',
      type: 'reps',
      sets: 3,
      reps: '10',
      exercise_id: 'exr_1',
      target_muscle: 'quads',
    });
    expect(newPlanExercise({ name: 'my thing' })).toEqual({ name: 'my thing', type: 'reps', sets: 3, reps: '10' });
  });

  it('names the targets a type change clears', () => {
    const lift = { name: 'Squat', type: 'reps' as const, sets: 3, reps: '8', target_weight: 60 };
    expect(targetsClearedBy(lift, 'cardio')).toEqual(['reps', 'weight']);
    expect(targetsClearedBy(lift, 'timed')).toEqual(['reps']);
    expect(targetsClearedBy({ ...lift, target_weight: 0 }, 'timed')).toEqual(['reps']);
    expect(targetsClearedBy({ name: 'Run', type: 'cardio', distance_km: 5 }, 'cardio')).toEqual([]);
  });
});
