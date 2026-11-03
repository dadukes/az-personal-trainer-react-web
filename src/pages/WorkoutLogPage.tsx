import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import LogbookView, { type LogbookPast } from '@/components/LogbookView';
import { getDashboard, getWorkoutSessions, type DashboardDayPlan, type WeightUnit, type WorkoutSessionSummary } from '@/lib/api';
import { dayKeyForDate, defaultLogTimes, defaultSourceFor, planDayChoices, tickedSetCount, type PlanDayChoice } from '@/lib/logbookPast';
import { localISODate } from '@/lib/workout';
import { newClientSessionId } from '@/lib/workoutDraft';
import { buildBlocks, type Block } from '@/lib/workoutSession';
import { initWorkoutLocal } from '@/lib/workoutSync';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

interface Loaded {
  planId?: string;
  choices: PlanDayChoice[];
  plan: Record<string, DashboardDayPlan> | null;
  initialDay: string | null;
  recent: WorkoutSessionSummary[];
  focus?: string;
}

/**
 * Log a finished workout: the logbook in Log mode. `?date=YYYY-MM-DD` and `?day=` (a plan day
 * key, or `none` for an empty workout) come from the way in; both default from today. Nothing
 * is kept until Save, which goes through the same queue as a finished workout.
 * Mobile twin: `app/workout/log.tsx`.
 */
export default function WorkoutLogPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const unit: WeightUnit = useAppStore((s) => (s.profile.preferred_unit_system === 'imperial' ? 'lb' : 'kg'));

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [startedAt, setStartedAt] = useState(() => new Date());
  const [end, setEnd] = useState(() => new Date());
  const [clientSessionId] = useState(newClientSessionId);
  const [finished, setFinished] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);

  useEffect(() => {
    const token = session?.access_token;
    const userId = session?.user.id;
    if (!token || !userId || loaded) return;
    let active = true;
    void (async () => {
      initWorkoutLocal(userId);
      let plan: Awaited<ReturnType<typeof getDashboard>>['data']['active_workout_plan'] = null;
      try {
        plan = (await getDashboard(token)).data.active_workout_plan ?? null;
      } catch {
        // No connection: an empty workout can still be logged, and saved once it's back.
      }
      let recent: WorkoutSessionSummary[] = [];
      try {
        recent = (await getWorkoutSessions(token, 50)).sessions;
      } catch {
        // Only costs the "already logged" note.
      }
      if (!active) return;
      const date = params.get('date');
      const day = params.get('day');
      const dateISO = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localISODate(new Date());
      const choices = planDayChoices(plan?.plan);
      const asked = day === 'none' ? null : day && choices.some((c) => c.key === day) ? day : undefined;
      const initialDay = asked === undefined ? defaultSourceFor(choices, dateISO) : asked;
      const dayPlan = initialDay ? plan?.plan?.[initialDay] : undefined;
      const times = defaultLogTimes(dateISO, new Date(), dayPlan?.estimated_duration_minutes);
      setStartedAt(times.start);
      setEnd(times.end);
      setBlocks(dayPlan ? buildBlocks(dayPlan, unit) : []);
      setLoaded({ planId: plan?.id, choices, plan: plan?.plan ?? null, initialDay, recent, focus: dayPlan?.focus });
    })();
    return () => {
      active = false;
    };
    // Loads once: the page owns everything after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  // Anything ticked or changed is worth a question before it's thrown away.
  const changed = !finished && (tickedSetCount(blocks) > 0 || blocks.some((b) => b.addedToday === true || b.swappedFrom != null));
  useEffect(() => {
    if (!changed) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [changed]);

  // Back where it came from, or Home when it was opened directly.
  const leave = useCallback(() => {
    setExitOpen(false);
    if (location.key === 'default') navigate('/', { replace: true });
    else navigate(-1);
  }, [location.key, navigate]);

  if (!loaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" style={{ background: 'var(--ground)' }}>
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-t-transparent" style={{ borderColor: 'var(--teal)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const past: LogbookPast = {
    kind: 'log',
    planId: loaded.planId,
    choices: loaded.choices,
    plan: loaded.plan,
    initialDay: loaded.initialDay,
    end,
    setEnd,
    recent: loaded.recent,
  };

  return (
    <LogbookView
      blocks={blocks}
      setBlocks={setBlocks}
      planId={loaded.planId}
      dayKey={loaded.initialDay ?? dayKeyForDate(localISODate(end))}
      focus={loaded.focus}
      startedAt={startedAt}
      setStartedAt={setStartedAt}
      elapsed={0}
      clientSessionId={clientSessionId}
      accessToken={session?.access_token}
      askToFinish={false}
      finished={finished}
      onFinished={() => setFinished(true)}
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
