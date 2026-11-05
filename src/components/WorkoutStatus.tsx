import { AlertTriangle, CloudOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Surface } from '@/components/ui';
import { splitFocus } from '@/lib/home';
import {
  completedSetCount,
  startedAgoLabel,
  totalSetCountOf,
  type PendingWorkoutSave,
  type WorkoutDraft,
} from '@/lib/workoutDraft';
import {
  discardPendingWorkout,
  flushWorkoutSaves,
  initWorkoutLocal,
  retryWorkoutSave,
} from '@/lib/workoutSync';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

/** How often to look for a due save. The real delay is the backoff stored on each one. */
const CHECK_EVERY_MS = 5_000;

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Mounted with the app shell. Restores this user's workouts, and keeps working through the
 * save queue: on load, when the connection returns, when the tab comes back, and otherwise
 * on each save's backoff.
 */
export function WorkoutSyncHost() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const accessToken = session?.access_token ?? null;
  const hasWaitingSave = useAppStore((s) => s.workoutPending.some((p) => !p.needsAttention));

  useEffect(() => {
    if (userId) initWorkoutLocal(userId);
  }, [userId]);

  useEffect(() => {
    if (!accessToken) return;
    void flushWorkoutSaves(accessToken);
    const flushNow = () => void flushWorkoutSaves(accessToken, { ignoreBackoff: true });
    const onVisible = () => {
      if (document.visibilityState === 'visible') flushNow();
    };
    window.addEventListener('online', flushNow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', flushNow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !hasWaitingSave) return;
    const id = setInterval(() => void flushWorkoutSaves(accessToken), CHECK_EVERY_MS);
    return () => clearInterval(id);
  }, [accessToken, hasWaitingSave]);

  return null;
}

/** Home's hero while a workout is in progress. It takes the place of starting a new one. */
export function WorkoutResumeCard({ draft }: { draft: WorkoutDraft }) {
  const navigate = useNavigate();
  const done = completedSetCount(draft.blocks);
  const total = totalSetCountOf(draft.blocks);
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <section
      aria-label="Workout in progress"
      className="flex flex-col gap-4 rounded-hero p-5 sm:p-7"
      style={{ background: 'var(--hero)' }}
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold" style={{ color: 'var(--hero-sub)' }}>
          In progress · {startedAgoLabel(draft.startedAt, new Date())}
        </span>
        <h2 className="type-display m-0" style={{ color: 'var(--hero-ink)' }}>
          {draft.focus ? splitFocus(draft.focus).title : `${capitalize(draft.dayKey)} workout`}
        </h2>
        <span className="text-[15px] font-medium leading-[21px]" style={{ color: 'var(--hero-sub)' }}>
          {done > 0
            ? `${done} of ${total} sets ticked. They're saved on this device.`
            : 'Nothing ticked yet. Pick up where you left off.'}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${done} of ${total} sets ticked`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 overflow-hidden rounded"
        style={{ background: 'rgba(255,255,255,0.2)' }}
      >
        <div className="h-2 rounded" style={{ width: `${percent}%`, background: 'var(--forma-aqua)' }} />
      </div>
      <div className="flex flex-col gap-1">
        <Button size="lg" fullWidth onClick={() => navigate(`/workout/${draft.dayKey}`)}>
          Resume workout
        </Button>
        {done > 0 ? (
          <button
            type="button"
            onClick={() => navigate(`/workout/${draft.dayKey}?finish=1`)}
            className="min-h-[44px] text-[14px] font-semibold text-white"
          >
            I&rsquo;m done, finish it
          </button>
        ) : null}
      </div>
    </section>
  );
}

function PendingRow({ save }: { save: PendingWorkoutSave }) {
  const { session } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const title = save.focus ?? `${capitalize(save.dayKey)} workout`;

  if (!save.needsAttention) {
    return (
      <div className="flex items-center gap-2.5">
        <CloudOff size={18} color="var(--text-secondary)" className="flex-shrink-0" />
        <p className="m-0 text-[13.5px] leading-[19px]" style={{ color: 'var(--text-secondary)' }}>
          {title}: saved on this device, will sync.
        </p>
      </div>
    );
  }

  const onRetry = async () => {
    if (!session?.access_token) return;
    setRetrying(true);
    try {
      await retryWorkoutSave(save.clientSessionId, session.access_token);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="flex flex-col gap-2" role="alert">
      <div className="flex items-center gap-2.5">
        <AlertTriangle size={18} color="var(--forma-danger)" className="flex-shrink-0" />
        <p className="m-0 text-[13.5px] font-bold leading-[19px]" style={{ color: 'var(--text-primary)' }}>
          We couldn&rsquo;t save {title}. It&rsquo;s still on this device.
        </p>
      </div>
      {save.lastError ? (
        <p className="m-0 text-[12.5px] leading-[18px]" style={{ color: 'var(--text-secondary)' }}>
          {save.lastError}
        </p>
      ) : null}
      <div className="flex gap-2">
        {confirmingDiscard ? (
          <>
            <Button variant="link" fullWidth onClick={() => setConfirmingDiscard(false)}>
              Keep it
            </Button>
            <Button variant="link" fullWidth onClick={() => discardPendingWorkout(save.clientSessionId)}>
              <span style={{ color: 'var(--forma-danger)' }}>Yes, discard it</span>
            </Button>
          </>
        ) : (
          <>
            <Button variant="quiet" fullWidth disabled={retrying} onClick={() => void onRetry()}>
              {retrying ? 'Trying…' : 'Try again'}
            </Button>
            <Button variant="link" fullWidth onClick={() => setConfirmingDiscard(true)}>
              Discard
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Finished workouts the server hasn't confirmed yet. Renders nothing when there are none. */
export function PendingWorkoutsCard() {
  const pending = useAppStore((s) => s.workoutPending);
  if (pending.length === 0) return null;
  return (
    <Surface padding="16px">
      <div className="flex flex-col gap-3">
        {pending.map((save) => (
          <PendingRow key={save.clientSessionId} save={save} />
        ))}
      </div>
    </Surface>
  );
}
