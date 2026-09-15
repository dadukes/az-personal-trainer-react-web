import {
  Bike,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Dumbbell,
  Footprints,
  Link2,
  Mountain,
  Play,
  Plus,
  Sailboat,
  Shuffle,
  StretchHorizontal,
  Timer,
  Users,
  Waves,
  Zap,
} from 'lucide-react';
import { useEffect, useState, type ComponentType } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import FindAlternativeDialog from '@/components/FindAlternativeDialog';
import { Badge, Button, Card, Eyebrow } from '@/components/ui';
import { getWorkoutPlan, updatePlanDay, type DashboardExercise } from '@/lib/api';
import {
  exerciseIconKey,
  exerciseMeta,
  isCatalogExercise,
  resolveExerciseType,
  swapPlanExercise,
  type ExerciseIconKey,
} from '@/lib/exercise';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore, type PlanSection } from '@/store/useAppStore';

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const SECTIONS: { key: PlanSection; label: string; field: 'warmup' | 'exercises' | 'cooldown' }[] = [
  { key: 'warmup', label: 'Warm-up', field: 'warmup' },
  { key: 'main', label: 'Main', field: 'exercises' },
  { key: 'cooldown', label: 'Cool-down', field: 'cooldown' },
];

function resolveDayKey(param?: string): string {
  if (param && DAY_KEYS.includes(param)) return param;
  return DAY_KEYS[new Date().getDay()];
}

/** Semantic icon key → lucide component. Lets the day scan by movement kind at a glance. */
const ICONS: Record<ExerciseIconKey, ComponentType<{ size?: number; color?: string }>> = {
  dumbbell: Dumbbell,
  timer: Timer,
  stretch: StretchHorizontal,
  class: Users,
  run: Footprints,
  cycle: Bike,
  swim: Waves,
  row: Sailboat,
  walk: Footprints,
  hike: Mountain,
  other: Footprints,
};

function ExerciseRow({
  ex,
  index,
  count,
  onOpen,
  onMove,
  onSwap,
}: {
  ex: DashboardExercise;
  index: number;
  count: number;
  onOpen: () => void;
  onMove: (direction: -1 | 1) => void;
  onSwap: () => void;
}) {
  const type = resolveExerciseType(ex);
  const subtitle = ex.target_muscle ?? ex.body_part;
  const Icon = ICONS[exerciseIconKey(ex)];
  // Cardio and class are never catalog-matched, so the "not linked to ExerciseDB"
  // warning would fire on every run — it is only meaningful for trackable movements.
  const showUnlinkedWarning = isCatalogExercise(type) && !ex.exercise_id;
  return (
    <div
      className="flex items-center gap-2 rounded-xl px-3 py-2.5"
      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)' }}
    >
      {count > 1 ? (
        <div className="flex flex-col">
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move up"
            className="flex h-5 w-5 items-center justify-center rounded disabled:opacity-25"
          >
            <ChevronUp size={15} color="var(--text-muted)" />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            aria-label="Move down"
            className="flex h-5 w-5 items-center justify-center rounded disabled:opacity-25"
          >
            <ChevronUp size={15} color="var(--text-muted)" style={{ transform: 'rotate(180deg)' }} />
          </button>
        </div>
      ) : null}

      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
        >
          <Icon size={15} color="var(--text-secondary)" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>
              {type === 'class' ? (ex.class_name ?? ex.name) : ex.name}
            </span>
            {showUnlinkedWarning ? (
              <Link2 size={13} color="var(--forma-danger)" aria-label="Not linked to ExerciseDB" />
            ) : null}
          </div>
          {/* Below `sm` the target rides under the name: with the swap button in the row,
              an inline "30s hold each side" left no room for the name at all. */}
          <div className="mt-0.5 truncate text-[12px]" style={{ color: 'var(--text-muted)' }}>
            <span className="tabular font-semibold sm:hidden" style={{ color: 'var(--text-secondary)' }}>
              {exerciseMeta(ex)}
              {subtitle ? ' · ' : ''}
            </span>
            {subtitle ? <span className="capitalize">{subtitle}</span> : null}
          </div>
        </div>
        <span className="tabular hidden flex-shrink-0 text-[13px] font-semibold sm:inline" style={{ color: 'var(--text-secondary)' }}>
          {exerciseMeta(ex)}
        </span>
        <ChevronRight size={18} color="var(--text-muted)" className="flex-shrink-0" />
      </button>

      {/* Swapping is the most common edit, so it doesn't need a trip into the detail page. */}
      {isCatalogExercise(type) ? (
        <button
          onClick={onSwap}
          aria-label={`Find an alternative to ${ex.name}`}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-transform active:scale-90"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
        >
          <Shuffle size={15} color="var(--accent-text)" />
        </button>
      ) : null}
    </div>
  );
}

