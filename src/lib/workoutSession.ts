import {
  type CardioActivityKind,
  type CardioFormat,
  type DashboardDayPlan,
  type DashboardExercise,
  type ExerciseIntervals,
  type ExerciseType,
  type HeartRateZone,
  type LoggedExercise,
  type WeightUnit,
  type WorkoutSection,
} from '@/lib/api';
import {
  cardioKindLabel,
  type ExercisePick,
  formatDistanceKm,
  formatIntervalPair,
  formatSeconds,
  repRangeText,
  repTargetFor,
  resolveExerciseType,
  usesCountdown,
  usesWeight,
  weightText,
} from '@/lib/exercise';

/** Mutable per-set capture, persisted across a backgrounded session. */
export interface SetActual {
  reps: number;
  weight: number;
  /**
   * The user set this set's weight themselves (rather than it following an earlier set).
   * A weight change carries forward to later sets only up to the first one that has this.
   */
  weightEdited?: boolean;
  completed: boolean;
  /**
   * Captured seconds. Holds use the planned duration; cardio/class capture what the user
   * actually did, so the value can differ from the block's target.
   */
  durationSeconds?: number;
  /** Captured distance — steady cardio only, on the single set. */
  distanceKm?: number;
}

/** A single exercise in the session, shared by the list view and the guided player. */
export interface Block {
  key: string;
  name: string;
  exercise_id?: string;
  section: WorkoutSection;
  type: ExerciseType;
  restSeconds: number;
  /** Per-set countdown seconds: the hold length, or an interval's work phase. */
  durationSeconds?: number;
  repText?: string;
  repTarget: number;
  weight: number;
  weightUnit: WeightUnit;
  isPerSide: boolean;
  notes?: string;
  cues?: string[];
  targetMuscle?: string;
  bodyPart?: string;
  /** Set when the user swapped the planned exercise mid-session; the plan's name. */
  swappedFrom?: string;
  // ── cardio ──
  activityKind?: CardioActivityKind;
  cardioFormat?: CardioFormat;
  targetDistanceKm?: number;
  targetDurationMinutes?: number;
  hrZone?: HeartRateZone;
  intervals?: ExerciseIntervals;
  // ── class ──
  className?: string;
  sets: SetActual[];
}

/** True when the block is driven by a countdown per set rather than rep dials. */
export function isCountdownBlock(block: Block): boolean {
  return usesCountdown(block.type);
}

/** True when the block is an auto-advancing work/recover round loop. */
export function isIntervalBlock(block: Block): boolean {
  return block.type === 'cardio' && block.cardioFormat === 'intervals' && !!block.intervals;
}

/** True when the block is a single "did it" capture rather than a set tracker. */
export function isSingleCaptureBlock(block: Block): boolean {
  return block.type === 'class' || (block.type === 'cardio' && !isIntervalBlock(block));
}

/**
 * Wall-clock length of a whole interval block (every work + recovery phase).
 *
 * Used when the user abandons the live player for plain logging: the capture card must
 * prefill the length of the *session*, not of a single work interval.
 */
export function intervalTotalSeconds(block: Block): number {
  if (!block.intervals) return 0;
  const { rounds, work_seconds, recover_seconds } = block.intervals;
  return Math.max(0, rounds) * (work_seconds + recover_seconds);
}

export { parseRepTarget } from '@/lib/exercise';

/** The identity a mid-session swap changes — persisted so a reload keeps the swap. */
export interface BlockSwap {
  name: string;
  exercise_id?: string;
  swappedFrom?: string;
  targetMuscle?: string;
  bodyPart?: string;
}

/**
 * Swaps the exercise a block performs, for this session only (the plan is untouched).
 *
 * The block's `key` deliberately stays the plan's, so the persisted-session signature
 * still matches and completed sets stay where they are. Sets not yet done lose their
 * weight — a different movement rarely shares a load, and a stale 60 kg pre-filled on a
 * dumbbell swap is worse than an empty dial (the caller may pre-fill last performance).
 */
export function swapBlock(block: Block, pick: ExercisePick): { block: Block; swap: BlockSwap } {
  const planned = block.swappedFrom ?? block.name;
  const swap: BlockSwap = {
    name: pick.name,
    exercise_id: pick.exerciseId,
    // Swapping back to what the plan said is not a swap any more.
    swappedFrom: pick.name.trim().toLowerCase() === planned.trim().toLowerCase() ? undefined : planned,
    targetMuscle: pick.targetMuscle,
    bodyPart: pick.bodyPart,
  };
  return {
    swap,
    block: {
      ...applyBlockSwap(block, swap),
      sets: block.sets.map((s) => (s.completed ? s : { ...s, weight: 0, weightEdited: false })),
    },
  };
}

