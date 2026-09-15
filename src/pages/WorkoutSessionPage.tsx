import { AlertTriangle, Check, ChevronLeft, Clock, Dumbbell, Info, Minus, Pause, Play, Plus, RotateCcw, Shuffle, Sparkles, TrendingUp, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import Confetti from '@/components/Confetti';
import FindAlternativeDialog from '@/components/FindAlternativeDialog';
import { DurationEntry, NumberEntry } from '@/components/NumberEntry';
import WorkoutGuided from '@/components/WorkoutGuided';
import { Badge, Button, Card, Eyebrow, SegmentedToggle } from '@/components/ui';
import { getDashboard, getLastPerformance, logWorkout, type WeightUnit, type XpBreakdownEntry } from '@/lib/api';
import { isCatalogExercise, type ExercisePick } from '@/lib/exercise';
import { roundTo } from '@/lib/numberEntry';
import { stepValue, useHoldRepeat } from '@/lib/useHoldRepeat';
import { dateForDayKey } from '@/lib/workout';
import {
  applyBlockSwap,
  blockTargetText,
  buildBlocks,
  formatClock,
  isCountdownBlock,
  isIntervalBlock,
  isSingleCaptureBlock,
  sectionLabel,
  signatureOf,
  swapBlock,
  toLoggedExercises,
  type Block,
  type BlockSwap,
  type SetActual,
} from '@/lib/workoutSession';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SESSION_KEY = 'forma:workout-session';
const VIEW_KEY = 'forma:workout-view';
/** Which session's coach note has already been shown, so it auto-opens only once. */
const NOTE_SEEN_KEY = 'forma:workout-note-seen';

type WorkoutView = 'guided' | 'list';

function resolveDayKey(param?: string): string {
  if (param && DAY_KEYS.includes(param)) return param;
  return DAY_KEYS[new Date().getDay()];
}

/** Only the mutable per-set progress is persisted; block structure is rebuilt from the plan. */
interface PersistedSession {
  planId?: string;
  dayKey: string;
  startedAt: string;
  signature: string;
  sets: SetActual[][];
  /** Mid-session exercise swaps, by block key. The plan itself is never changed. */
  swaps?: Record<string, BlockSwap>;
}

function readPersisted(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PersistedSession) : null;
  } catch {
    return null;
  }
}

