/**
 * Editing a logged workout after the fact (`PUT /workouts/sessions/{id}/exercise`): which
 * fields a set shows, how the editor's draft is seeded, and the request it turns into.
 * Free of React so the rules sit in one place. Mobile twin: `lib/workout-edit.ts` — keep them identical.
 */

import type { ExerciseType, LoggedSet, SessionExercise, WeightUnit, WorkoutSetLogEntry } from '@/lib/api';
import { usesWeight } from '@/lib/exercise';

/** One set as the editor holds it. */
export interface EditSet {
  reps: number;
  weight: number;
  durationSeconds: number;
  completed: boolean;
}

/** What a set of this type is measured in: reps (+ load), or a clock (+ load for a carry). */
export function setFields(type: ExerciseType): { reps: boolean; weight: boolean; duration: boolean } {
  return { reps: type === 'reps', weight: usesWeight(type), duration: type !== 'reps' };
}

/** Cardio and a class are one entry, not sets. */
export function isSingleEntry(type: ExerciseType): boolean {
  return type === 'cardio' || type === 'class';
}

/**
 * The editor's starting sets: the logged rows as they are; otherwise the plan's
 * prescription, ticked — opening an exercise that wasn't logged is how the user logs it.
 */
export function seedEditSets(exercise: SessionExercise): EditSet[] {
  if (exercise.sets.length > 0) {
    return exercise.sets.map((s) => ({
      reps: s.reps ?? 0,
      weight: s.weight ?? 0,
      durationSeconds: s.duration_seconds ?? 0,
      completed: s.completed,
    }));
  }
  const target = exercise.target;
  const count = isSingleEntry(exercise.type) ? 1 : Math.max(1, target?.sets ?? 1);
  return Array.from({ length: count }, () => ({
    reps: target?.reps ?? 0,
    weight: target?.weight ?? 0,
    durationSeconds: target?.duration_seconds ?? 0,
    completed: true,
  }));
}

/** The unit a set's weight is entered in: the logged one, the plan's, else the user's. */
export function editWeightUnit(exercise: SessionExercise, preferred: WeightUnit): WeightUnit {
  return exercise.sets.find((s) => s.weight_unit)?.weight_unit ?? exercise.target?.weight_unit ?? preferred;
}

/** The request body's sets. Only the fields the type uses; a 0 load sends no weight at all. */
export function toLoggedSets(sets: EditSet[], type: ExerciseType, unit: WeightUnit): LoggedSet[] {
  const fields = setFields(type);
  return sets.map((s, i) => {
    const weight = fields.weight && s.weight > 0 ? s.weight : null;
    return {
      set_number: i + 1,
      reps: fields.reps ? Math.round(s.reps) : null,
      weight,
      weight_unit: weight != null ? unit : null,
      duration_seconds: fields.duration && s.durationSeconds > 0 ? Math.round(s.durationSeconds) : null,
      completed: s.completed,
    };
  });
}

/** True when the draft would write exactly what is already logged. */
export function sameAsLogged(exercise: SessionExercise, sets: LoggedSet[]): boolean {
  if (exercise.status !== 'logged' || exercise.sets.length !== sets.length) return false;
  return exercise.sets.every((row, i) => {
    const next = sets[i];
    return (
      row.completed === next.completed &&
      (row.reps ?? null) === (next.reps ?? null) &&
      (row.weight ?? null) === (next.weight ?? null) &&
      (row.duration_seconds ?? null) === (next.duration_seconds ?? null)
    );
  });
}

/**
 * The exercise list from a backend that predates `exercises`: the sets grouped by
 * exercise, keyed as the server keys them. Logged only — nothing to add.
 */
export function exercisesFromSets(sets: WorkoutSetLogEntry[]): SessionExercise[] {
  const list: SessionExercise[] = [];
  for (const set of sets) {
    const key = `${set.section}|${set.exercise_id ?? set.name.trim().toLowerCase()}`;
    let item = list.find((e) => e.key === key);
    if (!item) {
      item = {
        key,
        section: set.section,
        exercise_id: set.exercise_id,
        name: set.name,
        type: (set.duration_seconds ?? 0) > 0 ? 'timed' : 'reps',
        swapped_from: set.swapped_from,
        skipped: true,
        status: 'logged',
        done_by: null,
        earns_xp: true,
        sets: [],
        target: null,
      };
      list.push(item);
    }
    item.sets.push(set);
    item.skipped = item.skipped && set.skipped;
  }
  return list;
}
