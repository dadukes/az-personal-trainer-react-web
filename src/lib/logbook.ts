import type { DashboardDayPlan, DashboardExercise, LastSession, LastSessionSet, LoggedExercise, WeightUnit, WorkoutSection } from '@/lib/api';
import {
  type ExercisePick,
  formatDistanceKm,
  formatSeconds,
  swapPlanExercise,
  usesWeight,
  weightText,
} from '@/lib/exercise';
import {
  type Block,
  isCountdownBlock,
  isIntervalBlock,
  swapBlock,
  toLoggedExercises,
  type SetActual,
} from '@/lib/workoutSession';
import type { WorkoutDraft } from '@/lib/workoutDraft';

/**
 * The logbook's workout logic: changes to a workout, and what the screen reads from one. Pure,
 * tested with Vitest. Mirrors the mobile app's reducer actions and `lib/logbook.ts`, which have
 * the same names and test cases.
 */

// ─── Changes ─────────────────────────────────────────────────────────────────

function mapBlock(blocks: Block[], blockIndex: number, change: (block: Block) => Block): Block[] {
  return blocks.map((block, bi) => (bi === blockIndex ? change(block) : block));
}

/** Ticking something on a skipped exercise means it wasn't skipped after all. */
function unskipped(block: Block, done: boolean): Block {
  return done && block.skipped ? { ...block, skipped: false } : block;
}

export function tickSet(blocks: Block[], blockIndex: number, setIndex: number, done: boolean): Block[] {
  return mapBlock(blocks, blockIndex, (block) => ({
    ...unskipped(block, done),
    sets: block.sets.map((s, si) => (si === setIndex ? { ...s, completed: done } : s)),
  }));
}

export function tickExercise(blocks: Block[], blockIndex: number, done: boolean): Block[] {
  return mapBlock(blocks, blockIndex, (block) => ({
    ...unskipped(block, done),
    sets: block.sets.map((s) => ({ ...s, completed: done })),
  }));
}

/** A skipped exercise stays skipped: ticking "everything" means everything you're doing. */
export function tickSection(blocks: Block[], section: WorkoutSection, done: boolean): Block[] {
  return blocks.map((block) =>
    block.section === section && !block.skipped
      ? { ...block, sets: block.sets.map((s) => ({ ...s, completed: done })) }
      : block,
  );
}

export function tickAll(blocks: Block[], done: boolean): Block[] {
  return blocks.map((block) =>
    block.skipped ? block : { ...block, sets: block.sets.map((s) => ({ ...s, completed: done })) },
  );
}

/** An interval's sets are its rounds, so entering "6" ticks the first six. */
export function setRounds(blocks: Block[], blockIndex: number, rounds: number): Block[] {
  return mapBlock(blocks, blockIndex, (block) => ({
    ...unskipped(block, rounds > 0),
    sets: block.sets.map((s, si) => ({ ...s, completed: si < rounds })),
  }));
}

export function addSet(blocks: Block[], blockIndex: number): Block[] {
  return mapBlock(blocks, blockIndex, (block) => {
    const last = block.sets[block.sets.length - 1];
    const added: SetActual = last
      ? { ...last, completed: false, weightEdited: false }
      : { reps: block.repTarget, weight: block.weight, completed: false };
    return { ...block, sets: [...block.sets, added] };
  });
}

export function removeSet(blocks: Block[], blockIndex: number): Block[] {
  return mapBlock(blocks, blockIndex, (block) =>
    block.sets.length <= 1 ? block : { ...block, sets: block.sets.slice(0, -1) },
  );
}

/**
 * An exercise added during a workout: three sets of ten, ready to change, before any cool-down.
 * There's no plan to read a weight from, so it starts blank until its history comes in.
 */
