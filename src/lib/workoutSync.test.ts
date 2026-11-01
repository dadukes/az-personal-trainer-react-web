import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, logWorkout } from '@/lib/api';
import {
  discardPendingWorkout,
  finishActiveWorkout,
  flushWorkoutSaves,
  getActiveDraft,
  initWorkoutLocal,
  retryWorkoutSave,
  saveActiveDraft,
} from '@/lib/workoutSync';
import { createDraft } from '@/lib/workoutDraft';
import type { Block } from '@/lib/workoutSession';
import { useAppStore } from '@/store/useAppStore';

vi.mock('@/lib/api', () => {
  class MockApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return { ApiError: MockApiError, logWorkout: vi.fn() };
});

const mockedLog = vi.mocked(logWorkout);

const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
});

const blocks = [{ key: 'k', name: 'Bench', section: 'main', type: 'reps', sets: [{ completed: true }] }] as unknown as Block[];
const payload = { started_at: 'a', completed_at: 'b', duration_seconds: 60, exercises: [] };
const save = (id: string) => ({ clientSessionId: id, planId: 'p1', dayKey: 'monday', dateISO: '2026-11-01', payload });
const saved = {
  success: true,
  session_id: 'server-id',
  xp_earned: 40,
  new_total_xp: 1240,
  leveled_up: false,
  summary: { total_sets: 1, duration_seconds: 60 },
};
const startDraft = (id: string) =>
  saveActiveDraft(createDraft({ clientSessionId: id, dayKey: 'monday', startedAt: '2026-11-01T12:00:00Z', blocks }));
const pending = () => useAppStore.getState().workoutPending;

let user = 0;
const newUser = () => {
  user += 1;
  initWorkoutLocal(`user-${user}`);
};

beforeEach(() => {
  mockedLog.mockReset();
  memory.clear();
  useAppStore.getState().clearUserData();
  newUser();
});

describe('the save queue', () => {
  it('still sends a save after an earlier flush that found nothing to do', async () => {
    // What happens on every page load. It once left the queue permanently stuck.
    await flushWorkoutSaves('token');
    mockedLog.mockResolvedValue(saved);
    startDraft('c1');

    await finishActiveWorkout(save('c1'), 'token');

    expect(mockedLog).toHaveBeenCalledTimes(1);
    expect(pending()).toEqual([]);
  });

  it('sends the id with the save, and takes the draft off the active slot', async () => {
    mockedLog.mockResolvedValue(saved);
    startDraft('c1');

    await finishActiveWorkout(save('c1'), 'token');

    expect(mockedLog.mock.calls[0][1].client_session_id).toBe('c1');
    expect(getActiveDraft()).toBeNull();
  });

  it('marks the day done and sets the server total only once the server confirms', async () => {
    mockedLog.mockRejectedValueOnce(new Error('offline'));
    startDraft('c1');

    await finishActiveWorkout(save('c1'), 'token');

    expect(pending()).toHaveLength(1);
    expect(useAppStore.getState().completedWorkouts).toEqual({});

    mockedLog.mockResolvedValueOnce(saved);
    await flushWorkoutSaves('token', { ignoreBackoff: true });

    expect(pending()).toEqual([]);
    expect(Object.keys(useAppStore.getState().completedWorkouts)).toHaveLength(1);
    expect(useAppStore.getState().gamification.current_level).toBe(3); // 1240 XP, from the server's total
    expect(useAppStore.getState().workoutSaveResults.c1.xpEarned).toBe(40);
  });

  it('survives a reload while waiting, then sends the same workout', async () => {
    mockedLog.mockRejectedValueOnce(new Error('offline'));
    startDraft('c1');
    await finishActiveWorkout(save('c1'), 'token');
    const stored = [...memory.values()][0];

    // A new page load: fresh module state over the same storage.
    vi.resetModules();
    const reloaded = await import('@/lib/workoutSync');
    const { useAppStore: store } = await import('@/store/useAppStore');
    memory.clear();
    memory.set(`forma:workout-local-v1:user-${user}`, stored);
    mockedLog.mockResolvedValueOnce(saved);

    reloaded.initWorkoutLocal(`user-${user}`);
    expect(store.getState().workoutPending).toHaveLength(1);
    await reloaded.flushWorkoutSaves('token', { ignoreBackoff: true });

    expect(mockedLog.mock.calls[1][1].client_session_id).toBe('c1');
    expect(store.getState().workoutPending).toEqual([]);
  });

  it('two flushes at once send a save once', async () => {
    mockedLog.mockResolvedValue(saved);
    startDraft('c1');
    const first = finishActiveWorkout(save('c1'), 'token');
    const second = flushWorkoutSaves('token', { ignoreBackoff: true });
    await Promise.all([first, second]);

    expect(mockedLog).toHaveBeenCalledTimes(1);
  });

  it('with no sign-in yet, keeps the workout for later', async () => {
    startDraft('c1');
    await finishActiveWorkout(save('c1'), undefined);

    expect(mockedLog).not.toHaveBeenCalled();
    expect(pending()).toHaveLength(1);
  });

  it('a refusal keeps the workout, stops retrying, and can be retried or discarded', async () => {
    mockedLog.mockRejectedValueOnce(new ApiError('Bad workout', 400));
    startDraft('c1');
    await finishActiveWorkout(save('c1'), 'token');

    expect(pending()[0]).toEqual(expect.objectContaining({ needsAttention: true, lastError: 'Bad workout' }));
    await flushWorkoutSaves('token', { ignoreBackoff: true });
    expect(mockedLog).toHaveBeenCalledTimes(1);

    mockedLog.mockRejectedValueOnce(new ApiError('Bad workout', 400));
    await retryWorkoutSave('c1', 'token');
    expect(mockedLog).toHaveBeenCalledTimes(2);
    expect(pending()).toHaveLength(1);

    discardPendingWorkout('c1');
    expect(pending()).toEqual([]);
  });

  it('keeps each user apart', async () => {
    startDraft('c1');
    await finishActiveWorkout(save('c1'), undefined);
    expect(pending()).toHaveLength(1);

    newUser();
    expect(pending()).toEqual([]);
    expect(getActiveDraft()).toBeNull();
  });
});
