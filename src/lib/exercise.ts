import type { DashboardExercise } from '@/lib/api';

/**
 * Whether a plan exercise is a timed / hold movement (uses a countdown) rather than
 * a reps-and-weight movement.
 *
 * The plan is AI-generated: `duration_seconds` is documented as "for timed/hold
 * exercises", while `reps` is free text. The model frequently emits BOTH on a
 * stretch/hold (a duration plus reps text like "hold" or "30 sec each side"), so a
 * positive `duration_seconds` is the authoritative signal — not the absence of reps.
 */
export function isTimedExercise(
  ex: Pick<DashboardExercise, 'duration_seconds' | 'reps'>,
): boolean {
  return (ex.duration_seconds ?? 0) > 0;
}
