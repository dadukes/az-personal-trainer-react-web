import { Check, ChevronLeft, Clock, Dumbbell, Minus, Pause, Play, Plus, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import Confetti from '@/components/Confetti';
import { Badge, Button, Card, Eyebrow } from '@/components/ui';
import {
  getDashboard,
  logWorkout,
  type DashboardDayPlan,
  type DashboardExercise,
  type LoggedExercise,
  type WeightUnit,
  type WorkoutSection,
} from '@/lib/api';
import { isTimedExercise } from '@/lib/exercise';
import { dateForDayKey } from '@/lib/workout';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SESSION_KEY = 'forma:workout-session';

function resolveDayKey(param?: string): string {
  if (param && DAY_KEYS.includes(param)) return param;
  return DAY_KEYS[new Date().getDay()];
}

interface SetActual {
  reps: number;
  weight: number;
  completed: boolean;
}

interface Block {
  key: string;
  name: string;
  exercise_id?: string;
  section: WorkoutSection;
  timed: boolean;
  durationSeconds?: number;
  repText?: string;
  repTarget: number;
  weight: number;
  weightUnit: WeightUnit;
  notes?: string;
  sets: SetActual[];
}

/** Only the mutable per-set progress is persisted; block structure is rebuilt from the plan. */
interface PersistedSession {
  planId?: string;
  dayKey: string;
  startedAt: string;
  signature: string;
  sets: SetActual[][];
}

function parseRepTarget(reps?: string): number {
  if (!reps) return 10;
  const m = /\d+/.exec(reps);
  return m ? Number(m[0]) : 10;
}

function buildBlocks(dayPlan: DashboardDayPlan, unit: WeightUnit): Block[] {
  const sections: [WorkoutSection, DashboardExercise[] | undefined][] = [
    ['warmup', dayPlan.warmup],
    ['main', dayPlan.exercises],
    ['cooldown', dayPlan.cooldown],
  ];
  const blocks: Block[] = [];
  sections.forEach(([section, list]) => {
    (list ?? []).forEach((ex, i) => {
      const setCount = Math.max(1, ex.sets ?? 1);
      // The backend fills `reps` with a descriptive string even for holds/carries
      // (e.g. "30s hold", "45s walk", "3 minutes"), so `duration_seconds` is the
      // reliable timed signal — pure rep-based exercises have no duration.
      const timed = isTimedExercise(ex);
      const repTarget = parseRepTarget(ex.reps);
      const weight = ex.target_weight ?? ex.last_performance?.weight ?? 0;
      blocks.push({
        key: `${section}-${i}-${ex.name}`,
        name: ex.name,
        exercise_id: ex.exercise_id,
        section,
        timed,
        durationSeconds: ex.duration_seconds,
        repText: ex.reps,
        repTarget,
        weight,
        weightUnit: (ex.weight_unit as WeightUnit) ?? unit,
        notes: ex.notes,
        sets: Array.from({ length: setCount }, () => ({
          reps: repTarget,
          weight,
          completed: false,
        })),
      });
    });
  });
  return blocks;
}

/** Structural fingerprint used to decide whether a persisted session still matches the plan. */
function signatureOf(blocks: Block[]): string {
  return blocks.map((b) => `${b.key}:${b.sets.length}`).join('|');
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

function sectionLabel(section: WorkoutSection): string {
  return section === 'warmup' ? 'Warm-up' : section === 'cooldown' ? 'Cool-down' : 'Main';
}

function formatClock(total: number): string {
  const t = Math.max(0, Math.floor(total));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
  const restoredRef = useRef(false);

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

  // Persist captured progress so nothing is lost when the screen goes inactive.
  useEffect(() => {
    if (!restoredRef.current || finished || !startedAt || blocks.length === 0) return;
    const payload: PersistedSession = {
      planId,
      dayKey,
      startedAt: startedAt.toISOString(),
      signature: signatureOf(blocks),
      sets: blocks.map((b) => b.sets),
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

  const finish = useCallback(async () => {
    setFinished(true);
    clearPersisted();
    if (!session?.access_token) return;
    const loggedExercises: LoggedExercise[] = blocks.map((b) => ({
      exercise_id: b.exercise_id,
      name: b.name,
      section: b.section,
      sets: b.sets.map((s, i) => ({
        set_number: i + 1,
        reps: b.timed ? null : s.reps,
        weight: b.timed ? null : s.weight,
        weight_unit: b.timed ? null : b.weightUnit,
        duration_seconds: b.timed ? (b.durationSeconds ?? null) : null,
        completed: s.completed,
      })),
    }));
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
      <div className="flex h-full items-center justify-center" style={{ background: 'var(--bg-app)' }}>
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
        <Button size="lg" fullWidth onClick={() => navigate('/')}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 p-5 pb-40 sm:p-8 sm:pb-40">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
        >
          <ChevronLeft size={20} color="var(--text-secondary)" />
        </button>
        <div className="flex-1">
          <div className="text-[20px] font-extrabold capitalize" style={{ color: 'var(--text-primary)' }}>
            {dayKey}&rsquo;s workout
          </div>
          <div className="tabular mt-0.5 flex items-center gap-1.5 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
            <Clock size={13} /> {formatClock(elapsed)} · {completedSets}/{totalSets} sets
          </div>
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--bg-subtle)' }}>
        <div className="h-full rounded-full transition-[width]" style={{ width: `${progressPct}%`, background: 'var(--accent)' }} />
      </div>

      {dayNotes ? (
        <Card variant="subtle" padding="14px 16px">
          <Eyebrow className="mb-1">Session note</Eyebrow>
          <p className="text-[13.5px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
            {dayNotes}
          </p>
        </Card>
      ) : null}

      {blocks.map((block, bi) => (
        <Card key={block.key} padding="18px">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>
                {block.name}
              </div>
              {block.timed && block.repText ? (
                <div className="mt-0.5 text-[12.5px] font-semibold" style={{ color: 'var(--accent-text)' }}>
                  {block.repText}
                </div>
              ) : null}
              {block.notes ? (
                <div className="mt-0.5 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                  {block.notes}
                </div>
              ) : null}
            </div>
            <Badge tone="neutral">{sectionLabel(block.section)}</Badge>
          </div>

          <div className="flex flex-col gap-2">
            {block.sets.map((set, si) =>
              block.timed ? (
                <TimedSetRow
                  key={si}
                  index={si}
                  durationSeconds={block.durationSeconds ?? 30}
                  completed={set.completed}
                  onToggle={() => mutateSet(bi, si, { completed: !set.completed })}
                  onComplete={() => mutateSet(bi, si, { completed: true })}
                />
              ) : (
                <div
                  key={si}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                  style={{
                    background: set.completed ? 'var(--bg-selected)' : 'var(--bg-subtle)',
                    border: `1px solid ${set.completed ? 'var(--accent)' : 'var(--border-base)'}`,
                  }}
                >
                  <span
                    className="tabular w-12 text-[12px] font-bold"
                    style={{ color: set.completed ? 'var(--text-on-mint)' : 'var(--text-muted)' }}
                  >
                    {`Set ${si + 1}`}
                  </span>

                  <div className="flex flex-1 items-center gap-4">
                    <Stepper
                      label="reps"
                      value={set.reps}
                      step={1}
                      onDelta={(d) => mutateSet(bi, si, { reps: Math.max(0, Math.round(set.reps + d)) })}
                    />
                    <Stepper
                      label={block.weightUnit}
                      value={set.weight}
                      step={block.weightUnit === 'kg' ? 2.5 : 5}
                      onDelta={(d) => mutateSet(bi, si, { weight: Math.max(0, Math.round((set.weight + d) * 10) / 10) })}
                    />
                  </div>

                  <button
                    onClick={() => mutateSet(bi, si, { completed: !set.completed })}
                    aria-label={set.completed ? 'Mark set incomplete' : 'Mark set complete'}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-transform active:scale-90"
                    style={{
                      background: set.completed ? 'var(--accent)' : 'transparent',
                      border: set.completed ? 'none' : '1.5px solid var(--border-strong)',
                    }}
                  >
                    {set.completed ? <Check size={16} color="#06224D" strokeWidth={3} /> : null}
                  </button>
                </div>
              ),
            )}
          </div>
        </Card>
      ))}

      {/* Sticky finish bar — sits above the mobile tab bar (bottom-[74px]) so it stays reachable. */}
      <div
        className="fixed inset-x-0 bottom-[74px] z-30 px-5 py-4 md:bottom-0 md:left-[88px] lg:left-[264px]"
        style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-base)' }}
      >
        <div className="mx-auto flex max-w-[760px] items-center gap-3">
          <div className="tabular flex-1 text-[13px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            {completedSets}/{totalSets} sets · {formatClock(elapsed)}
          </div>
          <Button size="lg" onClick={finish} leftIcon={<Dumbbell size={16} color="#06224D" />}>
            Finish workout
          </Button>
        </div>
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
  durationSeconds,
  completed,
  onToggle,
  onComplete,
}: {
  index: number;
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
        Hold
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
          <div
            className="tabular text-[15px] font-extrabold"
            style={{ color: status === 'paused' ? 'var(--text-muted)' : 'var(--text-primary)' }}
          >
            {formatClock(displaySeconds)}
          </div>
          <div className="mt-0.5 h-1 overflow-hidden rounded-full" style={{ background: 'var(--border-base)' }}>
            <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: 'var(--accent)' }} />
          </div>
        </div>

        {status === 'paused' || (completed && status !== 'idle') ? (
          <button
            onClick={reset}
            aria-label="Reset timer"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
          >
            <RotateCcw size={13} color="var(--text-secondary)" />
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

function Stepper({
  label,
  value,
  step = 1,
  onDelta,
}: {
  label: string;
  value: number;
  step?: number;
  onDelta: (delta: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onDelta(-step)}
        className="flex h-7 w-7 items-center justify-center rounded-lg"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
      >
        <Minus size={13} color="var(--text-secondary)" />
      </button>
      <div className="min-w-[52px] text-center">
        <span className="tabular text-[15px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
          {value}
        </span>
        <span className="ml-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
      </div>
      <button
        onClick={() => onDelta(step)}
        className="flex h-7 w-7 items-center justify-center rounded-lg"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
      >
        <Plus size={13} color="var(--text-secondary)" />
      </button>
    </div>
  );
}