function clearPersisted() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export default function WorkoutSessionPage() {
  const { day } = useParams<{ day: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { profile, addXp, markWorkoutCompleted } = useAppStore();
  const unit: WeightUnit = profile.preferred_unit_system === 'imperial' ? 'lb' : 'kg';
  const dayKey = resolveDayKey(day);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [planId, setPlanId] = useState<string | undefined>();
  const [dayNotes, setDayNotes] = useState<string | undefined>();
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [xpEarned, setXpEarned] = useState<number | null>(null);
  // Per-exercise XP tally. XP is effort-based and variable, so showing where it came
  // from is the difference between a number and a reason to come back.
  const [xpBreakdown, setXpBreakdown] = useState<XpBreakdownEntry[] | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [view, setView] = useState<WorkoutView>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(VIEW_KEY) : null;
    return saved === 'list' ? 'list' : 'guided';
  });
  const restoredRef = useRef(false);

  const changeView = useCallback((next: WorkoutView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!session?.access_token) {
        setError('You need to be signed in to start a workout.');
        setLoading(false);
        return;
      }
      try {
        const result = await getDashboard(session.access_token);
        if (!active) return;
        const plan = result.data.active_workout_plan;
        const dp = plan?.plan?.[dayKey] ?? null;
        setPlanId(plan?.id);
        setDayNotes(dp?.ai_notes);
        const fresh = dp && !dp.is_rest_day ? buildBlocks(dp, unit) : [];

        // Restore in-progress captures from a previous (possibly backgrounded) session.
        const persisted = readPersisted();
        if (
          fresh.length > 0 &&
          persisted &&
          persisted.dayKey === dayKey &&
          persisted.planId === plan?.id &&
          persisted.signature === signatureOf(fresh)
        ) {
          fresh.forEach((b, bi) => {
            const savedSets = persisted.sets[bi];
            if (savedSets) {
              b.sets = b.sets.map((s, si) => savedSets[si] ?? s);
            }
            const swap = persisted.swaps?.[b.key];
            if (swap) fresh[bi] = applyBlockSwap(b, swap);
          });
          setStartedAt(new Date(persisted.startedAt));
        } else {
          if (fresh.length > 0) clearPersisted();
          setStartedAt(new Date());
        }
        restoredRef.current = true;
        setBlocks(fresh);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load your workout.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [session, dayKey, unit]);

  /**
   * The coach's intention for the session is worth reading once, when the workout
   * starts — after that it lives behind the header info button instead of repeating
   * above every exercise.
   */
  useEffect(() => {
    if (loading || !dayNotes || blocks.length === 0) return;
    const key = `${planId ?? 'none'}|${dayKey}|${dateForDayKey(dayKey)}`;
    try {
      if (localStorage.getItem(NOTE_SEEN_KEY) === key) return;
      localStorage.setItem(NOTE_SEEN_KEY, key);
    } catch {
      // Storage unavailable — showing it once per load is an acceptable fallback.
    }
    setNoteOpen(true);
  }, [loading, dayNotes, blocks.length, planId, dayKey]);

  // Persist captured progress so nothing is lost when the screen goes inactive.
  useEffect(() => {
    if (!restoredRef.current || finished || !startedAt || blocks.length === 0) return;
    const payload: PersistedSession = {
      planId,
      dayKey,
      startedAt: startedAt.toISOString(),
      signature: signatureOf(blocks),
      sets: blocks.map((b) => b.sets),
      swaps: Object.fromEntries(
        blocks
          .filter((b) => b.swappedFrom)
          .map((b) => [
            b.key,
            {
              name: b.name,
              exercise_id: b.exercise_id,
              swappedFrom: b.swappedFrom,
              targetMuscle: b.targetMuscle,
              bodyPart: b.bodyPart,
            },
          ]),
      ),
    };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch {
      // ignore quota/serialization errors
    }
  }, [blocks, planId, dayKey, startedAt, finished]);

  // Wall-clock timer: derive elapsed from the start time so backgrounding/screen-lock
  // (which throttles JS timers) never loses accumulated workout time.
  useEffect(() => {
    if (finished || !startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
    };
  }, [finished, startedAt]);

  /** A workout is on screen and not yet logged — leaving now throws the session away. */
  const guardExit = !loading && !error && !finished && blocks.length > 0;

  /**
   * Back-navigation guard. The app nav is hidden during a workout, but the browser's
   * own Back (and Android's system back) still points straight out of the session — and
   * nothing is logged until the user finishes. So we park a sentinel history entry and
   * turn any pop into the confirm dialog, re-parking it each time they choose to stay.
   */
  useEffect(() => {
    if (!guardExit) return;
    window.history.pushState({ formaWorkoutGuard: true }, '');
    const onPop = () => {
      window.history.pushState({ formaWorkoutGuard: true }, '');
      setExitOpen(true);
    };
    // Covers tab close / reload, which no in-page dialog can intercept.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [guardExit]);

  /** The one way out mid-session. Home rather than `-1`: `-1` is the sentinel entry. */
  const leaveWorkout = useCallback(() => {
    setExitOpen(false);
    navigate('/', { replace: true });
  }, [navigate]);

  const requestExit = useCallback(() => {
    if (guardExit) {
      setExitOpen(true);
      return;
    }
    navigate(-1);
  }, [guardExit, navigate]);

  const totalSets = useMemo(() => blocks.reduce((n, b) => n + b.sets.length, 0), [blocks]);
  const completedSets = useMemo(
    () => blocks.reduce((n, b) => n + b.sets.filter((s) => s.completed).length, 0),
    [blocks],
  );
  const progressPct = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;

  const mutateSet = useCallback(
    (bi: number, si: number, patch: Partial<SetActual>) => {
      setBlocks((prev) =>
        prev.map((b, i) =>
          i === bi ? { ...b, sets: b.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : b,
        ),
      );
    },
    [],
  );

  // Guided-view callbacks operate on the same shared block state as the list view,
  // so progress (and the single finish/log path) survives toggling between views.
  const setReps = useCallback((bi: number, si: number, reps: number) => mutateSet(bi, si, { reps }), [mutateSet]);
  /**
   * Sets a set's weight and carries it forward, since the same load is the likely next
   * set. The carry stops at the first later set that is already done or that the user gave
   * its own weight (a drop set, a pyramid) — matching on "still had the old weight" would
   * sweep those up as a held ± passes through their value.
   */
  const setWeight = useCallback((bi: number, si: number, weight: number) => {
    setBlocks((prev) =>
      prev.map((b, i) => {
        if (i !== bi || !b.sets[si]) return b;
        const sets = b.sets.slice();
        sets[si] = { ...sets[si], weight, weightEdited: true };
        for (let j = si + 1; j < sets.length; j += 1) {
          if (sets[j].completed || sets[j].weightEdited) break;
          sets[j] = { ...sets[j], weight };
        }
        return { ...b, sets };
      }),
    );
  }, []);

  // Swap state: which block's "Find an alternative" dialog is open (list view — the
  // guided view opens its own), and a counter so a slow last-performance lookup for an
  // earlier swap can't pre-fill a later one.
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const swapReqRef = useRef(0);

  /**
   * Replaces a block's exercise for this session. Sets still to do lose the old load, then
   * get the new exercise's last logged weight if there is one — a better starting number
   * than either zero or the weight of a different movement.
   */
  const swapExercise = useCallback(
    (bi: number, pick: ExercisePick) => {
      setBlocks((prev) => prev.map((b, i) => (i === bi ? swapBlock(b, pick).block : b)));
      const reqId = ++swapReqRef.current;
      const token = session?.access_token;
      if (!pick.exerciseId || !token) return;
      void (async () => {
        try {
          const { last } = await getLastPerformance(token, pick.exerciseId!);
          if (reqId !== swapReqRef.current || last?.weight == null || last.weight <= 0) return;
          const lastWeight = last.weight;
          setBlocks((prev) =>
            prev.map((b, i) => {
              if (i !== bi || b.exercise_id !== pick.exerciseId) return b;
              if (last.weight_unit && last.weight_unit !== b.weightUnit) return b;
              return {
                ...b,
                // Only sets the user hasn't dialled in since the swap.
                sets: b.sets.map((s) => (!s.completed && !s.weightEdited ? { ...s, weight: lastWeight } : s)),
              };
            }),
          );
        } catch {
          // No history is fine — the dial just starts empty.
        }
      })();
    },
    [session],
  );
  const completeSet = useCallback((bi: number, si: number) => mutateSet(bi, si, { completed: true }), [mutateSet]);
  /** Cardio/class report what actually happened rather than being tracked live. */
  const setCapture = useCallback(
    (bi: number, si: number, patch: { durationSeconds?: number; distanceKm?: number }) =>
      mutateSet(bi, si, patch),
    [mutateSet],
  );

  /**
   * `finalCompletion` is the set the user finished to trigger this. The guided player
   * hands it over instead of writing it through `mutateSet`, because that state update
   * would not have flushed by the time we serialize here — without this, the last set
   * of every workout logs as skipped.
   */
  const finish = useCallback(async (finalCompletion?: {
    blockIndex: number;
    setIndex: number;
    durationSeconds?: number;
  }) => {
    const finalBlocks = finalCompletion
      ? blocks.map((b, bi) =>
          bi === finalCompletion.blockIndex
            ? {
                ...b,
                sets: b.sets.map((s, si) =>
                  si === finalCompletion.setIndex
                    ? {
                        ...s,
                        completed: true,
                        ...(finalCompletion.durationSeconds != null
                          ? { durationSeconds: finalCompletion.durationSeconds }
                          : {}),
                      }
                    : s,
                ),
              }
            : b,
        )
      : blocks;
    // Keep the summary tiles consistent with what we're about to log.
    if (finalCompletion) setBlocks(finalBlocks);
    setFinished(true);
    clearPersisted();
    if (!session?.access_token) return;
    const loggedExercises = toLoggedExercises(finalBlocks);
    setSaving(true);
    let earned = 0;
    try {
      const result = await logWorkout(session.access_token, {
        plan_id: planId,
        day: dayKey,
        started_at: (startedAt ?? new Date()).toISOString(),
        completed_at: new Date().toISOString(),
        duration_seconds: elapsed,
        exercises: loggedExercises,
      });
      earned = result.xp_earned;
      setXpEarned(result.xp_earned);
      setXpBreakdown(result.xp_breakdown ?? null);
      addXp(result.xp_earned);
    } catch {
      // logWorkout falls back internally
    } finally {
      setSaving(false);
      // Mark the day done locally regardless of network outcome — the user finished it.
      markWorkoutCompleted(planId, dateForDayKey(dayKey), earned);
    }
  }, [session, blocks, planId, dayKey, elapsed, startedAt, addXp, markWorkoutCompleted]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-1 items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (error || blocks.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-[640px] flex-col items-center justify-center gap-3 p-10 text-center" style={{ minHeight: '60vh' }}>
        <div className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>
          {error ? 'Something went wrong' : 'Nothing scheduled'}
        </div>
        <p className="text-[14px]" style={{ color: 'var(--text-muted)' }}>
          {error ?? 'There is no workout planned for this day. Enjoy your rest!'}
        </p>
        <Button variant="secondary" onClick={() => navigate('/')}>
          Back to Home
        </Button>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-5 p-8 pt-16 text-center">
        <Confetti />
        <div className="flex h-20 w-20 items-center justify-center rounded-full text-[38px]" style={{ background: 'var(--forma-mint)' }}>
          💪
        </div>
        <div className="text-[28px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
          Workout complete
        </div>
        <p className="text-[15px]" style={{ color: 'var(--text-secondary)' }}>
          {saving ? 'Saving your session…' : 'That’s a win for showing up. Consistency over intensity.'}
        </p>
        <div className="flex w-full gap-3">
          <Card className="flex-1 text-center" padding="18px">
            <div className="tabular text-[24px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
              {formatClock(elapsed)}
            </div>
            <div className="mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Duration
            </div>
          </Card>
          <Card className="flex-1 text-center" padding="18px">
            <div className="tabular text-[24px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
              {completedSets}
            </div>
            <div className="mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Sets completed
            </div>
          </Card>
          <Card className="flex-1 text-center" padding="18px">
            <div className="tabular text-[24px] font-extrabold" style={{ color: 'var(--accent-text)' }}>
              {xpEarned != null ? `+${xpEarned}` : '—'}
            </div>
            <div className="mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              XP earned
            </div>
          </Card>
        </div>

        {xpBreakdown && xpBreakdown.length > 0 ? (
          <Card className="w-full" padding="16px 18px">
            <Eyebrow className="mb-2.5">Where that XP came from</Eyebrow>
            <div className="flex flex-col gap-2">
              {xpBreakdown.map((entry, i) => (
                <div key={`${entry.name}-${i}`} className="flex items-center gap-2.5 text-left">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {entry.name}
                  </span>
                  {entry.improved ? (
                    <Badge tone="mint">
                      <TrendingUp size={11} /> Best yet
                    </Badge>
                  ) : null}
                  <span className="tabular flex-shrink-0 text-[13.5px] font-extrabold" style={{ color: 'var(--accent-text)' }}>
                    +{entry.xp}
                  </span>
                </div>
              ))}
            </div>
            {xpBreakdown.some((e) => e.improved) ? (
              <p className="mt-2.5 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
                You beat a previous best today. That&rsquo;s progress you can measure.
              </p>
            ) : null}
          </Card>
        ) : null}

        <Button size="lg" fullWidth onClick={() => navigate('/')}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 p-5 pb-40 sm:p-8 sm:pb-40">
      {/* Header — the view toggle and the coach's session note ride here rather than
          each taking a row of their own above the exercise. */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={requestExit}
          aria-label="Leave workout"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
        >
          <ChevronLeft size={20} color="var(--text-secondary)" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-extrabold capitalize sm:text-[20px]" style={{ color: 'var(--text-primary)' }}>
            {dayKey}
            <span className="hidden sm:inline">&rsquo;s workout</span>
          </div>
          <div className="tabular mt-0.5 flex items-center gap-1.5 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
            <Clock size={13} /> {formatClock(elapsed)} · {completedSets}/{totalSets} sets
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {dayNotes ? (
            <button
              onClick={() => setNoteOpen(true)}
              aria-label="Coach's plan for this session"
              className="flex h-9 w-9 items-center justify-center rounded-xl transition-transform active:scale-95"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
            >
              <Info size={17} color="var(--accent-text)" />
            </button>
          ) : null}
          <SegmentedToggle
            tone="mint"
            size="sm"
            value={view}
            onChange={(v) => changeView(v as WorkoutView)}
            options={[
              { value: 'guided', label: 'Guided' },
              { value: 'list', label: 'All' },
            ]}
          />
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--bg-subtle)' }}>
        <div className="h-full rounded-full transition-[width]" style={{ width: `${progressPct}%`, background: 'var(--accent)' }} />
      </div>

      {view === 'guided' ? (
        <WorkoutGuided
          blocks={blocks}
          accessToken={session?.access_token}
          onSetReps={setReps}
          onSetWeight={setWeight}
          onSwapExercise={swapExercise}
          onSetCapture={setCapture}
          onCompleteSet={completeSet}
          onFinish={finish}
        />
      ) : (
        <>
      {blocks.map((block, bi) => {
        // On a rep block the "per side" qualifier rides on the rep stepper, so the
        // header would only be repeating it.
        const perSideOnDial =
          block.isPerSide && !isCountdownBlock(block) && !isSingleCaptureBlock(block);
        return (
        <Card key={block.key} padding="18px">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>
                {block.name}
              </div>
              <div className="mt-0.5 text-[12.5px] font-semibold" style={{ color: 'var(--accent-text)' }}>
                {blockTargetText(block)}
                {block.isPerSide && !perSideOnDial ? ' · each side' : ''}
              </div>
              {block.swappedFrom ? (
                <div className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  Swapped from {block.swappedFrom}
                </div>
              ) : null}
              {block.notes ? (
                <div className="mt-0.5 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                  {block.notes}
                </div>
              ) : null}
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <Badge tone="neutral" className="whitespace-nowrap">{sectionLabel(block.section)}</Badge>
              {isCatalogExercise(block.type) ? (
                <button
                  onClick={() => setSwapIndex(bi)}
                  aria-label={`Find an alternative to ${block.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg transition-transform active:scale-90"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
                >
                  <Shuffle size={15} color="var(--accent-text)" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {/* Cardio and class are reported, not tracked — one row, actuals inline. */}
            {isSingleCaptureBlock(block) ? (
              <CaptureRow
                block={block}
                onCapture={(patch) => mutateSet(bi, 0, patch)}
                onToggle={() => mutateSet(bi, 0, { completed: !block.sets[0]?.completed })}
              />
            ) : (
            block.sets.map((set, si) =>
              isCountdownBlock(block) || isIntervalBlock(block) ? (
                <TimedSetRow
                  key={si}
                  index={si}
                  label={isIntervalBlock(block) ? `R${si + 1}` : 'Hold'}
                  durationSeconds={block.durationSeconds ?? 30}
                  completed={set.completed}
                  onToggle={() => mutateSet(bi, si, { completed: !set.completed })}
                  onComplete={() => mutateSet(bi, si, { completed: true })}
                />
              ) : (
                // Below `sm` a phone row can't fit the label, both steppers and the check
                // on one line, so the steppers wrap onto a second line of their own.
                <div
                  key={si}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2.5"
                  style={{
                    background: set.completed ? 'var(--bg-selected)' : 'var(--bg-subtle)',
                    border: `1px solid ${set.completed ? 'var(--accent)' : 'var(--border-base)'}`,
                  }}
                >
                  <span
                    className="tabular text-[12px] font-bold sm:w-12"
                    style={{ color: set.completed ? 'var(--text-on-mint)' : 'var(--text-muted)' }}
                  >
                    {`Set ${si + 1}`}
                  </span>

                  <div className="order-last grid w-full grid-cols-1 gap-x-5 gap-y-2 min-[340px]:grid-cols-2 sm:order-none sm:flex sm:w-auto sm:flex-1 sm:items-center sm:gap-4">
                    <Stepper
                      label={perSideOnDial ? 'reps/side' : 'reps'}
                      entryLabel={`Set ${si + 1} reps`}
                      value={set.reps}
                      onMint={set.completed}
                      onStep={(dir) => setReps(bi, si, Math.max(0, Math.round(set.reps + dir)))}
                      onSet={(reps) => setReps(bi, si, reps)}
                    />
                    <Stepper
                      label={block.weightUnit}
                      entryLabel={`Set ${si + 1} weight in ${block.weightUnit}`}
                      value={set.weight}
                      decimals={2}
                      bigStep={5}
                      onMint={set.completed}
                      onStep={(dir, scale) => setWeight(bi, si, stepValue(set.weight, dir, scale))}
                      onSet={(weight) => setWeight(bi, si, weight)}
                    />
                  </div>

                  <button
                    onClick={() => mutateSet(bi, si, { completed: !set.completed })}
                    aria-label={set.completed ? 'Mark set incomplete' : 'Mark set complete'}
                    className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 sm:ml-0"
                    style={{
                      background: set.completed ? 'var(--accent)' : 'transparent',
                      border: set.completed ? 'none' : '1.5px solid var(--border-strong)',
                    }}
                  >
                    {set.completed ? <Check size={16} color="#06224D" strokeWidth={3} /> : null}
                  </button>
                </div>
              ),
            )
            )}
          </div>
        </Card>
        );
      })}

      {/* Sticky finish bar — workout mode hides the app nav, so this owns the bottom edge. */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 px-5 pt-4"
        style={{
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-base)',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        }}
      >
        <div className="mx-auto flex max-w-[760px] items-center gap-3">
          <div className="tabular flex-1 text-[13px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            {completedSets}/{totalSets} sets · {formatClock(elapsed)}
          </div>
          <Button size="lg" onClick={() => void finish()} leftIcon={<Dumbbell size={16} color="#06224D" />}>
            Finish workout
          </Button>
        </div>
      </div>
        </>
      )}

      {noteOpen && dayNotes ? (
        <SessionNoteDialog text={dayNotes} onClose={() => setNoteOpen(false)} />
      ) : null}

      {swapIndex != null && blocks[swapIndex] ? (
        <FindAlternativeDialog
          accessToken={session?.access_token}
          name={blocks[swapIndex].name}
          exerciseId={blocks[swapIndex].exercise_id}
          onClose={() => setSwapIndex(null)}
          onPick={(pick) => {
            swapExercise(swapIndex, pick);
            setSwapIndex(null);
          }}
        />
      ) : null}

      {exitOpen ? (
        <ExitWorkoutDialog
          completedSets={completedSets}
          totalSets={totalSets}
          onStay={() => setExitOpen(false)}
          onLeave={leaveWorkout}
        />
      ) : null}
    </div>
  );
}

/**
 * Confirms leaving a workout that has not been logged yet. Deliberately specific about
 * what is and isn't lost: the captures survive in `localStorage` and are restored if the
 * user comes back to the same day, but nothing reaches the backend — no session, no XP —
 * until the workout is finished.
 */
function ExitWorkoutDialog({
  completedSets,
  totalSets,
  onStay,
  onLeave,
}: {
  completedSets: number;
  totalSets: number;
  onStay: () => void;
  onLeave: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onStay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStay]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ background: 'rgba(6,34,77,0.45)' }}
      onClick={onStay}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Leave this workout?"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-[24px] p-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--bg-subtle)' }}
          >
            <AlertTriangle size={18} color="var(--forma-danger)" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
              Leave this workout?
            </div>
            <p className="mt-1.5 text-[13.5px] leading-[1.55]" style={{ color: 'var(--text-secondary)' }}>
              Nothing is logged until you finish, so the {completedSets} of {totalSets} sets you
              have done won&rsquo;t count and no XP is awarded. We&rsquo;ll keep them on this device
              if you come back today.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2.5">
          <Button fullWidth onClick={onStay}>
            Keep going
          </Button>
          <Button variant="ghost" fullWidth onClick={onLeave}>
            <span style={{ color: 'var(--forma-danger)' }}>Leave workout</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The coach's plan for the whole session. Shown once on start and thereafter on
 * demand from the header, so the same paragraph doesn't sit above every exercise.
 */
function SessionNoteDialog({ text, onClose }: { text: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ background: 'rgba(6,34,77,0.45)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Coach's plan for this session"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-[24px] p-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--bg-selected)' }}
          >
            <Sparkles size={18} color="var(--text-on-mint)" />
          </div>
          <div className="min-w-0 flex-1">
            <Eyebrow>Coach&rsquo;s plan today</Eyebrow>
            <p className="mt-1.5 text-[14px] leading-[1.55]" style={{ color: 'var(--text-secondary)' }}>
              {text}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)' }}
          >
            <X size={16} color="var(--text-secondary)" />
          </button>
        </div>
        <Button fullWidth className="mt-5" onClick={onClose}>
          Let&rsquo;s go
        </Button>
      </div>
    </div>
  );
}

/**
 * A timed / hold set with a countdown stopwatch. Uses a wall-clock deadline so the
 * countdown stays accurate across screen-lock / tab-backgrounding (JS timers throttle
 * or stall there). Auto-marks the set complete when the countdown reaches zero.
 */
function TimedSetRow({
  index,
  label = 'Hold',
  durationSeconds,
  completed,
  onToggle,
  onComplete,
}: {
  index: number;
  label?: string;
  durationSeconds: number;
  completed: boolean;
  onToggle: () => void;
  onComplete: () => void;
}) {
  type Status = 'idle' | 'running' | 'paused' | 'done';
  const [status, setStatus] = useState<Status>('idle');
  const [remaining, setRemaining] = useState(durationSeconds);
  const endsAtRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const evaluate = useCallback(() => {
    const endsAt = endsAtRef.current;
    if (endsAt == null) return;
    const next = Math.max(0, (endsAt - Date.now()) / 1000);
    setRemaining(next);
    if (next <= 0 && !firedRef.current) {
      firedRef.current = true;
      endsAtRef.current = null;
      setStatus('done');
      onCompleteRef.current();
    }
  }, []);

  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(evaluate, 200);
    const onVisible = () => {
      if (document.visibilityState === 'visible') evaluate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status, evaluate]);

  const toggleTimer = useCallback(() => {
    if (status === 'running') {
      const endsAt = endsAtRef.current;
      if (endsAt != null) setRemaining(Math.max(0, (endsAt - Date.now()) / 1000));
      endsAtRef.current = null;
      setStatus('paused');
    } else {
      // (re)start from whatever is on the clock
      const from = status === 'idle' ? durationSeconds : remaining;
      firedRef.current = false;
      endsAtRef.current = Date.now() + from * 1000;
      setRemaining(from);
      setStatus('running');
    }
  }, [status, remaining, durationSeconds]);

  const reset = useCallback(() => {
    endsAtRef.current = null;
    firedRef.current = false;
    setRemaining(durationSeconds);
    setStatus('idle');
  }, [durationSeconds]);

  const isRunning = status === 'running';
  const progress = durationSeconds > 0 ? Math.min(1, Math.max(0, (durationSeconds - remaining) / durationSeconds)) : 0;
  const displaySeconds = Math.ceil(Math.max(0, remaining));

  return (
    <div
      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
      style={{
        background: completed ? 'var(--bg-selected)' : 'var(--bg-subtle)',
        border: `1px solid ${completed ? 'var(--accent)' : 'var(--border-base)'}`,
      }}
    >
      <span
        className="tabular w-12 text-[12px] font-bold"
        style={{ color: completed ? 'var(--text-on-mint)' : 'var(--text-muted)' }}
      >
        {label}
      </span>

      <div className="flex flex-1 items-center gap-3">
        <button
          onClick={toggleTimer}
          disabled={completed}
          aria-label={isRunning ? 'Pause timer' : status === 'idle' ? 'Start timer' : 'Resume timer'}
          className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 disabled:opacity-40"
          style={{
            background: isRunning ? 'var(--bg-surface)' : 'var(--accent)',
            border: isRunning ? '1.5px solid var(--accent)' : 'none',
          }}
        >
          {isRunning ? (
            <Pause size={15} color="var(--accent-text)" strokeWidth={2.4} fill="var(--accent-text)" />
          ) : (
            <Play size={15} color="#06224D" strokeWidth={2.4} fill="#06224D" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          {/* A completed row sits on the mint fill, which the theme text tokens can't read on. */}
          <div
            className="tabular text-[15px] font-extrabold"
            style={{
              color: completed
                ? 'var(--text-on-mint)'
                : status === 'paused'
                  ? 'var(--text-muted)'
                  : 'var(--text-primary)',
            }}
          >
            {formatClock(displaySeconds)}
          </div>
          <div
            className="mt-0.5 h-1 overflow-hidden rounded-full"
            style={{ background: completed ? 'var(--border-on-mint)' : 'var(--border-base)' }}
          >
            <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: 'var(--accent)' }} />
          </div>
        </div>

        {status === 'paused' || (completed && status !== 'idle') ? (
          <button
            onClick={reset}
            aria-label="Reset timer"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
            style={
              completed
                ? { background: 'var(--bg-on-mint)', border: '1px solid var(--border-on-mint)' }
                : { background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }
            }
          >
            <RotateCcw size={13} color={completed ? 'var(--text-on-mint)' : 'var(--text-secondary)'} />
          </button>
        ) : null}
      </div>

      <button
        onClick={onToggle}
        aria-label={completed ? 'Mark hold incomplete' : 'Mark hold complete'}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-transform active:scale-90"
        style={{
          background: completed ? 'var(--accent)' : 'transparent',
          border: completed ? 'none' : '1.5px solid var(--border-strong)',
        }}
      >
        {completed ? <Check size={16} color="#06224D" strokeWidth={3} /> : null}
      </button>

      <span className="sr-only">Set {index + 1}</span>
    </div>
  );
}

/**
 * The list-view row for a reported (not tracked) block: cardio and class. Captures the
 * actuals inline so the single-page view stays a single page.
 */
function CaptureRow({
  block,
  onCapture,
  onToggle,
}: {
  block: Block;
  onCapture: (patch: { durationSeconds?: number; distanceKm?: number }) => void;
  onToggle: () => void;
}) {
  const set = block.sets[0];
  const completed = set?.completed ?? false;
  const seconds = set?.durationSeconds ?? 0;
  const distanceKm = set?.distanceKm ?? 0;

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5"
      style={{
        background: completed ? 'var(--bg-selected)' : 'var(--bg-subtle)',
        border: `1px solid ${completed ? 'var(--accent)' : 'var(--border-base)'}`,
      }}
    >
      <div className="flex flex-1 flex-wrap items-center gap-4">
        {block.type === 'cardio' ? (
          <Stepper
            label="km"
            entryLabel="Distance in km"
            value={distanceKm}
            decimals={2}
            onMint={completed}
            onStep={(dir) => onCapture({ distanceKm: Math.max(0, roundTo(distanceKm + dir * 0.5, 2)) })}
            onSet={(km) => onCapture({ distanceKm: km })}
          />
        ) : null}
        {block.type === 'cardio' ? (
          // A run's time is exact (32:45), so it is typed as a clock time, not minutes.
          <TimeStepper
            seconds={seconds}
            onMint={completed}
            onChange={(next) => onCapture({ durationSeconds: next })}
          />
        ) : (
          <Stepper
            label="min"
            entryLabel="Class length in minutes"
            value={Math.round(seconds / 60)}
            onMint={completed}
            onStep={(dir, scale) => onCapture({ durationSeconds: stepValue(Math.round(seconds / 60), dir, scale) * 60 })}
            onSet={(mins) => onCapture({ durationSeconds: mins * 60 })}
          />
        )}
      </div>

      <button
        onClick={onToggle}
        aria-label={completed ? 'Mark not done' : 'Mark done'}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-transform active:scale-90"
        style={{
          background: completed ? 'var(--accent)' : 'transparent',
          border: completed ? 'none' : '1.5px solid var(--border-strong)',
        }}
      >
        {completed ? <Check size={16} color="#06224D" strokeWidth={3} /> : null}
      </button>
    </div>
  );
}

/**
 * Compact ± stepper for the list rows. The number itself is typeable (tap it); ± taps
 * step once and hold to repeat. `onMint` is for a completed row: the mint fill is the
 * same in both themes, so it reads from the on-mint tokens instead of the theme ones.
 */
function Stepper({
  label,
  entryLabel,
  value,
  decimals = 0,
  bigStep,
  onMint = false,
  onStep,
  onSet,
}: {
  label: string;
  /** Accessible name for the typed field, e.g. "Set 2 weight in kg". */
  entryLabel: string;
  value: number;
  decimals?: number;
  /** Step size once a hold runs long (weights: 5). */
  bigStep?: number;
  onMint?: boolean;
  onStep: (direction: 1 | -1, scale: number) => void;
  onSet: (value: number) => void;
}) {
  const dec = useHoldRepeat((scale) => onStep(-1, scale), { bigStep });
  const inc = useHoldRepeat((scale) => onStep(1, scale), { bigStep });
  return (
    <StepperFrame
      label={label}
      decLabel={`Decrease ${label}`}
      incLabel={`Increase ${label}`}
      dec={dec}
      inc={inc}
      onMint={onMint}
    >
      <NumberEntry
        value={value}
        decimals={decimals}
        onCommit={onSet}
        label={entryLabel}
        fill
        className="text-[16px] leading-tight"
        color={onMint ? 'var(--text-on-mint)' : 'var(--text-primary)'}
      />
    </StepperFrame>
  );
}

/** A clock-time capture (run/walk/ride): ± whole minutes, tap the time to type it exactly. */
function TimeStepper({
  seconds,
  onMint = false,
  onChange,
}: {
  seconds: number;
  onMint?: boolean;
  onChange: (seconds: number) => void;
}) {
  const dec = useHoldRepeat((scale) => onChange(Math.max(0, seconds - 60 * scale)), { bigStep: 5 });
  const inc = useHoldRepeat((scale) => onChange(seconds + 60 * scale), { bigStep: 5 });
  return (
    <StepperFrame label="time" decLabel="Decrease time by a minute" incLabel="Increase time by a minute" dec={dec} inc={inc} onMint={onMint}>
      <DurationEntry
        label="Time"
        seconds={seconds}
        onCommit={onChange}
        className="text-[15px] leading-tight"
        style={onMint ? { color: 'var(--text-on-mint)' } : undefined}
      />
    </StepperFrame>
  );
}

function StepperFrame({
  label,
  decLabel,
  incLabel,
  dec,
  inc,
  onMint,
  children,
}: {
  label: string;
  decLabel: string;
  incLabel: string;
  dec: ReturnType<typeof useHoldRepeat>;
  inc: ReturnType<typeof useHoldRepeat>;
  onMint: boolean;
  children: ReactNode;
}) {
  const buttonStyle = onMint
    ? { background: 'var(--bg-on-mint)', border: '1px solid var(--border-on-mint)' }
    : { background: 'var(--bg-surface)', border: '1px solid var(--border-base)' };
  const iconColor = onMint ? 'var(--text-on-mint)' : 'var(--text-secondary)';
  return (
    <div className="flex min-w-0 items-center justify-between gap-1 sm:justify-start sm:gap-1.5">
      <button
        {...dec}
        aria-label={decLabel}
        className="flex h-7 w-7 flex-shrink-0 select-none items-center justify-center rounded-lg"
        style={buttonStyle}
      >
        <Minus size={13} color={iconColor} />
      </button>
      {/* Half a phone row is too narrow for "107.5 kg" inline, so the unit drops under
          the number below `sm`. */}
      <div className="flex min-w-0 flex-1 flex-col items-center whitespace-nowrap text-center sm:flex-row sm:items-baseline sm:gap-1 sm:min-w-[60px] sm:flex-none">
        {children}
        <span className="text-[10.5px] leading-tight sm:text-[11px]" style={{ color: onMint ? 'var(--text-on-mint-soft)' : 'var(--text-muted)' }}>
          {label}
        </span>
      </div>
      <button
        {...inc}
        aria-label={incLabel}
        className="flex h-7 w-7 flex-shrink-0 select-none items-center justify-center rounded-lg"
        style={buttonStyle}
      >
        <Plus size={13} color={iconColor} />
      </button>
    </div>
  );
}
