import { ChevronDown, ChevronLeft, ChevronUp, History, Info, Link2, Minus, Plus, Shuffle, Sparkles, Trash2, Unlink } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ExerciseLookup } from '@/components/ExerciseLookup';
import FindAlternativeDialog from '@/components/FindAlternativeDialog';
import { NumberEntry } from '@/components/NumberEntry';
import { Badge, Button, Card, Chip, Eyebrow, Input, SegmentedToggle } from '@/components/ui';
import {
  getExerciseDetail,
  getLastPerformance,
  getWorkoutPlan,
  type CardioActivityKind,
  type DashboardExercise,
  type ExerciseDetail,
  type ExerciseIntervals,
  type ExerciseType,
  type HeartRateZone,
  type LastPerformance,
  type WeightUnit,
} from '@/lib/api';
import {
  cardioKindLabel,
  hrZoneLabel,
  isCatalogExercise,
  resolveExerciseType,
  swapPlanExercise,
  usesCountdown,
  type ExercisePick,
} from '@/lib/exercise';
import { roundTo } from '@/lib/numberEntry';
import { stepValue, useHoldRepeat } from '@/lib/useHoldRepeat';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore, type PlanSection } from '@/store/useAppStore';

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const TYPE_LABELS: Record<ExerciseType, string> = {
  reps: 'Reps & weight',
  timed: 'Timed hold',
  mobility: 'Mobility',
  cardio: 'Cardio',
  class: 'Class',
};

const TYPE_OPTIONS: { value: ExerciseType; label: string }[] = (
  ['reps', 'timed', 'mobility', 'cardio', 'class'] as ExerciseType[]
).map((value) => ({ value, label: TYPE_LABELS[value] }));

const CARDIO_KINDS: CardioActivityKind[] = ['run', 'cycle', 'swim', 'row', 'walk', 'hike', 'other'];

const HR_ZONES: HeartRateZone[] = [1, 2, 3, 4, 5];

/**
 * Heart-rate zone selector. The zone number is the contract with the backend; the
 * easy/moderate/hard wording is ours, and is shown so the number means something to a
 * beginner who has never worn a strap.
 */
function ZonePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: HeartRateZone;
  onChange: (zone: HeartRateZone) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold" style={{ color: 'var(--text-label)' }}>
        {label}
        {value ? ` — ${hrZoneLabel(value)}` : ''}
      </span>
      <div className="flex gap-2">
        {HR_ZONES.map((z) => (
          <Chip key={z} active={value === z} onClick={() => onChange(z)}>
            Z{z}
          </Chip>
        ))}
      </div>
    </div>
  );
}
const SECTION_FIELD: Record<PlanSection, 'warmup' | 'exercises' | 'cooldown'> = {
  warmup: 'warmup',
  main: 'exercises',
  cooldown: 'cooldown',
};
const SECTION_LABEL: Record<PlanSection, string> = { warmup: 'Warm-up', main: 'Main', cooldown: 'Cool-down' };

function resolveDayKey(param?: string): string {
  if (param && DAY_KEYS.includes(param)) return param;
  return DAY_KEYS[new Date().getDay()];
}

function isSection(value: string): value is PlanSection {
  return value === 'warmup' || value === 'main' || value === 'cooldown';
}

