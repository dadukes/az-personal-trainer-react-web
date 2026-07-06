import { Check, ChevronLeft, Clock, Dumbbell, Minus, Plus, Trophy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

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
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

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
  repTarget: number;
  weight: number;
  weightUnit: WeightUnit;
  notes?: string;
  sets: SetActual[];
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
      const timed = ex.duration_seconds != null && (ex.reps == null || ex.reps === '');
      const repTarget = parseRepTarget(ex.reps);
      const weight = ex.target_weight ?? ex.last_performance?.weight ?? 0;
      blocks.push({
        key: `${section}-${i}-${ex.name}`,
        name: ex.name,
        exercise_id: ex.exercise_id,
        section,
        timed,
        durationSeconds: ex.duration_seconds,
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

function sectionLabel(section: WorkoutSection): string {
  return section === 'warmup' ? 'Warm-up' : section === 'cooldown' ? 'Cool-down' : 'Main';
}

function formatClock(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function WorkoutSessionPage() {
  const { day } = useParams<{ day: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { profile, addXp } = useAppStore();
  const unit: WeightUnit = profile.preferred_unit_system === 'imperial' ? 'lb' : 'kg';
  const dayKey = resolveDayKey(day);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [planId, setPlanId] = useState<string | undefined>();
  const [dayNotes, setDayNotes] = useState<string | undefined>();
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [xpEarned, setXpEarned] = useState<number | null>(null);
  const startedAtRef = useRef(new Date());

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
        setBlocks(dp && !dp.is_rest_day ? buildBlocks(dp, unit) : []);
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

  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [finished]);

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
    try {
      const result = await logWorkout(session.access_token, {
        plan_id: planId,
        day: dayKey,
        started_at: startedAtRef.current.toISOString(),
        completed_at: new Date().toISOString(),
        duration_seconds: elapsed,
        exercises: loggedExercises,
      });
      setXpEarned(result.xp_earned);
      addXp(result.xp_earned);
    } catch {
      // logWorkout falls back internally
    } finally {
      setSaving(false);
    }
  }, [session, blocks, planId, dayKey, elapsed, addXp]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--bg-app)' }}>
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
        <div className="flex h-20 w-20 items-center justify-center rounded-full" style={{ background: 'var(--forma-mint)' }}>
          <Trophy size={38} color="#F5C542" />
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
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 p-5 pb-32 sm:p-8">
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
              {block.notes ? (
                <div className="mt-0.5 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                  {block.notes}
                </div>
              ) : null}
            </div>
            <Badge tone="neutral">{sectionLabel(block.section)}</Badge>
          </div>

          <div className="flex flex-col gap-2">
            {block.sets.map((set, si) => (
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
                  {block.timed ? 'Hold' : `Set ${si + 1}`}
                </span>

                {block.timed ? (
                  <span className="tabular flex-1 text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {block.durationSeconds ?? 30}s
                  </span>
                ) : (
                  <div className="flex flex-1 items-center gap-4">
                    <Stepper
                      label="reps"
                      value={set.reps}
                      onDelta={(d) => mutateSet(bi, si, { reps: Math.max(0, set.reps + d) })}
                    />
                    <Stepper
                      label={block.weightUnit}
                      value={set.weight}
                      step={block.weightUnit === 'kg' ? 2.5 : 5}
                      onDelta={(d) => mutateSet(bi, si, { weight: Math.max(0, Math.round((set.weight + d) * 10) / 10) })}
                    />
                  </div>
                )}

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
            ))}
          </div>
        </Card>
      ))}

      {/* Sticky finish bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 px-5 py-4 md:left-[264px]"
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
