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

  it('starts a new exercise as the kind Add chose', () => {
    expect(newPlanExercise({ name: 'Plank', exerciseId: 'exr_2', type: 'timed' })).toEqual({
      name: 'Plank',
      type: 'timed',
      sets: 3,
      duration_seconds: 30,
      exercise_id: 'exr_2',
    });
    expect(newPlanExercise({ name: 'Hip opener', type: 'mobility' })).toEqual({
      name: 'Hip opener',
      type: 'mobility',
      sets: 1,
      duration_seconds: 30,
    });
    // Cardio and class never keep a catalog link.
    expect(newPlanExercise({ name: 'Run', exerciseId: 'exr_3', type: 'cardio', activityKind: 'run' })).toEqual({
      name: 'Run',
      type: 'cardio',
      sets: 1,
      activity_kind: 'run',
      cardio_format: 'steady',
      target_duration_minutes: 30,
      target_hr_zone: 2,
    });
    expect(newPlanExercise({ name: 'Spin', type: 'class' })).toEqual({
      name: 'Spin',
      type: 'class',
      sets: 1,
      class_name: 'Spin',
      target_duration_minutes: 45,
    });
  });

  it('names the targets a type change clears', () => {
    const lift = { name: 'Squat', type: 'reps' as const, sets: 3, reps: '8', target_weight: 60 };
    expect(targetsClearedBy(lift, 'cardio')).toEqual(['reps', 'weight']);
    expect(targetsClearedBy(lift, 'timed')).toEqual(['reps']);
    expect(targetsClearedBy({ ...lift, target_weight: 0 }, 'timed')).toEqual(['reps']);
    expect(targetsClearedBy({ name: 'Run', type: 'cardio', distance_km: 5 }, 'cardio')).toEqual([]);
  });
});