function relativeDay(iso?: string): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.round((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  return `${Math.floor(days / 7)} weeks ago`;
}

// ─── Small controls ───────────────────────────────────────────────────────────

function Stepper({
  label,
  value,
  step = 1,
  min = 0,
  bigStep,
  decimals = 0,
  onDelta,
  onSet,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  /** Step size once a hold runs long; passed to `onDelta` as `scale`. */
  bigStep?: number;
  decimals?: number;
  /** `delta` is ±`step`; `scale` is 1, or `bigStep` once a hold has run long. */
  onDelta: (delta: number, scale: number) => void;
  /** Makes the number typeable (tap it). */
  onSet?: (value: number) => void;
}) {
  // Every target moves in single units (hold ± to run), so the plan can say exactly
  // 22 kg or 40 s rather than whatever a coarse step happens to land on.
  const dec = useHoldRepeat((scale) => onDelta(-step, scale), { bigStep });
  const inc = useHoldRepeat((scale) => onDelta(step, scale), { bigStep });
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)' }}>
      <span className="min-w-0 text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--text-label)' }}>
        {label}
      </span>
      <div className="flex flex-shrink-0 items-center gap-2.5">
        <button
          {...dec}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className="flex h-7 w-7 select-none items-center justify-center rounded-lg disabled:opacity-30"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
        >
          <Minus size={13} color="var(--text-secondary)" />
        </button>
        {onSet ? (
          <NumberEntry
            value={value}
            decimals={decimals}
            min={min}
            onCommit={onSet}
            label={label}
            className="min-w-[40px] text-[16px]"
          />
        ) : (
          <span className="tabular min-w-[40px] text-center text-[16px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
            {value}
          </span>
        )}
        <button
          {...inc}
          aria-label={`Increase ${label}`}
          className="flex h-7 w-7 select-none items-center justify-center rounded-lg"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
        >
          <Plus size={13} color="var(--text-secondary)" />
        </button>
      </div>
    </div>
  );
}

// ─── Exercise info (ExerciseDB) ───────────────────────────────────────────────

