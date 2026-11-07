import {
  Bike,
  ChevronDown,
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
  Sparkles,
  StretchHorizontal,
  Timer,
  Users,
  Waves,
} from 'lucide-react';
import { useEffect, useState, type ComponentType } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import FindAlternativeDialog from '@/components/FindAlternativeDialog';
import { InfoSheet } from '@/components/LogbookView';
import { Button, Sheet, Surface } from '@/components/ui';
import { getWorkoutPlan, updatePlanDay, type DashboardExercise } from '@/lib/api';
import { splitFocus } from '@/lib/home';
import { lastDateForDayKey } from '@/lib/logbookPast';
import {
  exerciseIconKey,
  exerciseMeta,
  isCatalogExercise,
  resolveExerciseType,
  newPlanExercise,
  swapPlanExercise,
  type ExercisePick,
  type ExerciseIconKey,
  formatExerciseName,
  formatMuscle,
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

/** One exercise: name and target to read; in Edit, move buttons and a swap as well. */
function ExerciseRow({
  ex,
  index,
  count,
  editing,
  onOpen,
  onMove,
  onSwap,
}: {
  ex: DashboardExercise;
  index: number;
  count: number;
  editing: boolean;
  onOpen: () => void;
  onMove: (direction: -1 | 1) => void;
  onSwap: () => void;
}) {
  const type = resolveExerciseType(ex);
  const subtitle = ex.target_muscle ?? ex.body_part;
  const Icon = ICONS[exerciseIconKey(ex)];
  const name = type === 'class' ? (ex.class_name ?? ex.name) : formatExerciseName(ex.name);
  // Cardio and class are never catalog-matched, so the "not linked to ExerciseDB"
  // warning would fire on every run — it is only meaningful for trackable movements.
  const showUnlinkedWarning = editing && isCatalogExercise(type) && !ex.exercise_id;
  const moveButton = (direction: -1 | 1) => {
    const disabled = direction === -1 ? index === 0 : index === count - 1;
    const Chevron = direction === -1 ? ChevronUp : ChevronDown;
    return (
      <button
        type="button"
        onClick={() => onMove(direction)}
        disabled={disabled}
        aria-label={`Move ${name} ${direction === -1 ? 'up' : 'down'}`}
        className="flex h-8 w-9 items-center justify-center rounded-control disabled:opacity-30"
      >
        <Chevron size={18} color="var(--ink-2)" />
      </button>
    );
  };
  return (
    <div
      className={`flex min-h-16 items-center pr-2 ${editing && count > 1 ? 'pl-1' : 'pl-4'}`}
      style={{ borderTop: index === 0 ? undefined : '1px solid var(--line)' }}
    >
      {editing && count > 1 ? (
        <div className="flex flex-col">
          {moveButton(-1)}
          {moveButton(1)}
        </div>
      ) : null}

      <button type="button" onClick={onOpen} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2.5 text-left">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px]" style={{ background: 'var(--sunken)' }}>
          <Icon size={16} color="var(--ink-2)" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            <span className="text-[15px] font-semibold leading-5" style={{ color: 'var(--ink)' }}>
              {name}
            </span>
            {showUnlinkedWarning ? <Link2 size={13} color="var(--danger)" aria-label="Not linked to ExerciseDB" /> : null}
          </span>
          <span className="truncate text-[13px] leading-[18px]" style={{ color: 'var(--ink-3)' }}>
            <span className="tabular">{exerciseMeta(ex)}</span>
            {subtitle ? ` · ${formatMuscle(subtitle)}` : ''}
          </span>
        </span>
        {!editing ? <ChevronRight size={16} color="var(--ink-3)" className="flex-shrink-0" /> : null}
      </button>

      {/* Swapping is the most common edit, so it doesn't need a trip into the detail page. */}
      {editing && isCatalogExercise(type) ? (
        <button
          type="button"
          onClick={onSwap}
          aria-label={`Find an alternative to ${name}`}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-control transition-transform active:scale-90"
        >
          <Shuffle size={19} color="var(--teal)" />
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
  const { planDraft, initPlanDraft, addDraftExercise, moveDraftExercise, replaceDraftExercise, markPlanSaved, clearPlanDraft } =
    useAppStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState<{ section: PlanSection; index: number } | null>(null);
  // Reading, a click opens the exercise's info; the editor is only in Edit, where Save is.
  const [infoTarget, setInfoTarget] = useState<{ section: PlanSection; index: number } | null>(null);
  /** The day reads by default; reordering, swapping and adding happen in Edit. */
  const [editing, setEditing] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  /** Re-reads the plan, after throwing unsaved edits away. */
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [session, dayKey, initPlanDraft, reloadKey]);

  const dayPlan = planDraft?.day === dayKey ? planDraft.dayPlan : null;
  const isRest = !dayPlan || dayPlan.is_rest_day;
  const dirty = planDraft?.dirty ?? false;
  const canSave = Boolean(planDraft?.planId);
  const infoExercise = infoTarget
    ? dayPlan?.[SECTIONS.find((s) => s.key === infoTarget.section)!.field]?.[infoTarget.index]
    : undefined;
  const swapExercise = swapTarget
    ? dayPlan?.[SECTIONS.find((s) => s.key === swapTarget.section)!.field]?.[swapTarget.index]
    : undefined;

  // Edits left unsaved, on an earlier visit or in the exercise page, reopen in Edit, where Save is.
  useEffect(() => {
    if (dirty && planDraft?.day === dayKey) setEditing(true);
  }, [dirty, planDraft?.day, dayKey]);

  // Add asks what the exercise is first: a catalog pick brings its demo and how-to.
  const [addTarget, setAddTarget] = useState<PlanSection | null>(null);
  const handleAdd = (section: PlanSection) => setAddTarget(section);
  const addPicked = (section: PlanSection, pick: ExercisePick) => {
    const field = SECTIONS.find((s) => s.key === section)!.field;
    const nextIndex = dayPlan?.[field]?.length ?? 0;
    addDraftExercise(section, newPlanExercise(pick));
    setAddTarget(null);
    navigate(`/plan/${dayKey}/exercise/${section}/${nextIndex}`);
  };

  const handleSave = async () => {
    if (!session?.access_token || !planDraft?.planId || !dayPlan) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await updatePlanDay(session.access_token, planDraft.planId, dayKey, dayPlan);
      markPlanSaved(result.plan);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  };

  /** Leaving Edit: nothing to do without changes, otherwise keep or throw them away. */
  const finishEditing = () => {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    setEditing(false);
    setSaveError(null);
  };

  const discardChanges = () => {
    clearPlanDraft();
    setDiscardOpen(false);
    setEditing(false);
    setSaveError(null);
    setReloadKey((k) => k + 1);
  };

  const meta = [
    dayKey.charAt(0).toUpperCase() + dayKey.slice(1),
    !isRest && dayPlan?.estimated_duration_minutes ? `${dayPlan.estimated_duration_minutes} min` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const showFooter = !loading && !error && (editing || !isRest);

  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-5 px-4 pb-40 pt-4 sm:px-8 sm:pt-8">
      <div className="-mx-2.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="flex h-11 w-11 items-center justify-center rounded-control"
        >
          <ChevronLeft size={24} color="var(--ink)" />
        </button>
        {!loading && !error && canSave ? (
          <button
            type="button"
            onClick={editing ? finishEditing : () => setEditing(true)}
            className="min-h-11 px-2.5 text-[15px] font-bold"
            style={{ color: 'var(--teal)' }}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2" style={{ borderColor: 'var(--teal)', borderTopColor: 'transparent' }} />
        </div>
      ) : error ? (
        <Surface>
          <p className="m-0 text-[14px]" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        </Surface>
      ) : (
        <>
          <div className="-mt-2 flex flex-col gap-1.5">
            <span className="type-meta font-semibold" style={{ color: 'var(--ink-3)' }}>
              {meta}
            </span>
            <h1 className="type-display m-0" style={{ color: 'var(--ink)' }}>
              {isRest ? 'Rest day' : splitFocus(dayPlan?.focus).title}
            </h1>
            {!isRest && splitFocus(dayPlan?.focus).subtitle ? (
              <span className="text-[16px] font-medium leading-[22px]" style={{ color: 'var(--ink-2)' }}>
                {splitFocus(dayPlan?.focus).subtitle}
              </span>
            ) : null}
            {isRest && !editing ? (
              <p className="m-0 text-[15px] leading-[22px]" style={{ color: 'var(--ink-2)' }}>
                {canSave ? 'Nothing planned. Recovery is part of the plan.' : 'No plan yet. Ask your coach to suggest one.'}
              </p>
            ) : null}
          </div>

          {dayPlan?.ai_notes && !isRest ? (
            <p className="m-0 flex gap-2.5 text-[14.5px] leading-[21px]" style={{ color: 'var(--ink-2)' }}>
              <Sparkles size={18} color="var(--teal)" fill="var(--teal)" className="mt-0.5 flex-shrink-0" />
              <span>{dayPlan.ai_notes}</span>
            </p>
          ) : null}

          {SECTIONS.map(({ key, label, field }) => {
            const items = dayPlan?.[field] ?? [];
            // Reading, an empty section is left out; editing, it's where Add goes.
            if (items.length === 0 && !editing) return null;
            return (
              <section key={key} aria-label={label} className="flex flex-col gap-2.5">
                <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
                  {label}
                </h2>
                <Surface padding="0" className="overflow-hidden">
                  {items.map((ex, i) => (
                    <ExerciseRow
                      key={`${key}-${i}-${ex.name}`}
                      ex={ex}
                      index={i}
                      count={items.length}
                      editing={editing}
                      onOpen={() =>
                        editing ? navigate(`/plan/${dayKey}/exercise/${key}/${i}`) : setInfoTarget({ section: key, index: i })
                      }
                      onMove={(dir) => moveDraftExercise(key, i, dir)}
                      onSwap={() => setSwapTarget({ section: key, index: i })}
                    />
                  ))}
                  {editing ? (
                    <button
                      type="button"
                      onClick={() => handleAdd(key)}
                      aria-label={`Add an exercise to ${label.toLowerCase()}`}
                      className="flex min-h-[52px] w-full items-center justify-center gap-2 text-[14.5px] font-bold"
                      style={{ color: 'var(--teal)', borderTop: items.length > 0 ? '1px solid var(--line)' : undefined }}
                    >
                      <Plus size={17} strokeWidth={2.4} /> Add exercise
                    </button>
                  ) : null}
                </Surface>
              </section>
            );
          })}
        </>
      )}

      {/* Start, or Save while editing. It sits above the phone's tab bar, and beside the side nav. */}
      {showFooter ? (
        <div
          className="fixed inset-x-0 bottom-[calc(74px+env(safe-area-inset-bottom))] z-30 px-4 pb-3 pt-3 md:bottom-0 md:left-[88px] lg:left-[264px]"
          style={{ background: 'var(--ground)', borderTop: '1px solid var(--line)' }}
        >
          <div className="mx-auto flex max-w-[680px] flex-col gap-1 sm:px-4">
            {editing ? (
              <>
                {saveError ? (
                  <p className="m-0 mb-1.5 text-[13px] leading-[18px]" style={{ color: 'var(--danger)' }}>
                    {saveError}
                  </p>
                ) : null}
                <Button
                  variant="strong"
                  size="lg"
                  fullWidth
                  disabled={saving}
                  onClick={dirty ? () => void handleSave() : finishEditing}
                >
                  {saving ? 'Saving…' : dirty ? 'Save changes' : 'Done'}
                </Button>
              </>
            ) : (
              <>
                <Button size="lg" fullWidth leftIcon={<Play size={18} fill="var(--on-aqua)" />} onClick={() => navigate(`/workout/${dayKey}`)}>
                  Start workout
                </Button>
                <Button
                  variant="link"
                  fullWidth
                  style={{ height: 44 }}
                  onClick={() => navigate(`/workout/log?day=${dayKey}&date=${lastDateForDayKey(dayKey, new Date())}`)}
                >
                  Already did it? Log it
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {infoTarget && infoExercise ? (
        <InfoSheet
          block={{
            name: infoExercise.name,
            exercise_id: infoExercise.exercise_id,
            targetMuscle: infoExercise.target_muscle,
            notes: infoExercise.notes,
            cues: infoExercise.cues,
          }}
          detail={null}
          alternativeCount={infoExercise.alternatives?.length ?? 0}
          accessToken={session?.access_token}
          // A swap changes the plan, so it happens in Edit, where Save is.
          onAlternatives={
            canSave && infoExercise.type !== 'cardio' && infoExercise.type !== 'class'
              ? () => {
                  setEditing(true);
                  setSwapTarget(infoTarget);
                  setInfoTarget(null);
                }
              : undefined
          }
          onClose={() => setInfoTarget(null)}
        />
      ) : null}

      {swapTarget && swapExercise ? (
        <FindAlternativeDialog
          accessToken={session?.access_token}
          name={swapExercise.name}
          exerciseId={swapExercise.exercise_id}
          coachAlternatives={swapExercise.alternatives}
          onClose={() => setSwapTarget(null)}
          onPick={(pick) => {
            // A draft edit like any other — it persists with "Save changes".
            replaceDraftExercise(swapTarget.section, swapTarget.index, swapPlanExercise(swapExercise, pick));
            setSwapTarget(null);
          }}
        />
      ) : null}

      {addTarget ? (
        <FindAlternativeDialog
          accessToken={session?.access_token}
          name=""
          mode="add"
          title="What's the exercise?"
          subtitle="Picking one from the catalog brings its form demo and how-to. Not there? Use what you typed."
          onClose={() => setAddTarget(null)}
          onPick={(pick) => addPicked(addTarget, pick)}
        />
      ) : null}

      <Sheet open={discardOpen} title="Discard your changes?" onClose={() => setDiscardOpen(false)}>
        <div className="flex flex-col gap-4 px-5 pb-5 pt-1">
          <p className="m-0 text-[15px] leading-[22px]" style={{ color: 'var(--ink-2)' }}>
            The changes you made to this day haven&rsquo;t been saved.
          </p>
          <div className="flex gap-2">
            <Button variant="quiet" className="flex-1" onClick={() => setDiscardOpen(false)}>
              Keep editing
            </Button>
            <Button variant="danger" className="flex-1" onClick={discardChanges}>
              Discard
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