export default function PlanDayPage() {
  const { day } = useParams<{ day: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const dayKey = resolveDayKey(day);
  const { planDraft, initPlanDraft, addDraftExercise, moveDraftExercise, replaceDraftExercise, markPlanSaved } =
    useAppStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState<{ section: PlanSection; index: number } | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!session?.access_token) {
        setError('You need to be signed in to view your plan.');
        setLoading(false);
        return;
      }
      try {
        const result = await getWorkoutPlan(session.access_token);
        if (!active) return;
        const plan = result.plan;
        const dp = plan?.plan?.[dayKey] ?? { is_rest_day: true };
        initPlanDraft(plan?.id, dayKey, dp);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load your plan.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [session, dayKey, initPlanDraft]);

  const dayPlan = planDraft?.day === dayKey ? planDraft.dayPlan : null;
  const isRest = !dayPlan || dayPlan.is_rest_day;
  const dirty = planDraft?.dirty ?? false;
  const canSave = Boolean(planDraft?.planId);
  const swapExercise = swapTarget
    ? dayPlan?.[SECTIONS.find((s) => s.key === swapTarget.section)!.field]?.[swapTarget.index]
    : undefined;

  const handleAdd = (section: PlanSection) => {
    const field = SECTIONS.find((s) => s.key === section)!.field;
    const nextIndex = dayPlan?.[field]?.length ?? 0;
    addDraftExercise(section, { name: 'New exercise', type: 'reps', sets: 3, reps: '10' });
    navigate(`/plan/${dayKey}/exercise/${section}/${nextIndex}`);
  };

  const handleSave = async () => {
    if (!session?.access_token || !planDraft?.planId || !dayPlan) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await updatePlanDay(session.access_token, planDraft.planId, dayKey, dayPlan);
      markPlanSaved(result.plan);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 p-5 pb-28 sm:p-8 sm:pb-28">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
        >
          <ChevronLeft size={20} color="var(--text-secondary)" />
        </button>
        <div className="flex-1">
          <Eyebrow>Plan your day</Eyebrow>
          <div className="text-[24px] font-extrabold capitalize" style={{ color: 'var(--text-primary)' }}>
            {dayKey}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : error ? (
        <Card>
          <p className="text-[14px]" style={{ color: 'var(--forma-danger)' }}>
            {error}
          </p>
        </Card>
      ) : (
        <>
          <div className="rounded-[24px] p-1" style={{ background: 'var(--forma-aqua)' }}>
            <div className="rounded-[20px] px-6 py-5" style={{ background: 'var(--forma-navy)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold tracking-[0.08em]" style={{ color: 'var(--forma-mint)' }}>
                    {isRest ? 'REST DAY' : 'FOCUS'}
                  </div>
                  <div className="my-1 text-[22px] font-extrabold text-white">
                    {isRest ? 'Nothing scheduled' : dayPlan?.focus ?? 'Workout'}
                  </div>
                  <div className="flex items-center gap-1.5 text-[13px]" style={{ color: '#C9F0E6' }}>
                    <Calendar size={13} color="#C9F0E6" />
                    <span>
                      {dayPlan?.estimated_duration_minutes ? `${dayPlan.estimated_duration_minutes} mins` : 'Flexible'}
                    </span>
                  </div>
                </div>
                {!isRest ? (
                  <button
                    onClick={() => navigate(`/workout/${dayKey}`)}
                    aria-label="Start workout"
                    className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
                    // The hero is navy in both themes, so the button can't use a surface
                    // token — in dark that is near-black on navy. Same aqua as Home's CTA.
                    style={{ background: 'var(--forma-aqua)', boxShadow: '0 6px 18px rgba(52,210,193,0.35)' }}
                  >
                    <Play size={22} color="var(--forma-navy)" fill="var(--forma-navy)" style={{ marginLeft: 2 }} />
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {dayPlan?.ai_notes ? (
            <Card variant="subtle" padding="14px 16px">
              <div className="flex items-start gap-2.5">
                <Zap size={16} color="#34D2C1" className="mt-0.5 flex-shrink-0" />
                <div>
                  <Badge tone="mint" className="mb-1.5">
                    Coach note
                  </Badge>
                  <p className="text-[13.5px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                    {dayPlan.ai_notes}
                  </p>
                </div>
              </div>
            </Card>
          ) : null}

          {SECTIONS.map(({ key, label, field }) => {
            const items = dayPlan?.[field] ?? [];
            return (
              <div key={key}>
                <div className="mb-2.5 flex items-center justify-between">
                  <Eyebrow>{label}</Eyebrow>
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((ex, i) => (
                    <ExerciseRow
                      key={`${key}-${i}-${ex.name}`}
                      ex={ex}
                      index={i}
                      count={items.length}
                      onOpen={() => navigate(`/plan/${dayKey}/exercise/${key}/${i}`)}
                      onMove={(dir) => moveDraftExercise(key, i, dir)}
                      onSwap={() => setSwapTarget({ section: key, index: i })}
                    />
                  ))}
                  <button
                    onClick={() => handleAdd(key)}
                    className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold"
                    style={{ border: '1px dashed var(--border-strong)', color: 'var(--text-secondary)' }}
                  >
                    <Plus size={15} /> Add exercise
                  </button>
                </div>
              </div>
            );
          })}

          {!canSave ? (
            <p className="text-center text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              No active plan for this day yet — ask your coach to generate one before editing.
            </p>
          ) : null}

          {!isRest ? (
            <Button
              size="lg"
              variant="secondary"
              fullWidth
              onClick={() => navigate(`/workout/${dayKey}`)}
              leftIcon={<Play size={16} color="var(--accent-text)" fill="var(--accent-text)" />}
            >
              Start workout
            </Button>
          ) : null}
        </>
      )}

      {swapTarget && swapExercise ? (
        <FindAlternativeDialog
          accessToken={session?.access_token}
          name={swapExercise.name}
          exerciseId={swapExercise.exercise_id}
          onClose={() => setSwapTarget(null)}
          onPick={(pick) => {
            // A draft edit like any other — it persists with "Save changes".
            replaceDraftExercise(swapTarget.section, swapTarget.index, swapPlanExercise(swapExercise, pick));
            setSwapTarget(null);
          }}
        />
      ) : null}

      {/* Sticky save bar — appears when there are unsaved edits. */}
      {dirty && canSave ? (
        <div
          className="fixed inset-x-0 bottom-[calc(74px+env(safe-area-inset-bottom))] z-30 px-5 py-4 md:bottom-0 md:left-[88px] lg:left-[264px]"
          style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-base)' }}
        >
          <div className="mx-auto flex max-w-[760px] items-center gap-3">
            <div className="flex-1 text-[13px] font-semibold" style={{ color: saveError ? 'var(--forma-danger)' : 'var(--text-secondary)' }}>
              {saveError ?? 'You have unsaved changes.'}
            </div>
            <Button size="md" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