function ExerciseInfo({ exerciseId, name }: { exerciseId: string; name: string }) {
  const { session } = useAuth();
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Catalog text (overview / how-to / tips) is long — keep it collapsed by default
  // so the media demo stays the only thing on screen.
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setDetail(null);
    void (async () => {
      if (!session?.access_token) return;
      try {
        const res = await getExerciseDetail(session.access_token, exerciseId);
        if (active) setDetail(res.exercise);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load exercise details.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [session, exerciseId]);

  if (loading) {
    return (
      <Card className="flex justify-center py-10">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </Card>
    );
  }
  // Catalog lookup failed or came back empty — the web search is then the only
  // route to form guidance, so lead with it.
  if (error || !detail) {
    return (
      <div className="flex flex-col gap-2.5">
        <Card variant="subtle">
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            {error ?? 'No demo available for this exercise.'}
          </p>
        </Card>
        <ExerciseLookup name={name} prominent />
      </div>
    );
  }

  const muscles = detail.target_muscles.length > 0 ? detail.target_muscles : detail.target ? [detail.target] : [];
  const hasInfo =
    muscles.length > 0 ||
    Boolean(detail.equipment) ||
    Boolean(detail.overview) ||
    detail.instructions.length > 0 ||
    detail.tips.length > 0;

  return (
    <div className="flex flex-col gap-2.5">
      <Card padding="0" className="overflow-hidden">
        {detail.video_url || detail.gif_url || detail.image_url ? (
          <div className="flex aspect-video w-full items-center justify-center" style={{ background: 'var(--bg-subtle)' }}>
            {detail.video_url ? (
              <video src={detail.video_url} autoPlay loop muted playsInline className="h-full w-full object-contain" />
            ) : (
              <img src={detail.gif_url ?? detail.image_url ?? ''} alt={detail.name} className="h-full w-full object-contain" />
            )}
          </div>
        ) : null}

        {hasInfo ? (
          <button
            onClick={() => setShowInfo((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-3.5"
            style={{ borderTop: '1px solid var(--border-base)' }}
          >
            <span className="flex items-center gap-2 text-[13px] font-bold" style={{ color: 'var(--accent-text)' }}>
              <Info size={15} /> Exercise info
            </span>
            {showInfo ? (
              <ChevronUp size={16} color="var(--text-muted)" />
            ) : (
              <ChevronDown size={16} color="var(--text-muted)" />
            )}
          </button>
        ) : null}

        {hasInfo && showInfo ? (
          <div className="flex flex-col gap-3.5 px-5 pb-5">
            {muscles.length > 0 || detail.equipment ? (
              <div className="flex flex-wrap gap-1.5">
                {muscles.map((m) => (
                  <Badge key={m} tone="mint">
                    {m}
                  </Badge>
                ))}
                {detail.equipment ? <Badge tone="neutral">{detail.equipment}</Badge> : null}
              </div>
            ) : null}

            {detail.overview ? (
              <p className="text-[13.5px] leading-[1.55]" style={{ color: 'var(--text-secondary)' }}>
                {detail.overview}
              </p>
            ) : null}

            {detail.instructions.length > 0 ? (
              <div>
                <Eyebrow className="mb-2">How to</Eyebrow>
                <ol className="flex flex-col gap-1.5">
                  {detail.instructions.map((step, i) => (
                    <li key={i} className="flex gap-2.5 text-[13.5px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                      <span className="tabular flex-shrink-0 font-bold" style={{ color: 'var(--accent-text)' }}>
                        {i + 1}.
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {detail.tips.length > 0 ? (
              <div>
                <Eyebrow className="mb-2">Tips</Eyebrow>
                <ul className="flex flex-col gap-1.5">
                  {detail.tips.map((tip, i) => (
                    <li key={i} className="flex gap-2.5 text-[13.5px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                      <Sparkles size={13} className="mt-0.5 flex-shrink-0" color="#34D2C1" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>
      {/* Offered even with a catalog hit: the entry may be thin (no instructions
          or tips), in which case this is the only real form guidance. */}
      <ExerciseLookup name={name} prominent={!hasInfo} />
    </div>
  );
}

// ─── Last performance ─────────────────────────────────────────────────────────

function LastPerformanceCard({
  exerciseId,
  fallback,
  canApply,
  onApply,
}: {
  exerciseId: string;
  fallback?: DashboardExercise['last_performance'];
  canApply: boolean;
  onApply: (last: LastPerformance) => void;
}) {
  const { session } = useAuth();
  const [last, setLast] = useState<LastPerformance | null>(fallback ?? null);

  useEffect(() => {
    let active = true;
    setLast(fallback ?? null);
    void (async () => {
      if (!session?.access_token) return;
      try {
        const res = await getLastPerformance(session.access_token, exerciseId);
        if (active && res.last) setLast(res.last);
      } catch {
        // background lookup — keep the plan's cached value (or nothing) on failure
      }
    })();
    return () => {
      active = false;
    };
  }, [session, exerciseId, fallback]);

  if (!last || (last.reps == null && last.weight == null)) return null;

  const when = relativeDay(last.performed_at);
  const parts = [
    last.reps != null ? `${last.reps} reps` : null,
    last.weight != null ? `${last.weight} ${last.weight_unit ?? ''}`.trim() : null,
  ].filter(Boolean);

  return (
    <Card variant="subtle" padding="12px 14px">
      <div className="flex items-center gap-2.5">
        <History size={16} color="var(--text-muted)" className="flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--text-label)' }}>
            Last time{when ? ` · ${when}` : ''}
          </div>
          <div className="tabular text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>
            {parts.join(' × ')}
          </div>
        </div>
        {canApply && (last.weight != null || last.reps != null) ? (
          <Button variant="secondary" size="sm" onClick={() => onApply(last)}>
            Use these
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExerciseDetailPage() {
  const { day, section: sectionParam, index: indexParam } = useParams<{ day: string; section: string; index: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const {
    profile,
    planDraft,
    initPlanDraft,
    patchDraftExercise,
    replaceDraftExercise,
    removeDraftExercise,
  } = useAppStore();

  const dayKey = resolveDayKey(day);
  const section: PlanSection = sectionParam && isSection(sectionParam) ? sectionParam : 'main';
  const index = Number(indexParam ?? 0);
  const backToDay = () => navigate(`/plan/${dayKey}`);

  const [loading, setLoading] = useState(!planDraft || planDraft.day !== dayKey);

  // Ensure a draft exists (e.g. on a hard reload / deep link straight to this route).
  useEffect(() => {
    let active = true;
    if (planDraft && planDraft.day === dayKey) {
      setLoading(false);
      return;
    }
    void (async () => {
      if (!session?.access_token) {
        setLoading(false);
        return;
      }
      try {
        const result = await getWorkoutPlan(session.access_token);
        if (!active) return;
        const plan = result.plan;
        initPlanDraft(plan?.id, dayKey, plan?.plan?.[dayKey] ?? { is_rest_day: true });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [session, dayKey, planDraft, initPlanDraft]);

  const dayPlan = planDraft?.day === dayKey ? planDraft.dayPlan : null;
  const ex: DashboardExercise | undefined = dayPlan?.[SECTION_FIELD[section]]?.[index];

  const type: ExerciseType = ex ? resolveExerciseType(ex) : 'reps';
  const countdown = usesCountdown(type);
  const catalogged = isCatalogExercise(type);
  const unit: WeightUnit = (ex?.weight_unit as WeightUnit) ?? (profile.preferred_unit_system === 'imperial' ? 'lb' : 'kg');

  const patch = useCallback(
    (p: Partial<DashboardExercise>) => patchDraftExercise(section, index, p),
    [patchDraftExercise, section, index],
  );

  const patchIntervals = useCallback(
    (p: Partial<ExerciseIntervals>) => {
      if (!ex?.intervals) return;
      patch({ intervals: { ...ex.intervals, ...p } });
    },
    [patch, ex?.intervals],
  );

  /**
   * Switching type clears the fields the new type cannot carry — leaving a stale
   * `duration_seconds` on a reps exercise (or an `exercise_id` on a run) would make the
   * plan lie about itself, and the backend strips cross-type fields on write anyway.
   */
  const changeType = useCallback(
    (next: ExerciseType) => {
      const cleared: Partial<DashboardExercise> = {
        type: next,
        duration_seconds: undefined,
        reps: undefined,
        reps_min: undefined,
        reps_max: undefined,
        target_weight: undefined,
        activity_kind: undefined,
        distance_km: undefined,
        target_duration_minutes: undefined,
        target_hr_zone: undefined,
        cardio_format: undefined,
        intervals: undefined,
        class_name: undefined,
      };
      if (next === 'reps') {
        patch({ ...cleared, reps: ex?.reps || '10', sets: ex?.sets ?? 3 });
        return;
      }
      if (next === 'timed' || next === 'mobility') {
        patch({ ...cleared, duration_seconds: ex?.duration_seconds ?? 30, sets: ex?.sets ?? 1 });
        return;
      }
      if (next === 'cardio') {
        // Cardio and class are never catalog-matched — drop the ExerciseDB link too.
        patch({
          ...cleared,
          exercise_id: undefined,
          target_muscle: undefined,
          body_part: undefined,
          cues: undefined,
          activity_kind: ex?.activity_kind ?? 'run',
          cardio_format: 'steady',
          target_duration_minutes: ex?.target_duration_minutes ?? 30,
          target_hr_zone: ex?.target_hr_zone ?? 2,
          sets: 1,
        });
        return;
      }
      patch({
        ...cleared,
        exercise_id: undefined,
        target_muscle: undefined,
        body_part: undefined,
        cues: undefined,
        class_name: ex?.class_name ?? ex?.name,
        target_duration_minutes: ex?.target_duration_minutes ?? 45,
        sets: 1,
      });
    },
    [patch, ex],
  );

  const pick = useCallback(
    (item: ExercisePick) => {
      if (!ex) return;
      replaceDraftExercise(section, index, swapPlanExercise(ex, item));
    },
    [ex, replaceDraftExercise, section, index],
  );

  const [swapOpen, setSwapOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (!ex) {
    return (
      <div className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-3 p-10 text-center" style={{ minHeight: '50vh' }}>
        <div className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>
          Exercise not found
        </div>
        <Button variant="secondary" onClick={backToDay}>
          Back to day plan
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 p-5 pb-16 sm:p-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={backToDay}
          aria-label="Back to day plan"
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
        >
          <ChevronLeft size={20} color="var(--text-secondary)" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge tone="neutral">{SECTION_LABEL[section]}</Badge>
            {!catalogged ? (
              <Badge tone="mint">{TYPE_LABELS[type]}</Badge>
            ) : ex.exercise_id ? (
              <Badge tone="mint">
                <Link2 size={11} /> Linked
              </Badge>
            ) : (
              <Badge tone="gold">Unlinked</Badge>
            )}
          </div>
          <div className="mt-1 truncate text-[22px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
            {type === 'class' ? (ex.class_name ?? ex.name) : ex.name}
          </div>
          {ex.swapped_from ? (
            <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Swapped from {ex.swapped_from}
            </div>
          ) : null}
        </div>
      </div>

      {/* Info / demo — cardio and class are never catalog-matched, so neither the demo
          nor the "link it" nudge applies to them. */}
      {!catalogged ? null : ex.exercise_id ? (
        <ExerciseInfo exerciseId={ex.exercise_id} name={ex.name} />
      ) : (
        <div className="flex flex-col gap-2.5">
          <Card variant="subtle">
            <div className="flex items-start gap-2.5">
              <Link2 size={16} color="var(--forma-danger)" className="mt-0.5 flex-shrink-0" />
              <p className="text-[13px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                This exercise isn&rsquo;t linked to the ExerciseDB catalog, so there&rsquo;s no demo or form
                guidance. Look it up on the web below, search to link it — or leave it and we&rsquo;ll try to
                match it by name when you save.
              </p>
            </div>
          </Card>
          <ExerciseLookup name={ex.name} prominent />
        </div>
      )}

      {/* Last performance */}
      {catalogged && ex.exercise_id ? (
        <LastPerformanceCard
          exerciseId={ex.exercise_id}
          fallback={ex.last_performance}
          canApply={!countdown}
          onApply={(last) =>
            patch({
              ...(last.reps != null ? { reps: String(last.reps) } : {}),
              ...(last.weight != null
                ? { target_weight: last.weight, weight_unit: last.weight_unit ?? unit }
                : {}),
            })
          }
        />
      ) : null}

      {/* Targets editor */}
      <Card>
        <Eyebrow className="mb-3">Targets</Eyebrow>
        <div className="flex flex-col gap-3">
          <Input
            label="Exercise name"
            value={ex.name}
            onChange={(e) => patch({ name: e.target.value })}
          />

          {/* Five types don't fit a segmented control legibly — chips wrap instead. */}
          <div className="flex flex-wrap gap-2">
            {TYPE_OPTIONS.map((opt) => (
              <Chip key={opt.value} active={type === opt.value} onClick={() => changeType(opt.value)}>
                {opt.label}
              </Chip>
            ))}
          </div>

          {type === 'cardio' ? (
            <>
              <div className="flex flex-wrap gap-2">
                {CARDIO_KINDS.map((kind) => (
                  <Chip
                    key={kind}
                    active={(ex.activity_kind ?? 'other') === kind}
                    onClick={() => patch({ activity_kind: kind })}
                  >
                    {cardioKindLabel(kind)}
                  </Chip>
                ))}
              </div>

              <SegmentedToggle
                tone="mint"
                value={ex.cardio_format ?? 'steady'}
                onChange={(v) =>
                  v === 'intervals'
                    ? patch({
                        cardio_format: 'intervals',
                        intervals: ex.intervals ?? {
                          rounds: 8,
                          work_seconds: 60,
                          recover_seconds: 90,
                          work_hr_zone: 4,
                          recover_hr_zone: 2,
                        },
                      })
                    : patch({ cardio_format: 'steady', intervals: undefined })
                }
                options={[
                  { value: 'steady', label: 'Steady' },
                  { value: 'intervals', label: 'Intervals' },
                ]}
              />

              {ex.cardio_format === 'intervals' && ex.intervals ? (
                <>
                  <Stepper
                    label="Rounds"
                    value={ex.intervals.rounds}
                    min={1}
                    onDelta={(d) => patchIntervals({ rounds: Math.max(1, ex.intervals!.rounds + d) })}
                  />
                  <Stepper
                    label="Work (sec)"
                    value={ex.intervals.work_seconds}
                    min={1}
                    bigStep={5}
                    onDelta={(d, scale) =>
                      patchIntervals({ work_seconds: stepValue(ex.intervals!.work_seconds, d > 0 ? 1 : -1, scale, 1) })
                    }
                    onSet={(v) => patchIntervals({ work_seconds: v })}
                  />
                  <Stepper
                    label="Recover (sec)"
                    value={ex.intervals.recover_seconds}
                    min={0}
                    bigStep={5}
                    onDelta={(d, scale) =>
                      patchIntervals({ recover_seconds: stepValue(ex.intervals!.recover_seconds, d > 0 ? 1 : -1, scale) })
                    }
                    onSet={(v) => patchIntervals({ recover_seconds: v })}
                  />
                  <ZonePicker
                    label="Work zone"
                    value={ex.intervals.work_hr_zone}
                    onChange={(z) => patchIntervals({ work_hr_zone: z })}
                  />
                  <ZonePicker
                    label="Recover zone"
                    value={ex.intervals.recover_hr_zone}
                    onChange={(z) => patchIntervals({ recover_hr_zone: z })}
                  />
                </>
              ) : (
                <>
                  <Stepper
                    label="Distance (km)"
                    value={ex.distance_km ?? 0}
                    step={0.5}
                    decimals={2}
                    onDelta={(d) =>
                      // Two decimals, so a typed 5.23 km steps to 5.73 rather than rounding to 5.7.
                      patch({ distance_km: Math.max(0, roundTo((ex.distance_km ?? 0) + d, 2)) })
                    }
                    onSet={(v) => patch({ distance_km: v })}
                  />
                  <Stepper
                    label="Duration (min)"
                    value={ex.target_duration_minutes ?? 0}
                    bigStep={5}
                    onDelta={(d, scale) =>
                      patch({ target_duration_minutes: stepValue(ex.target_duration_minutes ?? 0, d > 0 ? 1 : -1, scale) })
                    }
                    onSet={(v) => patch({ target_duration_minutes: v })}
                  />
                  <ZonePicker
                    label="Target zone"
                    value={ex.target_hr_zone}
                    onChange={(z) => patch({ target_hr_zone: z })}
                  />
                </>
              )}
            </>
          ) : type === 'class' ? (
            <>
              <Input
                label="Class name"
                value={ex.class_name ?? ''}
                placeholder="Spin, Body Pump, Vinyasa…"
                onChange={(e) => patch({ class_name: e.target.value })}
              />
              <Stepper
                label="Duration (min)"
                value={ex.target_duration_minutes ?? 45}
                min={1}
                bigStep={5}
                onDelta={(d, scale) =>
                  patch({ target_duration_minutes: stepValue(ex.target_duration_minutes ?? 45, d > 0 ? 1 : -1, scale, 1) })
                }
                onSet={(v) => patch({ target_duration_minutes: v })}
              />
            </>
          ) : (
            <>
              <Stepper
                label={type === 'mobility' ? 'Rounds' : 'Sets'}
                value={ex.sets ?? 1}
                min={1}
                onDelta={(d) => patch({ sets: Math.max(1, (ex.sets ?? 1) + d) })}
              />

              {countdown ? (
                <Stepper
                  label="Duration (sec)"
                  value={ex.duration_seconds ?? 30}
                  min={1}
                  bigStep={5}
                  onDelta={(d, scale) =>
                    patch({ duration_seconds: stepValue(ex.duration_seconds ?? 30, d > 0 ? 1 : -1, scale, 1) })
                  }
                  onSet={(v) => patch({ duration_seconds: v })}
                />
              ) : (
                <>
                  <Input
                    label="Reps (e.g. 10 or 8–12)"
                    value={ex.reps ?? ''}
                    onChange={(e) => patch({ reps: e.target.value })}
                  />
                  {/* The unit toggle wraps under the stepper when a phone can't fit both. */}
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <div className="min-w-[220px] flex-1">
                      <Stepper
                        label={`Weight (${unit})`}
                        value={ex.target_weight ?? 0}
                        decimals={2}
                        bigStep={5}
                        onDelta={(d, scale) =>
                          patch({
                            target_weight: stepValue(ex.target_weight ?? 0, d > 0 ? 1 : -1, scale),
                            weight_unit: unit,
                          })
                        }
                        onSet={(w) => patch({ target_weight: w, weight_unit: unit })}
                      />
                    </div>
                    <div className="w-24">
                      <SegmentedToggle
                        value={unit}
                        onChange={(v) => patch({ weight_unit: v as WeightUnit })}
                        options={[
                          { value: 'kg', label: 'kg' },
                          { value: 'lb', label: 'lb' },
                        ]}
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {type !== 'class' ? (
            <label className="flex items-center gap-2.5 text-[13.5px]" style={{ color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={ex.is_per_side === true}
                onChange={(e) => patch({ is_per_side: e.target.checked || undefined })}
                className="h-4 w-4"
                style={{ accentColor: 'var(--accent)' }}
              />
              Per side (lunges, side planks — &ldquo;each side&rdquo;)
            </label>
          ) : null}

          {type !== 'class' && ex.cardio_format !== 'intervals' ? (
            <Stepper
              label="Rest (sec)"
              value={ex.rest_seconds ?? 0}
              bigStep={5}
              onDelta={(d, scale) => patch({ rest_seconds: stepValue(ex.rest_seconds ?? 0, d > 0 ? 1 : -1, scale) })}
              onSet={(v) => patch({ rest_seconds: v })}
            />
          ) : null}

          <Input
            label="Notes (optional)"
            value={ex.notes ?? ''}
            placeholder="Tempo, cues, reminders…"
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </div>
      </Card>

      {/* Swap / link — only meaningful for catalog-matchable movements. */}
      {catalogged ? (
      <Card>
        <Eyebrow className="mb-3">Change or link exercise</Eyebrow>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setSwapOpen(true)} leftIcon={<Shuffle size={14} />}>
            {ex.exercise_id ? 'Find alternative' : 'Search the catalog'}
          </Button>
          {ex.exercise_id ? (
            <Button variant="ghost" size="sm" onClick={() => patch({ exercise_id: undefined })} leftIcon={<Unlink size={14} />}>
              Unlink
            </Button>
          ) : null}
        </div>
      </Card>
      ) : null}

      {swapOpen ? (
        <FindAlternativeDialog
          accessToken={session?.access_token}
          name={ex.name}
          exerciseId={ex.exercise_id}
          title={ex.exercise_id ? 'Find an alternative' : 'Link or swap exercise'}
          onClose={() => setSwapOpen(false)}
          onPick={(item) => {
            pick(item);
            setSwapOpen(false);
          }}
        />
      ) : null}

      {/* Danger */}
      <button
        onClick={() => {
          removeDraftExercise(section, index);
          backToDay();
        }}
        className="flex items-center justify-center gap-2 rounded-xl py-3 text-[13.5px] font-bold"
        style={{ color: 'var(--forma-danger)', border: '1px solid var(--border-base)' }}
      >
        <Trash2 size={15} /> Remove from day
      </button>

      <Button size="lg" fullWidth onClick={backToDay}>
        Done
      </Button>

      <p className="text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
        Edits are kept as you go — press <span className="font-bold">Save changes</span> on the day plan to store them.
      </p>
    </div>
  );
}