export function addExercise(blocks: Block[], pick: ExercisePick, weightUnit: WeightUnit): Block[] {
  const taken = new Set(blocks.map((b) => b.key));
  let n = blocks.length;
  while (taken.has(`added-${n}-${pick.name}`)) n += 1;
  const block: Block = {
    key: `added-${n}-${pick.name}`,
    name: pick.name,
    exercise_id: pick.exerciseId,
    section: 'main',
    type: 'reps',
    restSeconds: 60,
    repTarget: 10,
    weight: 0,
    weightUnit,
    isPerSide: false,
    targetMuscle: pick.targetMuscle,
    bodyPart: pick.bodyPart,
    addedToday: true,
    sets: Array.from({ length: 3 }, () => ({ reps: 10, weight: 0, completed: false })),
  };
  const firstCooldown = blocks.findIndex((b) => b.section === 'cooldown');
  const at = firstCooldown === -1 ? blocks.length : firstCooldown;
  return [...blocks.slice(0, at), block, ...blocks.slice(at)];
}

export function removeExercise(blocks: Block[], blockIndex: number): Block[] {
  return blocks.filter((_, bi) => bi !== blockIndex);
}

/** Skipping clears its ticks, so it can't log as both done and skipped. */
export function skipExercise(blocks: Block[], blockIndex: number, skipped: boolean): Block[] {
  return mapBlock(blocks, blockIndex, (block) => ({
    ...block,
    skipped,
    sets: skipped ? block.sets.map((s) => ({ ...s, completed: false })) : block.sets,
  }));
}

export interface SetValues {
  reps?: number;
  weight?: number;
  durationSeconds?: number;
  distanceKm?: number;
}

/**
 * Saves numbers for a set. `applyToLater` is "Use this for the next sets": it also changes
 * unticked sets below. Sets above, and sets already done, keep what actually happened.
 */
export function setSetValues(
  blocks: Block[],
  blockIndex: number,
  setIndex: number,
  values: SetValues,
  applyToLater: boolean,
): Block[] {
  const { reps, weight, durationSeconds, distanceKm } = values;
  return mapBlock(blocks, blockIndex, (block) => ({
    ...block,
    sets: block.sets.map((s, si) => {
      if (si !== setIndex && !(applyToLater && si > setIndex && !s.completed)) return s;
      return {
        ...s,
        ...(reps !== undefined ? { reps: Math.max(0, Math.round(reps)) } : {}),
        ...(weight !== undefined ? { weight: Math.max(0, weight), weightEdited: true } : {}),
        ...(durationSeconds !== undefined ? { durationSeconds: Math.max(0, Math.round(durationSeconds)) } : {}),
        ...(distanceKm !== undefined ? { distanceKm: Math.max(0, distanceKm) } : {}),
      };
    }),
  }));
}

/**
 * A typed weight, which carries down to later sets as it always has. It stops at the first set
 * already done or given its own weight, so a pyramid or a drop set survives.
 */
export function carryWeight(blocks: Block[], blockIndex: number, setIndex: number, weight: number): Block[] {
  return mapBlock(blocks, blockIndex, (block) => {
    if (!block.sets[setIndex]) return block;
    const sets = block.sets.slice();
    sets[setIndex] = { ...sets[setIndex], weight: Math.max(0, weight), weightEdited: true };
    for (let j = setIndex + 1; j < sets.length; j += 1) {
      if (sets[j].completed || sets[j].weightEdited) break;
      sets[j] = { ...sets[j], weight: Math.max(0, weight) };
    }
    return { ...block, sets };
  });
}

/** A swap for this workout. Swapping back brings the plan's cues back too. */
export function swapExercise(blocks: Block[], blockIndex: number, pick: ExercisePick): Block[] {
  return mapBlock(blocks, blockIndex, (block) => {
    const { block: swapped } = swapBlock(block, pick);
    return {
      ...swapped,
      cues: swapped.swappedFrom ? undefined : block.plannedCues,
      // That history was the old movement's. The screen looks up the new one's.
      lastSets: undefined,
    };
  });
}

/** The heavier of what's planned and what was last lifted, ignoring history in another unit. */
function carriedWeight(planned: number, last: LastSession['sets'][number] | undefined, unit: WeightUnit): number {
  const lastWeight = last?.weight && last.weight > 0 && (last.weight_unit ?? unit) === unit ? last.weight : 0;
  return Math.max(planned > 0 ? planned : 0, lastWeight);
}

/**
 * Brings in what each exercise did last time, for the "Last time" line, and carries its load
 * forward. A number the person already entered wins.
 */