/** Re-applies a persisted swap onto a freshly built block (identity only, not sets). */
export function applyBlockSwap(block: Block, swap: BlockSwap): Block {
  return {
    ...block,
    name: swap.name,
    exercise_id: swap.exercise_id,
    swappedFrom: swap.swappedFrom,
    targetMuscle: swap.targetMuscle,
    bodyPart: swap.bodyPart,
    // Cues are the plan's cues for the old movement; the demo loads the new one's.
    cues: undefined,
  };
}

/** The at-a-glance target for a block — the session-side twin of `exerciseMeta`. */
export function blockTargetText(block: Block): string {
  if (isIntervalBlock(block) && block.intervals) {
    const { rounds, work_seconds, recover_seconds } = block.intervals;
    return `${rounds} × ${formatIntervalPair(work_seconds, recover_seconds)}`;
  }
  if (block.type === 'cardio') {
    const parts: string[] = [];
    if (block.targetDistanceKm) parts.push(formatDistanceKm(block.targetDistanceKm));
    if (block.targetDurationMinutes) parts.push(`${block.targetDurationMinutes} min`);
    if (block.hrZone) parts.push(`Zone ${block.hrZone}`);
    return parts.length > 0 ? parts.join(' · ') : cardioKindLabel(block.activityKind);
  }
  if (block.type === 'class') {
    return block.targetDurationMinutes ? `${block.targetDurationMinutes} min class` : 'Class';
  }
  if (usesCountdown(block.type)) {
    // A hold with no stated duration says "hold", not an invented number.
    const hold = block.durationSeconds
      ? `${formatSeconds(block.durationSeconds)}${block.type === 'mobility' ? ' hold' : ''}`
      : 'hold';
    const sets = block.sets.length > 1 ? `${block.sets.length} × ` : '';
    // "each side" qualifies the hold, so it stays glued to it and the load trails —
    // "45s each side · 24 kg", never "45s · 24 kg · each side". Callers must not append
    // their own per-side suffix to a countdown block.
    const perSide = block.isPerSide ? ' each side' : '';
    const load = usesWeight(block.type) ? weightText(block.weight, block.weightUnit) : null;
    return `${sets}${hold}${perSide}${load ? ` · ${load}` : ''}`;
  }
  const sets = block.sets.length > 1 ? `${block.sets.length} × ` : '';
  return `${sets}${block.repText ?? 'reps'}`;
}

