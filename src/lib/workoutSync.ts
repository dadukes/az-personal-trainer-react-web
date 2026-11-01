import { ApiError, logWorkout, type WorkoutLogPayload } from '@/lib/api';
import {
  dueSaves,
  emptyWorkoutStore,
  finishActive,
  parseWorkoutStore,
  recordFailure,
  removePending,
  retryNow,
  type PendingWorkoutSave,
  type WorkoutDraft,
  type WorkoutLocalStore,
} from '@/lib/workoutDraft';
import { useAppStore } from '@/store/useAppStore';

/**
 * Keeps workouts on this device until the server has them. Holds the one stored value from
 * `workoutDraft.ts`, writes it on every change, and works through the save queue. Everything
 * is per user, so a second account in this browser can't send the first one's workout under
 * its own sign-in. Mirrors the mobile app's `lib/workout-sync.ts`.
 */

const storeKey = (userId: string) => `forma:workout-local-v1:${userId}`;

let currentUserId: string | null = null;
let store: WorkoutLocalStore = emptyWorkoutStore();

function persist(): void {
  if (!currentUserId) return;
  try {
    localStorage.setItem(storeKey(currentUserId), JSON.stringify(store));
  } catch {
    // Storage full or blocked. The workout is still in memory while the page stays open.
  }
}

function commit(next: WorkoutLocalStore): void {
  store = next;
  persist();
  useAppStore.getState().setWorkoutLocal({ draft: store.active, pending: store.pending });
}

/** Loads this user's workouts. Safe to call from anywhere: it only reads storage once per user. */
export function initWorkoutLocal(userId: string): void {
  if (currentUserId === userId) return;
  currentUserId = userId;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storeKey(userId));
  } catch {
    // Blocked storage behaves like an empty device: the app still works.
  }
  store = parseWorkoutStore(raw);
  useAppStore.getState().setWorkoutLocal({ draft: store.active, pending: store.pending });
}

/** Forgets this user's local workouts. Only for account deletion. */
export function clearWorkoutLocal(userId: string): void {
  try {
    localStorage.removeItem(storeKey(userId));
  } catch {
    // Nothing else can be done.
  }
  if (currentUserId === userId) {
    store = emptyWorkoutStore();
    useAppStore.getState().setWorkoutLocal({ draft: null, pending: [] });
  }
}

export function getActiveDraft(): WorkoutDraft | null {
  return store.active;
}

export function saveActiveDraft(draft: WorkoutDraft): void {
  commit({ ...store, active: draft });
}

export function discardActiveDraft(): void {
  if (store.active) commit({ ...store, active: null });
}

/**
 * Finishes the workout: it moves to the queue in a single write, then the first try runs.
 * Resolves when that try has settled, whichever way it went.
 */
export async function finishActiveWorkout(
  save: Pick<PendingWorkoutSave, 'clientSessionId' | 'planId' | 'dayKey' | 'dateISO' | 'focus'> & {
    payload: WorkoutLogPayload;
  },
  accessToken: string | undefined,
): Promise<void> {
  commit(finishActive(store, save, Date.now()));
  if (accessToken) await flushWorkoutSaves(accessToken);
}

function toFailure(error: unknown): { status: number | null; message: string } {
  if (error instanceof ApiError) return { status: error.status, message: error.message };
  return { status: null, message: error instanceof Error ? error.message : 'Network request failed' };
}

/** Only the confirmed save reaches this: the day is marked done and the workout leaves the device. */
function applySaved(save: PendingWorkoutSave, result: Awaited<ReturnType<typeof logWorkout>>): void {
  const app = useAppStore.getState();
  app.setWorkoutSaveResult(save.clientSessionId, {
    xpEarned: result.xp_earned,
    xpBreakdown: result.xp_breakdown ?? null,
    watchLinked: (result.linked_recordings ?? 0) > 0,
    sessionId: result.session_id ?? null,
  });
  // Always the server's total: this may be a retry of a save whose first answer never
  // arrived, so adding `xp_earned` could count it twice.
  app.setTotalXp(result.new_total_xp);
  app.markWorkoutCompleted(save.planId, save.dateISO, result.xp_earned);
}

let flushing: Promise<void> | null = null;

/**
 * Tries every save that's due, one at a time. A repeat call while one is running joins it,
 * so a double-click can't send a save twice at once (and the server would catch it if it did).
 */
export function flushWorkoutSaves(accessToken: string, options: { ignoreBackoff?: boolean } = {}): Promise<void> {
  if (flushing) return flushing;
  const run = (async () => {
    for (const save of dueSaves(store, Date.now(), options.ignoreBackoff === true)) {
      try {
        const result = await logWorkout(accessToken, { ...save.payload, client_session_id: save.clientSessionId });
        commit(removePending(store, save.clientSessionId));
        applySaved(save, result);
      } catch (error) {
        commit(recordFailure(store, save.clientSessionId, toFailure(error), Date.now()));
      }
    }
  })();
  // Cleared from here rather than inside the run: with nothing due it finishes before this
  // assignment, and clearing inside it would leave the finished run in place for good,
  // silently turning every later flush into a no-op.
  flushing = run;
  void run.finally(() => {
    if (flushing === run) flushing = null;
  });
  return run;
}

/** The person asked to try a stuck workout again. */
export async function retryWorkoutSave(clientSessionId: string, accessToken: string): Promise<void> {
  commit(retryNow(store, clientSessionId, Date.now()));
  await flushWorkoutSaves(accessToken);
}

/** The person chose to throw away a workout the server won't take. */
export function discardPendingWorkout(clientSessionId: string): void {
  commit(removePending(store, clientSessionId));
}