export function seedLastSessions(blocks: Block[], lastByKey: Record<string, LastSession>): Block[] {
  return blocks.map((block) => {
    const last = lastByKey[block.key];
    if (!last) return block;
    const weight = usesWeight(block.type)
      ? carriedWeight(block.weight, last.sets[last.sets.length - 1], block.weightUnit)
      : block.weight;
    return {
      ...block,
      lastSets: last.sets,
      weight,
      sets:
        weight === block.weight
          ? block.sets
          : block.sets.map((s) => (s.completed || s.weightEdited ? s : { ...s, weight })),
    };
  });
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export interface Tally {
  done: number;
  total: number;
}

/** Sets ticked and sets to do. A skipped exercise isn't something left to do. */
export function workoutTally(blocks: Block[]): Tally {
  return blocks.reduce<Tally>(
    (acc, block) =>
      block.skipped
        ? acc
        : { done: acc.done + block.sets.filter((s) => s.completed).length, total: acc.total + block.sets.length },
    { done: 0, total: 0 },
  );
}

function hasOpenSet(block: Block): boolean {
  return !block.skipped && block.sets.some((s) => !s.completed);
}

/**
 * The exercise to open when the page first shows. The warm-up starts folded, so it's the first
 * unfinished exercise after that, or the warm-up itself if there's nothing else.
 */
export function firstOpenIndex(blocks: Block[]): number | null {
  const main = blocks.findIndex((b) => b.section !== 'warmup' && hasOpenSet(b));
  if (main !== -1) return main;
  const any = blocks.findIndex(hasOpenSet);
  return any === -1 ? null : any;
}

/**
 * The exercise to open once this one is done: the next unfinished one below it, then anything
 * unfinished above, because exercises can be done in any order. The warm-up isn't reopened,
 * since it stays folded until asked for.
 */
export function nextOpenIndex(blocks: Block[], fromIndex: number): number | null {
  for (let step = 1; step < blocks.length; step += 1) {
    const bi = (fromIndex + step) % blocks.length;
    if (blocks[bi].section !== 'warmup' && hasOpenSet(blocks[bi])) return bi;
  }
  return null;
}

/** Whether every exercise in a section is done. Skipped ones don't hold it open. */
export function sectionDone(blocks: Block[], section: WorkoutSection): boolean {
  const doing = blocks.filter((b) => b.section === section && !b.skipped);
  return doing.length > 0 && doing.every((b) => !hasOpenSet(b));
}

/** The folded section's line: what's in it until something's done, then how far along it is. */
export function sectionFoldNote(blocks: Block[], section: WorkoutSection, names: (name: string) => string): string {
  const list = blocks.filter((b) => b.section === section);
  const finished = list.filter((b) => !hasOpenSet(b) && !b.skipped).length;
  if (finished === list.length && list.length > 0) return `${list.length} done`;
  return finished > 0 ? `${finished} of ${list.length} done` : list.map((b) => names(b.name)).join(', ');
}

/** What's still unticked, for the Finish sheet. */
export function unfinishedExercises(blocks: Block[]): { name: string; left: number }[] {
  return blocks.flatMap((block) => {
    const left = block.sets.filter((s) => !s.completed).length;
    return !block.skipped && left > 0 ? [{ name: block.name, left }] : [];
  });
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** The plan's target, before anything is done: "3 × 8-10 · 22.5 kg". */
export function exerciseTarget(block: Block): string {
  const { sets } = block;
  const times = sets.length > 1 ? `${sets.length} × ` : '';
  if (isIntervalBlock(block) && block.intervals) return plural(block.intervals.rounds, 'round');
  if (block.type === 'cardio' || block.type === 'class') {
    const parts = [
      block.targetDurationMinutes ? `${block.targetDurationMinutes} min` : null,
      block.targetDistanceKm ? formatDistanceKm(block.targetDistanceKm) : null,
    ].filter((part): part is string => part != null);
    return parts.length > 0 ? parts.join(' · ') : block.type === 'class' ? 'Class' : 'Cardio';
  }
  const load = usesWeight(block.type) ? weightText(sets[0]?.weight, block.weightUnit) : null;
  const side = block.isPerSide ? ' each side' : '';
  if (isCountdownBlock(block)) {
    const hold = block.durationSeconds ? formatSeconds(block.durationSeconds) : 'hold';
    return `${times}${hold}${side}${load ? ` · ${load}` : ''}`;
  }
  return `${times}${block.repText ?? String(block.repTarget)}${side}${load ? ` · ${load}` : ''}`;
}

/** The line under a collapsed exercise: its target, how far along it is, or what was done. */
export function exerciseSummary(block: Block): string {
  if (block.skipped) return 'Skipped';
  const { sets } = block;
  const done = sets.filter((s) => s.completed);
  if (done.length === 0) {
    if (block.doneBy) return block.doneBy === 'watch' ? 'Recorded on your watch' : 'Done, logged with your coach';
    return exerciseTarget(block);
  }
  if (isIntervalBlock(block)) {
    return done.length === sets.length
      ? plural(done.length, 'round')
      : `${done.length} of ${plural(sets.length, 'round')}`;
  }
  if (done.length < sets.length) return `${done.length} of ${plural(sets.length, 'set')} · ${exerciseTarget(block)}`;
  if (block.type === 'cardio' || block.type === 'class') {
    const { durationSeconds, distanceKm } = done[0];
    const parts = [
      durationSeconds ? formatSeconds(durationSeconds) : null,
      distanceKm ? formatDistanceKm(distanceKm) : null,
    ].filter((part): part is string => part != null);
    return parts.length > 0 ? parts.join(' · ') : 'Done';
  }
  if (isCountdownBlock(block)) {
    const load = usesWeight(block.type) ? weightText(done[0].weight, block.weightUnit) : null;
    return `${plural(done.length, 'set')} · ${formatSeconds(done[0].durationSeconds ?? block.durationSeconds ?? 0)}${load ? ` · ${load}` : ''}`;
  }
  if (new Set(done.map((s) => s.weight)).size === 1) {
    const load = weightText(done[0].weight, block.weightUnit);
    return `${plural(done.length, 'set')} · ${load ? `${load} · ` : ''}${done.map((s) => s.reps).join(', ')}`;
  }
  return done.map((s) => (s.weight > 0 ? `${s.reps} × ${s.weight}` : String(s.reps))).join(', ');
}

/** "Last time 20 kg × 10, 10, 9". Null with no history. */
export function lastTimeText(block: Block): string | null {
  const sets = block.lastSets;
  if (!sets || sets.length === 0) return null;
  if (sets[0].distance_km != null || (sets[0].reps == null && block.type !== 'reps' && sets.length === 1)) {
    const { duration_seconds: seconds, distance_km: km } = sets[0];
    const parts = [seconds ? formatSeconds(seconds) : null, km ? formatDistanceKm(km) : null].filter(
      (part): part is string => part != null,
    );
    return parts.length > 0 ? `Last time ${parts.join(', ')}` : null;
  }
  if (sets[0].reps == null) {
    return `Last time ${sets.map((s) => formatSeconds(s.duration_seconds ?? 0)).join(', ')}`;
  }
  if (new Set(sets.map((s) => s.weight ?? 0)).size === 1) {
    const load = weightText(sets[0].weight, sets[0].weight_unit);
    return `Last time ${load ? `${load} × ` : ''}${sets.map((s) => s.reps).join(', ')}`;
  }
  return `Last time ${sets.map((s) => (s.weight ? `${s.weight} × ${s.reps}` : String(s.reps))).join(', ')}`;
}

/** The card's line above the sets: history, then rest. Null when there's neither. */
export function lastAndRestText(block: Block): string | null {
  // An interval's recovery is part of its timer, not a rest between sets.
  if (isIntervalBlock(block)) return lastTimeText(block) ?? 'Use the timer, or just enter your rounds';
  const parts = [lastTimeText(block), block.restSeconds > 0 ? `Rest ${block.restSeconds} s` : null];
  const text = parts.filter((part): part is string => part != null).join(' · ');
  return text.length > 0 ? text : null;
}

/** How long without a tick before a return asks whether the workout already ended. */
export const FORGOT_AFTER_MS = 90 * 60 * 1000;

/**
 * The time to offer in "Did you finish at 7:52?", or null when there's nothing to ask. With
 * nothing ticked there's no last tick to go by, so that's an ordinary resume.
 */
export function forgotFinishAt(draft: Pick<WorkoutDraft, 'lastTickAt'>, nowMs: number): string | null {
  if (!draft.lastTickAt) return null;
  const last = Date.parse(draft.lastTickAt);
  return Number.isFinite(last) && nowMs - last >= FORGOT_AFTER_MS ? draft.lastTickAt : null;
}

/** Exercises that differ from the plan, for "Keep these for next Thursday?". */
export function planChanges(blocks: Block[]): { key: string; name: string; replaced?: string }[] {
  return blocks.flatMap((block) => {
    if (block.addedToday) return [{ key: block.key, name: block.name }];
    return block.swappedFrom ? [{ key: block.key, name: block.name, replaced: block.swappedFrom }] : [];
  });
}

const SECTION_TITLES: Record<WorkoutSection, string> = {
  warmup: 'Warm-up',
  main: 'Main',
  cooldown: 'Cool-down',
};

export function sectionTitle(section: WorkoutSection): string {
  return SECTION_TITLES[section];
}

/** One set from last time, for the table's column: "20 × 10", "30s", "10 min, 1.1 km". */
export function lastSetText(set: LastSessionSet | undefined): string {
  if (!set) return '–';
  if (set.distance_km != null) {
    return [set.duration_seconds ? formatSeconds(set.duration_seconds) : null, formatDistanceKm(set.distance_km)]
      .filter((part): part is string => part != null)
      .join(', ');
  }
  if (set.reps == null) return set.duration_seconds ? formatSeconds(set.duration_seconds) : '–';
  return set.weight ? `${set.weight} × ${set.reps}` : String(set.reps);
}

/** What to send for a finished workout. A per-side hold is worked twice, so it logs both sides. */
export function toLogbookExercises(blocks: Block[]): LoggedExercise[] {
  return toLoggedExercises(blocks).map((exercise, bi) => {
    const block = blocks[bi];
    return isCountdownBlock(block) && block.isPerSide
      ? {
          ...exercise,
          sets: exercise.sets.map((s) => ({
            ...s,
            duration_seconds: s.duration_seconds == null ? null : s.duration_seconds * 2,
          })),
        }
      : exercise;
  });
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Matches the API's results back to the exercises they were asked for. */
export function lastSessionsByKey(blocks: Block[], results: LastSession[]): Record<string, LastSession> {
  const byKey: Record<string, LastSession> = {};
  for (const block of blocks) {
    const found = results.find(
      (r) => (r.exercise_id ?? null) === (block.exercise_id ?? null) && sameName(r.name, block.name),
    );
    if (found) byKey[block.key] = found;
  }
  return byKey;
}

/**
 * The plan day with the changes the person chose to keep: a swap takes over the planned
 * exercise's place and prescription, and an added exercise goes on the end of the main work.
 * A swap whose planned exercise has since left the plan is passed over.
 */
export function applyPlanChanges(day: DashboardDayPlan, blocks: Block[], keptKeys: string[]): DashboardDayPlan {
  const kept = blocks.filter((block) => keptKeys.includes(block.key));

  const swapIn = (list: DashboardExercise[] | undefined) =>
    list?.map((exercise) => {
      const swap = kept.find((block) => block.swappedFrom && sameName(block.swappedFrom, exercise.name));
      return swap
        ? swapPlanExercise(exercise, {
            name: swap.name,
            exerciseId: swap.exercise_id,
            targetMuscle: swap.targetMuscle,
            bodyPart: swap.bodyPart,
          })
        : exercise;
    });

  const added: DashboardExercise[] = kept
    .filter((block) => block.addedToday)
    .map((block) => ({
      name: block.name,
      exercise_id: block.exercise_id,
      target_muscle: block.targetMuscle,
      body_part: block.bodyPart,
      type: block.type,
      sets: block.sets.length,
      reps: String(block.sets[0]?.reps ?? block.repTarget),
      rest_seconds: block.restSeconds,
    }));

  return {
    ...day,
    warmup: swapIn(day.warmup),
    exercises: [...(swapIn(day.exercises) ?? []), ...added],
    cooldown: swapIn(day.cooldown),
  };
}