function buildBlock(
  ex: DashboardExercise,
  section: WorkoutSection,
  index: number,
  unit: WeightUnit,
): Block {
  const type = resolveExerciseType(ex);
  const repTarget = repTargetFor(ex);
  const weight = usesWeight(type) ? (ex.target_weight ?? ex.last_performance?.weight ?? 0) : 0;

  const base = {
    key: `${section}-${index}-${ex.name}`,
    name: ex.name,
    // Cardio and class are never catalog-matched, so they carry no demo media.
    exercise_id: type === 'cardio' || type === 'class' ? undefined : ex.exercise_id,
    section,
    type,
    repText: repRangeText(ex),
    repTarget,
    weight,
    weightUnit: (ex.weight_unit as WeightUnit) ?? unit,
    isPerSide: ex.is_per_side === true,
    notes: ex.notes,
    cues: ex.cues,
    targetMuscle: ex.target_muscle,
    bodyPart: ex.body_part,
  };

  if (type === 'cardio') {
    const cardioFormat: CardioFormat = ex.cardio_format === 'intervals' ? 'intervals' : 'steady';
    const cardio = {
      ...base,
      activityKind: ex.activity_kind,
      cardioFormat,
      targetDistanceKm: ex.distance_km,
      targetDurationMinutes: ex.target_duration_minutes,
      hrZone: ex.target_hr_zone,
      intervals: ex.intervals,
    };

    // Intervals map 1:1 onto the existing set/rest loop: one "set" per work round, with
    // the recovery as the rest between rounds. Bailing at round 6 of 8 is then captured
    // as incomplete sets with no special handling anywhere downstream.
    if (cardioFormat === 'intervals' && ex.intervals) {
      const rounds = Math.max(1, ex.intervals.rounds);
      return {
        ...cardio,
        durationSeconds: ex.intervals.work_seconds,
        restSeconds: ex.intervals.recover_seconds,
        sets: Array.from({ length: rounds }, () => ({
          reps: 0,
          weight: 0,
          completed: false,
          durationSeconds: ex.intervals?.work_seconds,
        })),
      };
    }

    // Steady cardio is a single capture prefilled with the targets.
    return {
      ...cardio,
      durationSeconds: ex.target_duration_minutes ? ex.target_duration_minutes * 60 : undefined,
      restSeconds: 0,
      sets: [
        {
          reps: 0,
          weight: 0,
          completed: false,
          durationSeconds: ex.target_duration_minutes ? ex.target_duration_minutes * 60 : undefined,
          distanceKm: ex.distance_km,
        },
      ],
    };
  }

  if (type === 'class') {
    const seconds = ex.target_duration_minutes ? ex.target_duration_minutes * 60 : undefined;
    return {
      ...base,
      className: ex.class_name ?? ex.name,
      targetDurationMinutes: ex.target_duration_minutes,
      durationSeconds: seconds,
      restSeconds: 0,
      sets: [{ reps: 0, weight: 0, completed: false, durationSeconds: seconds }],
    };
  }

  // reps / timed / mobility — the existing set tracker.
  const setCount = Math.max(1, ex.sets ?? 1);
  return {
    ...base,
    durationSeconds: ex.duration_seconds,
    restSeconds: ex.rest_seconds ?? 0,
    sets: Array.from({ length: setCount }, () => ({
      reps: repTarget,
      weight,
      completed: false,
      durationSeconds: usesCountdown(type) ? ex.duration_seconds : undefined,
    })),
  };
}

export function buildBlocks(dayPlan: DashboardDayPlan, unit: WeightUnit): Block[] {
  const sections: [WorkoutSection, DashboardExercise[] | undefined][] = [
    ['warmup', dayPlan.warmup],
    ['main', dayPlan.exercises],
    ['cooldown', dayPlan.cooldown],
  ];
  const blocks: Block[] = [];
  sections.forEach(([section, list]) => {
    (list ?? []).forEach((ex, i) => blocks.push(buildBlock(ex, section, i, unit)));
  });
  return blocks;
}

/**
 * Serializes the session for `POST /workouts/log`. `type` is sent per exercise so the
 * server can pick the right effort-XP tier (it can only derive timed-vs-reps on its own),
 * and steady cardio reports the distance the user captured.
 *
 * A timed hold sends **both** its duration and its load when one was captured — the set
 * log carries the two columns independently, and a farmer's carry is only half logged
 * without the weight. Reps keep their existing contract (0 is sent, meaning bodyweight);
 * a hold sends no weight at all rather than a zero, so an unweighted plank logs exactly
 * as it always has.
 */
export function toLoggedExercises(blocks: Block[]): LoggedExercise[] {
  return blocks.map((b) => {
    const countdown = isCountdownBlock(b);
    const cardioOrClass = b.type === 'cardio' || b.type === 'class';
    const weighted = usesWeight(b.type);
    const distanceKm = b.type === 'cardio' ? b.sets[0]?.distanceKm : undefined;
    const loadOf = (s: SetActual): number | null => {
      if (!weighted) return null;
      return countdown && s.weight <= 0 ? null : s.weight;
    };

    return {
      exercise_id: b.exercise_id,
      name: b.name,
      section: b.section,
      type: b.type,
      ...(distanceKm && distanceKm > 0 ? { distance_km: distanceKm } : {}),
      ...(b.swappedFrom ? { swapped_from: b.swappedFrom } : {}),
      skipped: !b.sets.some((s) => s.completed),
      sets: b.sets.map((s, i) => ({
        set_number: i + 1,
        reps: countdown || cardioOrClass ? null : s.reps,
        weight: loadOf(s),
        weight_unit: loadOf(s) == null ? null : b.weightUnit,
        duration_seconds:
          countdown || cardioOrClass ? (s.durationSeconds ?? b.durationSeconds ?? null) : null,
        completed: s.completed,
      })),
    };
  });
}

/** Structural fingerprint used to decide whether a persisted session still matches the plan. */
export function signatureOf(blocks: Block[]): string {
  return blocks.map((b) => `${b.key}:${b.type}:${b.sets.length}`).join('|');
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
