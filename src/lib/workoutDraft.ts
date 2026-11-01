import type { WorkoutLogPayload } from '@/lib/api';
import type { Block } from '@/lib/workoutSession';

/**
 * The workout on this device: the one in progress and any finished ones the server hasn't
 * confirmed yet. Both live in one stored value, so finishing a workout (moving it from
 * `active` to `pending`) is a single write and there's no moment where closing the tab
 * loses it.
 *
 * Pure logic, tested with Vitest. Storage, network and the app store are in
 * `workoutSync.ts`. Mirrors the mobile app's `lib/workout-draft.ts`.
 */

export const WORKOUT_STORE_VERSION = 1;

export interface WorkoutDraft {
  /** Sent with the save, so a retry can never add a second workout. */
  clientSessionId: string;
  planId?: string;
  dayKey: string;
  focus?: string;
  dayNotes?: string;
  startedAt: string;
  /** When a set was last ticked. Null until the first one. */
  lastTickAt: string | null;
  /** The whole workout as it stands, so a resume doesn't depend on the plan staying the same. */
  blocks: Block[];
}

/** A finished workout waiting for the server to confirm it. */
export interface PendingWorkoutSave {
  clientSessionId: string;
  planId?: string;
  dayKey: string;
  /** The date the workout belongs to, for marking the day done once it's saved. */
  dateISO: string;
  focus?: string;
  payload: WorkoutLogPayload;
  attempts: number;
  /** Epoch ms of the next automatic try. */
  nextAttemptAt: number;
  /** The server refused it, so retrying won't help without the person stepping in. */
  needsAttention: boolean;
  lastError: string | null;
}

export interface WorkoutLocalStore {
  version: number;
  active: WorkoutDraft | null;
  pending: PendingWorkoutSave[];
}

