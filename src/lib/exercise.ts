import type {
  CardioActivityKind,
  DashboardExercise,
  ExerciseType,
  HeartRateZone,
  WeightUnit,
} from '@/lib/api';

/**
 * Type-aware helpers for the typed `Exercise` contract.
 *
 * The backend stamps `type` on **every** exercise it returns (pre-migration rows get a
 * derived one), so screens can branch on it directly instead of guessing from
 * `duration_seconds` / free-text `reps`. The legacy heuristic survives here only as a
 * fallback for plans cached on-device before the typed-exercise rollout.
 *
 * Icons are named, not imported: the two frontends use different lucide packages, so each
 * maps `exerciseIconKey` to its own component set.
 */

const EXERCISE_TYPES: ExerciseType[] = ['reps', 'timed', 'cardio', 'class', 'mobility'];

/** The exercise's type, falling back to the pre-rollout duration heuristic. */
export function resolveExerciseType(ex: Partial<DashboardExercise>): ExerciseType {
  if (ex.type && EXERCISE_TYPES.includes(ex.type)) return ex.type;
  return (ex.duration_seconds ?? 0) > 0 ? 'timed' : 'reps';
}

/** Types driven by a countdown per set (a hold, not a rep count). */
export function usesCountdown(type: ExerciseType): boolean {
  return type === 'timed' || type === 'mobility';
}

/** Types the guided player tracks as sets of work. Cardio/class are single captures. */
export function usesSetTracking(type: ExerciseType): boolean {
  return type === 'reps' || type === 'timed' || type === 'mobility';
}

/**
 * Types that can carry a load. A timed movement is not only a hold — a farmer's carry
 * or a weighted plank is the load as much as the clock — so `timed` tracks weight even
 * though the countdown, not a rep count, drives the set. Mobility is deliberately left
 * out: a cool-down stretch is never loaded, and a dial on every one is clutter.
 */
export function usesWeight(type: ExerciseType): boolean {
  return type === 'reps' || type === 'timed';
}

/**
 * Whether an exercise can carry ExerciseDB enrichment (demo media, cues, alternatives).
 * Cardio and class entries are never catalog-matched, so callers must not render a media
 * placeholder or an "unlinked" warning for them.
 */
export function isCatalogExercise(type: ExerciseType): boolean {
  return usesSetTracking(type);
}

// ─── Heart-rate zones ─────────────────────────────────────────────────────────

/**
 * Zone → user-facing wording. The zone number is the contract with the backend; these
 * labels are FE-owned and must never be sent back to the API.
 */
export function hrZoneLabel(zone?: HeartRateZone): string | null {
  if (!zone) return null;
  if (zone <= 2) return 'easy';
  if (zone === 3) return 'moderate';
  return 'hard';
}

/** Conversational helper copy that makes a zone actionable without a heart-rate strap. */
export function hrZoneHelper(zone?: HeartRateZone): string | null {
  if (!zone) return null;
  if (zone <= 2) return 'you can hold a conversation';
  if (zone === 3) return 'talking takes effort';
  return 'short answers only';
}

/** Compact zone chip text, e.g. "Zone 2 · easy". */
export function hrZoneText(zone?: HeartRateZone): string | null {
  const label = hrZoneLabel(zone);
  return label ? `Zone ${zone} · ${label}` : null;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** "45s" · "3 min" · "1:30" — the shortest unambiguous form. */
export function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s % 60 === 0) return `${s / 60} min`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * A work/recover pair, e.g. "60s/90s". Deliberately not `formatSeconds` on each side:
 * that renders 60/90 as "1 min/1:30", where the two halves of one pair read in
 * different units.
 */
export function formatIntervalPair(workSeconds: number, recoverSeconds: number): string {
  const both = [workSeconds, recoverSeconds];
  const asSeconds = both.every((s) => s < 120);
  return both.map((s) => (asSeconds ? `${Math.round(s)}s` : formatSeconds(s))).join('/');
}

/**
 * "24 kg" · "22.5 kg" — the load suffix on a target line, or `null` when there is none.
 * Zero means bodyweight, which is the absence of a load rather than a load of nothing.
 */
export function weightText(weight?: number | null, unit?: WeightUnit | null): string | null {
  if (weight == null || weight <= 0) return null;
  return `${Number(weight.toFixed(2))} ${unit ?? 'kg'}`;
}

