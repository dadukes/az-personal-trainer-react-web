import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import LogbookView, { type LogbookPast } from '@/components/LogbookView';
import { workoutTitle } from '@/lib/activities';
import { getWorkoutSession, userSafeError, type WeightUnit, type WorkoutSessionDetailResponse } from '@/lib/api';
import { editBlocksFromSession, editSignature } from '@/lib/logbookPast';
import { exercisesFromSets } from '@/lib/workoutEdit';
import { type Block } from '@/lib/workoutSession';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

interface Loaded {
  detail: WorkoutSessionDetailResponse;
  signature: string;
}

/**
 * Edit a saved workout: the logbook in Edit mode, saved whole with `PUT`. Delete is at the
 * bottom of the page. Mobile twin: `app/workout/edit/[id].tsx`.
 */
export default function WorkoutEditPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const unit: WeightUnit = useAppStore((s) => (s.profile.preferred_unit_system === 'imperial' ? 'lb' : 'kg'));

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [startedAt, setStartedAt] = useState(() => new Date());
  const [end, setEnd] = useState(() => new Date());
  const [closed, setClosed] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);

  useEffect(() => {
    const token = session?.access_token;
    if (!token || !id || loaded) return;
    let active = true;
    void (async () => {
      try {
        const detail = await getWorkoutSession(token, id);
        if (!active) return;
        const initial = editBlocksFromSession(detail.exercises ?? exercisesFromSets(detail.sets ?? []), unit);
        const start = new Date(detail.session.started_at);
        const finish = new Date(detail.session.completed_at);
        setBlocks(initial);
        setStartedAt(start);
        setEnd(finish);
        setLoaded({ detail, signature: editSignature(initial, start, finish) });
      } catch (err) {
        if (active) setError(userSafeError(err, 'No connection right now, so this workout can’t open. Try again in a moment.'));
      }
    })();
    return () => {
      active = false;
    };
    // Loads once: the page owns everything after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, id]);

  const changed = !closed && loaded != null && editSignature(blocks, startedAt, end) !== loaded.signature;
  useEffect(() => {
    if (!changed) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [changed]);

  // Back to the workout's page, which reads it again.
  const leave = useCallback(() => {
    setExitOpen(false);
    // From a finished workout's summary, the summary is gone, so this goes to the workout's page.
    const fromSummary = (location.state as { fromSummary?: boolean } | null)?.fromSummary === true;
    if (location.key === 'default' || fromSummary) navigate(`/activities/workout/${id}`, { replace: true });
    else navigate(-1);
  }, [id, location.key, location.state, navigate]);

  if (!loaded) {
    return (
      <div className="flex min-h-[100dvh] flex-col" style={{ background: 'var(--ground)' }}>
        <button aria-label="Close" onClick={leave} className="m-2 flex h-11 w-11 items-center justify-center">
          <X size={22} color="var(--ink)" />
        </button>
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          {error ? (
            <p className="text-[15px] leading-[21px]" style={{ color: 'var(--ink-2)' }}>{error}</p>
          ) : (
            <div className="h-9 w-9 animate-spin rounded-full border-[3px]" style={{ borderColor: 'var(--teal)', borderTopColor: 'transparent' }} />
          )}
        </div>
      </div>
    );
  }

  const { detail } = loaded;
  const header = detail.session;
  const title = workoutTitle({ title: detail.title, day: header.day });
  const past: LogbookPast = {
    kind: 'edit',
    sessionId: id,
    title,
    end,
    setEnd,
    originalEnd: new Date(header.completed_at),
    timesLocked: detail.times_locked === true,
    source: detail.source,
    planId: header.plan_id ?? undefined,
    planDay: header.plan_id ? header.day : null,
    hasRecording: (detail.recordings ?? []).length > 0,
    changed,
    onClosed: (how) => {
      setClosed(true);
      // A deleted workout has no page to go back to.
      if (how === 'deleted') navigate('/activities', { replace: true });
      else leave();
    },
  };

  return (
    <LogbookView
      blocks={blocks}
      setBlocks={setBlocks}
      planId={past.planId}
      dayKey={header.day ?? 'workout'}
      focus={title}
      startedAt={startedAt}
      setStartedAt={setStartedAt}
      elapsed={0}
      clientSessionId={id}
      accessToken={session?.access_token}
      askToFinish={false}
      finished={false}
      onFinished={() => undefined}
      exitOpen={exitOpen}
      onRequestExit={() => (changed ? setExitOpen(true) : leave())}
      onStay={() => setExitOpen(false)}
      onLeave={leave}
      onDiscard={leave}
      onDone={leave}
      past={past}
    />
  );
}