export function emptyWorkoutStore(): WorkoutLocalStore {
  return { version: WORKOUT_STORE_VERSION, active: null, pending: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidDraft(value: unknown): value is WorkoutDraft {
  if (!isRecord(value) || typeof value.clientSessionId !== 'string' || typeof value.dayKey !== 'string') {
    return false;
  }
  if (typeof value.startedAt !== 'string' || !Array.isArray(value.blocks) || value.blocks.length === 0) {
    return false;
  }
  return value.blocks.every((block) => isRecord(block) && Array.isArray(block.sets));
}

function isValidPending(value: unknown): value is PendingWorkoutSave {
  return (
    isRecord(value) &&
    typeof value.clientSessionId === 'string' &&
    isRecord(value.payload) &&
    Array.isArray(value.payload.exercises)
  );
}

/**
 * Reads the stored value. Whatever can't be understood is dropped piece by piece, so one
 * bad draft can't take a finished workout down with it, and a corrupt value never crashes
 * the app on launch.
 */
export function parseWorkoutStore(raw: string | null | undefined): WorkoutLocalStore {
  if (!raw) {
    return emptyWorkoutStore();
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return emptyWorkoutStore();
    }
    return {
      version: WORKOUT_STORE_VERSION,
      active: isValidDraft(parsed.active) ? parsed.active : null,
      pending: Array.isArray(parsed.pending) ? parsed.pending.filter(isValidPending) : [],
    };
  } catch {
    return emptyWorkoutStore();
  }
}

export function completedSetCount(blocks: Block[]): number {
  return blocks.reduce((acc, b) => acc + b.sets.filter((s) => s.completed).length, 0);
}

export function totalSetCountOf(blocks: Block[]): number {
  return blocks.reduce((acc, b) => acc + b.sets.length, 0);
}

export function createDraft(input: {
  clientSessionId: string;
  planId?: string;
  dayKey: string;
  focus?: string;
  dayNotes?: string;
  startedAt: string;
  blocks: Block[];
}): WorkoutDraft {
  return { ...input, lastTickAt: null };
}

/** The draft after a change on screen. `lastTickAt` only moves when the tick count does. */
export function updateDraft(draft: WorkoutDraft, blocks: Block[], nowISO: string): WorkoutDraft {
  const ticked = completedSetCount(blocks) !== completedSetCount(draft.blocks);
  return { ...draft, blocks, lastTickAt: ticked ? nowISO : draft.lastTickAt };
}

/** `crypto.randomUUID` only exists on secure origins, and a dev server over a LAN isn't one. */
export function newClientSessionId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Moves the active workout to the queue, due straight away. Safe to repeat: a workout
 * that's already queued stays as it is, so a double-tap can't queue it twice.
 */
export function finishActive(
  store: WorkoutLocalStore,
  save: Pick<PendingWorkoutSave, 'clientSessionId' | 'planId' | 'dayKey' | 'dateISO' | 'focus' | 'payload'>,
  nowMs: number,
): WorkoutLocalStore {
  const active = store.active?.clientSessionId === save.clientSessionId ? null : store.active;
  if (store.pending.some((p) => p.clientSessionId === save.clientSessionId)) {
    return { ...store, active };
  }
  return {
    ...store,
    active,
    pending: [
      ...store.pending,
      { ...save, attempts: 0, nextAttemptAt: nowMs, needsAttention: false, lastError: null },
    ],
  };
}

/** Clears a workout from the device. Only ever called once the server has confirmed it. */
export function removePending(store: WorkoutLocalStore, clientSessionId: string): WorkoutLocalStore {
  return { ...store, pending: store.pending.filter((p) => p.clientSessionId !== clientSessionId) };
}

const BACKOFF_STEPS_MS = [5_000, 15_000, 30_000, 60_000];

/**
 * Wait before the next try. It stops growing at a minute, which is the fallback for how
 * soon a save lands if the browser's `online` event doesn't fire.
 */
export function nextBackoffMs(attempts: number): number {
  return BACKOFF_STEPS_MS[Math.min(Math.max(attempts, 1), BACKOFF_STEPS_MS.length) - 1];
}

/** HTTP status from a failed save; `null` means no response came back at all. */
export type SaveFailure = { status: number | null; message: string };

/**
 * Whether trying again could help. Expired sign-ins, rate limits and server errors clear
 * up by themselves. Any other 4xx means the server looked at this workout and refused it,
 * and it would refuse it again, so the person needs to know instead.
 */
export function isRetryableFailure(status: number | null): boolean {
  if (status == null || status >= 500) {
    return true;
  }
  return status === 401 || status === 403 || status === 408 || status === 429;
}

/** Records a failed try. The workout always stays on the device. */
export function recordFailure(
  store: WorkoutLocalStore,
  clientSessionId: string,
  failure: SaveFailure,
  nowMs: number,
): WorkoutLocalStore {
  return {
    ...store,
    pending: store.pending.map((p) => {
      if (p.clientSessionId !== clientSessionId) {
        return p;
      }
      const attempts = p.attempts + 1;
      return {
        ...p,
        attempts,
        nextAttemptAt: nowMs + nextBackoffMs(attempts),
        needsAttention: !isRetryableFailure(failure.status),
        lastError: failure.message,
      };
    }),
  };
}

/** Saves to try now. Coming back online or to the tab (`ignoreBackoff`) doesn't wait out the delay. */
export function dueSaves(store: WorkoutLocalStore, nowMs: number, ignoreBackoff = false): PendingWorkoutSave[] {
  return store.pending.filter((p) => !p.needsAttention && (ignoreBackoff || p.nextAttemptAt <= nowMs));
}

/** The person asked to try again, so a refused save goes back in the queue. */
export function retryNow(store: WorkoutLocalStore, clientSessionId: string, nowMs: number): WorkoutLocalStore {
  return {
    ...store,
    pending: store.pending.map((p) =>
      p.clientSessionId === clientSessionId ? { ...p, needsAttention: false, nextAttemptAt: nowMs } : p,
    ),
  };
}

/** Whole seconds left on a countdown, from the real clock, so a stalled timer can't lose time. */
export function secondsUntil(endsAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "started 38 min ago" for a workout in progress, then the day once that stops being useful. */
export function startedAgoLabel(startedAt: string, now: Date): string {
  const started = new Date(startedAt);
  const minutes = Math.floor((now.getTime() - started.getTime()) / 60_000);
  if (!Number.isFinite(minutes)) {
    return 'started earlier';
  }
  if (minutes < 1) {
    return 'started just now';
  }
  if (minutes < 60) {
    return `started ${minutes} min ago`;
  }
  if (minutes < 12 * 60) {
    return `started ${Math.floor(minutes / 60)} h ago`;
  }
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(started)) / 86_400_000);
  if (days === 0) {
    return 'started earlier today';
  }
  if (days === 1) {
    return 'started yesterday';
  }
  return days < 7 ? `started ${WEEKDAYS[started.getDay()]}` : `started ${days} days ago`;
}