/** "5 km" · "5.4 km" — one decimal, trailing zero stripped. */
export function formatDistanceKm(km: number): string {
  const rounded = Math.round(km * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} km`;
}

const CARDIO_KIND_LABELS: Record<CardioActivityKind, string> = {
  run: 'Run',
  cycle: 'Ride',
  swim: 'Swim',
  row: 'Row',
  walk: 'Walk',
  hike: 'Hike',
  other: 'Cardio',
};

export function cardioKindLabel(kind?: CardioActivityKind): string {
  return CARDIO_KIND_LABELS[kind ?? 'other'];
}

/** Verb form for completion copy, e.g. "Log this run". */
export function cardioKindVerb(kind?: CardioActivityKind): string {
  return cardioKindLabel(kind).toLowerCase();
}

// ─── Rep targets ──────────────────────────────────────────────────────────────

/** Legacy fallback: pulls the first integer out of rep text like "8-10" or "to failure". */
export function parseRepTarget(reps?: string): number {
  if (!reps) return 10;
  const match = /\d+/.exec(reps);
  return match ? Number(match[0]) : 10;
}

/**
 * The starting rep count for a capture dial. Prefers the structured range (bottom of the
 * range — the honest default a beginner should beat, not aspire to), then the rep text.
 */
export function repTargetFor(ex: Partial<DashboardExercise>): number {
  if (typeof ex.reps_min === 'number' && ex.reps_min > 0) return ex.reps_min;
  if (typeof ex.reps_max === 'number' && ex.reps_max > 0) return ex.reps_max;
  return parseRepTarget(ex.reps);
}

/** Display text for a rep target: "8-10" from the structured range, else the raw text. */
export function repRangeText(ex: Partial<DashboardExercise>): string | undefined {
  const { reps_min: min, reps_max: max } = ex;
  if (typeof min === 'number' && typeof max === 'number' && min > 0 && max > 0) {
    return min === max ? String(min) : `${min}-${max}`;
  }
  if (typeof min === 'number' && min > 0) return String(min);
  return ex.reps;
}

// ─── Plan-row summaries ───────────────────────────────────────────────────────

/** Semantic icon key — each repo maps this to its own lucide component. */
export type ExerciseIconKey =
  | 'dumbbell'
  | 'timer'
  | 'stretch'
  | 'class'
  | CardioActivityKind;

export function exerciseIconKey(ex: DashboardExercise): ExerciseIconKey {
  const type = resolveExerciseType(ex);
  switch (type) {
    case 'cardio':
      return ex.activity_kind ?? 'other';
    case 'class':
      return 'class';
    case 'mobility':
      return 'stretch';
    case 'timed':
      return 'timer';
    default:
      return 'dumbbell';
  }
}

/** The at-a-glance target line on a plan-day row, e.g. "3 × 8-10" or "5 km · Zone 2". */
export function exerciseMeta(ex: DashboardExercise): string {
  const type = resolveExerciseType(ex);
  const sets = Math.max(1, ex.sets ?? 1);
  const perSide = ex.is_per_side ? ' each side' : '';

  switch (type) {
    case 'cardio': {
      if (ex.cardio_format === 'intervals' && ex.intervals) {
        const { rounds, work_seconds, recover_seconds } = ex.intervals;
        return `${rounds} × ${formatIntervalPair(work_seconds, recover_seconds)}`;
      }
      const parts: string[] = [];
      if (ex.distance_km) parts.push(formatDistanceKm(ex.distance_km));
      if (ex.target_duration_minutes) parts.push(`${ex.target_duration_minutes} min`);
      if (ex.target_hr_zone) parts.push(`Zone ${ex.target_hr_zone}`);
      return parts.length > 0 ? parts.join(' · ') : cardioKindLabel(ex.activity_kind);
    }

    case 'class':
      return ex.target_duration_minutes ? `${ex.target_duration_minutes} min class` : 'Class';

    // A plan can specify a hold with no duration ("3 × Forearm Plank"). Say "hold"
    // rather than inventing a number the plan never committed to.
    case 'mobility': {
      const hold = ex.duration_seconds ? `${formatSeconds(ex.duration_seconds)} hold` : 'hold';
      return `${sets > 1 ? `${sets} × ` : ''}${hold}${perSide}`;
    }

    case 'timed': {
      const hold = ex.duration_seconds ? formatSeconds(ex.duration_seconds) : 'hold';
      const load = weightText(ex.target_weight, ex.weight_unit);
      return `${sets > 1 ? `${sets} × ` : ''}${hold}${perSide}${load ? ` · ${load}` : ''}`;
    }

    default:
      return `${sets} × ${repRangeText(ex) ?? '—'}${perSide}`;
  }
}

// ─── Swapping ─────────────────────────────────────────────────────────────────

/**
 * What the "Find an alternative" dialog hands back: a catalog exercise, or a name the
 * user typed that the catalog doesn't have (no `exerciseId`).
 */
export interface ExercisePick {
  name: string;
  exerciseId?: string;
  targetMuscle?: string;
  bodyPart?: string;
}

/**
 * A plan exercise with `pick` swapped in. Linking an unlinked exercise is not a swap, so
 * `swapped_from` is only stamped when a catalog-linked exercise is replaced by another.
 * Cues and the last-performance cache describe the old movement and are dropped.
 */
export function swapPlanExercise(ex: DashboardExercise, pick: ExercisePick): DashboardExercise {
  const swapped = Boolean(ex.exercise_id) && ex.exercise_id !== pick.exerciseId;
  return {
    ...ex,
    name: pick.name,
    exercise_id: pick.exerciseId,
    target_muscle: pick.targetMuscle,
    body_part: pick.bodyPart,
    swapped_from: swapped ? ex.name : ex.swapped_from,
    cues: swapped ? undefined : ex.cues,
    last_performance: undefined,
  };
}

/**
 * Whether a plan exercise is a timed / hold movement (uses a countdown) rather than
 * a reps-and-weight movement.
 *
 * @deprecated Prefer `resolveExerciseType(ex)` + `usesCountdown(type)` — this cannot
 * distinguish mobility from timed, and reports cardio/class as reps. Kept only for
 * call sites that have not been migrated.
 */
export function isTimedExercise(
  ex: Pick<DashboardExercise, 'duration_seconds' | 'reps'>,
): boolean {
  return (ex.duration_seconds ?? 0) > 0;
}
