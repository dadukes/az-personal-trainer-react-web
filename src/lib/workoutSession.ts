import {
  type DashboardDayPlan,
  type DashboardExercise,
  type WeightUnit,
  type WorkoutSection,
} from '@/lib/api';
import { isTimedExercise } from '@/lib/exercise';

/** Mutable per-set capture, persisted across a backgrounded session. */
export interface SetActual {
  reps: number;
  weight: number;
  completed: boolean;
}

/** A single exercise in the session, shared by the list view and the guided player. */
export interface Block {
  key: string;
  name: string;
  exercise_id?: string;
  section: WorkoutSection;
  timed: boolean;
  durationSeconds?: number;
  restSeconds: number;
  repText?: string;
  repTarget: number;
  weight: number;
  weightUnit: WeightUnit;
  notes?: string;
  cues?: string[];
  targetMuscle?: string;
  bodyPart?: string;
  sets: SetActual[];
}

/** Pulls the first integer out of a rep target like "8-10" or "to failure". */
export function parseRepTarget(reps?: string): number {
  if (!reps) return 10;
  const m = /\d+/.exec(reps);
  return m ? Number(m[0]) : 10;
}

export function buildBlocks(dayPlan: DashboardDayPlan, unit: WeightUnit): Block[] {
  const sections: [WorkoutSection, DashboardExercise[] | undefined][] = [
    ['warmup', dayPlan.warmup],
    ['main', dayPlan.exercises],
    ['cooldown', dayPlan.cooldown],
  ];
  const blocks: Block[] = [];
  sections.forEach(([section, list]) => {
    (list ?? []).forEach((ex, i) => {
      const setCount = Math.max(1, ex.sets ?? 1);
      // The backend fills `reps` with a descriptive string even for holds/carries
      // (e.g. "30s hold", "45s walk", "3 minutes"), so `duration_seconds` is the
      // reliable timed signal — pure rep-based exercises have no duration.
      const timed = isTimedExercise(ex);
      const repTarget = parseRepTarget(ex.reps);
      const weight = ex.target_weight ?? ex.last_performance?.weight ?? 0;
      blocks.push({
        key: `${section}-${i}-${ex.name}`,
        name: ex.name,
        exercise_id: ex.exercise_id,
        section,
        timed,
        durationSeconds: ex.duration_seconds,
        restSeconds: ex.rest_seconds ?? 0,
        repText: ex.reps,
        repTarget,
        weight,
        weightUnit: (ex.weight_unit as WeightUnit) ?? unit,
        notes: ex.notes,
        cues: ex.cues,
        targetMuscle: ex.target_muscle,
        bodyPart: ex.body_part,
        sets: Array.from({ length: setCount }, () => ({
          reps: repTarget,
          weight,
          completed: false,
        })),
      });
    });
  });
  return blocks;
}

/** Structural fingerprint used to decide whether a persisted session still matches the plan. */
export function signatureOf(blocks: Block[]): string {
  return blocks.map((b) => `${b.key}:${b.sets.length}`).join('|');
}

export function sectionLabel(section: WorkoutSection): string {
  return section === 'warmup' ? 'Warm-up' : section === 'cooldown' ? 'Cool-down' : 'Main';
}

export function formatClock(total: number): string {
  const t = Math.max(0, Math.floor(total));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
