import { ChevronDown, ChevronLeft, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ExerciseDemo } from '@/components/ExerciseDemo';
import FindAlternativeDialog from '@/components/FindAlternativeDialog';
import { InfoSheet } from '@/components/LogbookView';
import { NumberEntry } from '@/components/NumberEntry';
import { Button } from '@/components/ui';
import {
  getLastPerformance,
  getWorkoutPlan,
  type CardioActivityKind,
  type DashboardExercise,
  type ExerciseIntervals,
  type ExerciseType,
  type HeartRateZone,
  type LastPerformance,
  type WeightUnit,
} from '@/lib/api';
import {
  cardioKindLabel,
  formatExerciseName,
  formatIntervals,
  formatMuscle,
  hrZoneLabel,
  isCatalogExercise,
  resolveExerciseType,
  swapPlanExercise,
  targetsClearedBy,
  usesCountdown,
  usesWeight,
} from '@/lib/exercise';
import { splitFocus } from '@/lib/home';
import { roundTo } from '@/lib/numberEntry';
import { displayToKm, distanceUnit, kmToDisplay } from '@/lib/units';
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
const TYPES: ExerciseType[] = ['reps', 'timed', 'mobility', 'cardio', 'class'];
const CARDIO_KINDS: CardioActivityKind[] = ['run', 'cycle', 'swim', 'row', 'walk', 'hike', 'other'];
const HR_ZONES: HeartRateZone[] = [1, 2, 3, 4, 5];

const SECTION_FIELD: Record<PlanSection, 'warmup' | 'exercises' | 'cooldown'> = {
  warmup: 'warmup',
  main: 'exercises',
  cooldown: 'cooldown',
};
const SECTION_LABEL: Record<PlanSection, string> = { warmup: 'Warm-up', main: 'Main', cooldown: 'Cool-down' };

function resolveDayKey(param?: string): string {
  return param && DAY_KEYS.includes(param) ? param : DAY_KEYS[new Date().getDay()];
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

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const card = 'rounded-[20px] bg-[var(--surface)]';

/**
 * One exercise of a plan day, for editing (reading is Plan day's info sheet). Only the
 * fields the exercise's type uses are shown; rename, type and unlink fold under More
 * options. Every change is a draft edit, kept until the day is saved.
 */
export default function ExerciseDetailPage() {
  const { day, section: sectionParam, index: indexParam } = useParams<{ day: string; section: string; index: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { profile, planDraft, initPlanDraft, patchDraftExercise, replaceDraftExercise, removeDraftExercise } = useAppStore();

  const dayKey = resolveDayKey(day);
  const dayName = capitalise(dayKey);
  const section: PlanSection = sectionParam && isSection(sectionParam) ? sectionParam : 'main';
  const index = Number(indexParam ?? 0);
  const system = profile.preferred_unit_system;
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
  const unit: WeightUnit = (ex?.weight_unit as WeightUnit) ?? (system === 'imperial' ? 'lb' : 'kg');

  const patch = useCallback((p: Partial<DashboardExercise>) => patchDraftExercise(section, index, p), [patchDraftExercise, section, index]);
  const patchIntervals = useCallback(
    (p: Partial<ExerciseIntervals>) => {
      if (ex?.intervals) patch({ intervals: { ...ex.intervals, ...p } });
    },
    [patch, ex?.intervals],
  );

  const [swapOpen, setSwapOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [addWeight, setAddWeight] = useState(false);
  const [addDistance, setAddDistance] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[15px]" style={{ color: 'var(--ink-2)' }}>
        Loading…
      </div>
    );
  }

  if (!ex) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[480px] flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="type-section-title m-0" style={{ color: 'var(--ink)' }}>This exercise isn&apos;t on the day any more</p>
        <Button onClick={backToDay}>Back to {dayName}</Button>
      </div>
    );
  }

  /**
   * Switching type clears the fields the new type cannot carry: leaving a stale
   * `duration_seconds` on a reps exercise (or an `exercise_id` on a run) would make the
   * plan lie about itself, and the backend strips cross-type fields on write anyway.
   */
  const applyType = (next: ExerciseType) => {
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
      is_per_side: undefined,
    };
    if (next === 'reps') {
      patch({ ...cleared, reps: ex.reps || '10', sets: ex.sets ?? 3, is_per_side: ex.is_per_side, target_weight: ex.target_weight, weight_unit: ex.weight_unit });
      return;
    }
    if (next === 'timed') {
      // Reps and timed are the two loaded types, so a weight already dialled in survives.
      patch({ ...cleared, duration_seconds: ex.duration_seconds ?? 30, sets: ex.sets ?? 1, target_weight: ex.target_weight, weight_unit: ex.weight_unit, is_per_side: ex.is_per_side });
      return;
    }
    if (next === 'mobility') {
      patch({ ...cleared, duration_seconds: ex.duration_seconds ?? 30, sets: ex.sets ?? 1, is_per_side: ex.is_per_side });
      return;
    }
    // Cardio and class are never catalog-matched: drop the ExerciseDB link too.
    const uncatalogged = { ...cleared, exercise_id: undefined, target_muscle: undefined, body_part: undefined, cues: undefined, sets: 1 };
    if (next === 'cardio') {
      patch({
        ...uncatalogged,
        activity_kind: ex.activity_kind ?? 'run',
        cardio_format: 'steady',
        target_duration_minutes: ex.target_duration_minutes ?? 30,
        target_hr_zone: ex.target_hr_zone ?? 2,
      });
      return;
    }
    patch({ ...uncatalogged, class_name: ex.class_name ?? ex.name, target_duration_minutes: ex.target_duration_minutes ?? 45 });
  };

  const changeType = (next: ExerciseType) => {
    if (next === type) return;
    const lost = targetsClearedBy(ex, next);
    if (lost.length > 0) {
      const list = lost.length === 1 ? lost[0] : `${lost.slice(0, -1).join(', ')} and ${lost[lost.length - 1]}`;
      if (!window.confirm(`Change to ${TYPE_LABELS[next].toLowerCase()}? This clears the ${list}, which ${TYPE_LABELS[next].toLowerCase()} doesn't use.`)) return;
    }
    applyType(next);
  };

  const title = type === 'class' ? ex.class_name || ex.name : formatExerciseName(ex.name);
  const sub =
    type === 'cardio'
      ? `Cardio · ${cardioKindLabel(ex.activity_kind)}`
      : type === 'class'
        ? 'Class'
        : [ex.target_muscle ? formatMuscle(ex.target_muscle) : null, ex.equipment ? formatMuscle(ex.equipment) : null].filter(Boolean).join(' · ');
  const focus = dayPlan?.focus ? splitFocus(dayPlan.focus).title : null;
  const intervals = ex.cardio_format === 'intervals' ? ex.intervals : undefined;
  const steadyCardio = type === 'cardio' && !intervals;
  const showWeight = type === 'reps' || (type === 'timed' && (addWeight || (ex.target_weight ?? 0) > 0));
  const showDistance = steadyCardio && (addDistance || (ex.distance_km ?? 0) > 0);
  const summary = intervals
    ? formatIntervals(intervals)
    : type === 'timed' || type === 'mobility'
      ? `${ex.sets ?? 1} × ${ex.duration_seconds ?? 30} s${ex.is_per_side ? ', each side' : ''}`
      : null;
  const zoneOptions = HR_ZONES.map((z) => ({ value: String(z), label: `Z${z}` }));
  const zoneHint = (z?: HeartRateZone) => (z ? capitalise(hrZoneLabel(z) ?? '') : undefined);

  const rows: ReactNode[] = [];
  if (type === 'reps' || countdown) {
    rows.push(<StepRow key="sets" label={type === 'mobility' ? 'Rounds' : 'Sets'} value={ex.sets ?? 1} min={1} onDelta={(d) => patch({ sets: Math.max(1, (ex.sets ?? 1) + d) })} />);
  }
  if (type === 'reps') {
    rows.push(<TextRow key="reps" id="ee-reps" label="Reps" hint="One number or a range" value={ex.reps ?? ''} numeric onChange={(text) => patch({ reps: text })} />);
  }
  if (countdown) {
    rows.push(
      <StepRow
        key="hold"
        label="Hold"
        hint={ex.is_per_side ? 'For each side' : undefined}
        value={ex.duration_seconds ?? 30}
        unit="s"
        step={5}
        min={5}
        onDelta={(d) => patch({ duration_seconds: Math.max(5, (ex.duration_seconds ?? 30) + d) })}
        onSet={(v) => patch({ duration_seconds: v })}
      />,
    );
  }
  if (showWeight) {
    rows.push(
      <StepRow
        key="weight"
        label="Weight"
        hint={`In ${unit}. 0 for body weight.`}
        value={ex.target_weight ?? 0}
        unit={unit}
        decimals={2}
        bigStep={5}
        onDelta={(d, scale) => patch({ target_weight: stepValue(ex.target_weight ?? 0, d > 0 ? 1 : -1, scale), weight_unit: unit })}
        onSet={(w) => patch({ target_weight: w, weight_unit: unit })}
      />,
    );
  } else if (type === 'timed') {
    rows.push(<AddRow key="add-weight" label="Add a weight" onClick={() => setAddWeight(true)} />);
  }
  if (type === 'cardio') {
    rows.push(
      <ChipRow key="sport" label="Sport" options={CARDIO_KINDS.map((k) => ({ value: k, label: k === 'other' ? 'Other' : cardioKindLabel(k) }))} value={ex.activity_kind ?? 'other'} onChange={(k) => patch({ activity_kind: k })} />,
      <ChipRow
        key="format"
        label="Format"
        options={[
          { value: 'steady', label: 'Steady' },
          { value: 'intervals', label: 'Intervals' },
        ]}
        value={intervals ? 'intervals' : 'steady'}
        onChange={(v) =>
          v === 'intervals'
            ? patch({ cardio_format: 'intervals', intervals: ex.intervals ?? { rounds: 8, work_seconds: 60, recover_seconds: 90, work_hr_zone: 4, recover_hr_zone: 2 } })
            : patch({ cardio_format: 'steady', intervals: undefined })
        }
      />,
    );
  }
  if (steadyCardio) {
    const shown = roundTo(kmToDisplay(ex.distance_km ?? 0, system), 2);
    rows.push(
      <StepRow
        key="duration"
        label="Duration"
        value={ex.target_duration_minutes ?? 0}
        unit="min"
        bigStep={5}
        onDelta={(d, scale) => patch({ target_duration_minutes: stepValue(ex.target_duration_minutes ?? 0, d > 0 ? 1 : -1, scale) })}
        onSet={(v) => patch({ target_duration_minutes: v })}
      />,
      showDistance ? (
        <StepRow
          key="distance"
          label="Distance"
          hint={ex.target_duration_minutes ? 'Either or both: a time, a distance' : undefined}
          value={shown}
          unit={distanceUnit(system)}
          step={0.5}
          decimals={2}
          onDelta={(d) => patch({ distance_km: Math.max(0, roundTo(displayToKm(roundTo(shown + d, 2), system), 3)) })}
          onSet={(v) => patch({ distance_km: roundTo(displayToKm(v, system), 3) })}
        />
      ) : (
        <AddRow key="add-distance" label="Add a distance" onClick={() => setAddDistance(true)} />
      ),
      <ChipRow
        key="zone"
        label="Target zone"
        hint={zoneHint(ex.target_hr_zone)}
        options={zoneOptions}
        value={ex.target_hr_zone ? String(ex.target_hr_zone) : ''}
        onChange={(z) => patch({ target_hr_zone: Number(z) as HeartRateZone })}
      />,
    );
  }
  if (intervals) {
    const byDistance = !intervals.work_seconds && Boolean(intervals.work_distance_m);
    rows.push(
      <StepRow key="rounds" label="Rounds" value={intervals.rounds} min={1} onDelta={(d) => patchIntervals({ rounds: Math.max(1, intervals.rounds + d) })} />,
      <ChipRow
        key="work-by"
        label="Each round"
        hint={byDistance ? 'Run it, then select Round done' : undefined}
        options={[
          { value: 'time', label: 'A time' },
          { value: 'distance', label: 'A distance' },
        ]}
        value={byDistance ? 'distance' : 'time'}
        onChange={(v) =>
          v === 'distance'
            ? patchIntervals({ work_distance_m: intervals.work_distance_m ?? 400, work_seconds: undefined })
            : patchIntervals({ work_seconds: intervals.work_seconds ?? 60, work_distance_m: undefined })
        }
      />,
      byDistance ? (
        <StepRow
          key="work-m"
          label="Work"
          hint="Metres, as track repeats are written"
          value={intervals.work_distance_m ?? 400}
          unit="m"
          step={100}
          min={100}
          onDelta={(d) => patchIntervals({ work_distance_m: Math.max(100, (intervals.work_distance_m ?? 400) + d) })}
          onSet={(v) => patchIntervals({ work_distance_m: Math.max(50, Math.round(v)) })}
        />
      ) : (
        <StepRow
          key="work-s"
          label="Work"
          value={intervals.work_seconds ?? 60}
          unit="s"
          step={15}
          min={5}
          onDelta={(d) => patchIntervals({ work_seconds: Math.max(5, (intervals.work_seconds ?? 60) + d) })}
          onSet={(v) => patchIntervals({ work_seconds: v })}
        />
      ),
      <StepRow
        key="recover"
        label="Recover"
        value={intervals.recover_seconds}
        unit="s"
        step={15}
        onDelta={(d) => patchIntervals({ recover_seconds: Math.max(0, intervals.recover_seconds + d) })}
        onSet={(v) => patchIntervals({ recover_seconds: v })}
      />,
      <ChipRow key="work-zone" label="Work zone" hint={zoneHint(intervals.work_hr_zone)} options={zoneOptions} value={intervals.work_hr_zone ? String(intervals.work_hr_zone) : ''} onChange={(z) => patchIntervals({ work_hr_zone: Number(z) as HeartRateZone })} />,
      <ChipRow key="recover-zone" label="Recover zone" hint={zoneHint(intervals.recover_hr_zone)} options={zoneOptions} value={intervals.recover_hr_zone ? String(intervals.recover_hr_zone) : ''} onChange={(z) => patchIntervals({ recover_hr_zone: Number(z) as HeartRateZone })} />,
    );
  }
  if (type === 'class') {
    rows.push(
      <TextRow key="class" id="ee-class" label="Class name" hint="Spin, Body Pump, Vinyasa…" value={ex.class_name ?? ''} onChange={(text) => patch({ class_name: text })} />,
      <StepRow
        key="class-min"
        label="Duration"
        value={ex.target_duration_minutes ?? 45}
        unit="min"
        step={5}
        min={5}
        onDelta={(d) => patch({ target_duration_minutes: Math.max(5, (ex.target_duration_minutes ?? 45) + d) })}
        onSet={(v) => patch({ target_duration_minutes: v })}
      />,
    );
  }
  if (type !== 'class' && !intervals) {
    rows.push(
      <StepRow
        key="rest"
        label="Rest"
        hint={steadyCardio ? undefined : 'Between sets'}
        value={ex.rest_seconds ?? 0}
        unit="s"
        step={15}
        onDelta={(d) => patch({ rest_seconds: Math.max(0, (ex.rest_seconds ?? 0) + d) })}
        onSet={(v) => patch({ rest_seconds: v })}
      />,
    );
  }
  if (type === 'reps' || type === 'timed' || type === 'mobility') {
    rows.push(
      <SwitchRow key="side" label="Each side" hint="For lunges, side planks and other one-side moves" on={ex.is_per_side === true} onToggle={() => patch({ is_per_side: ex.is_per_side ? undefined : true })} />,
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1040px] animate-fade-slide-up flex-col gap-5 px-4 pb-40 pt-4 sm:px-10 sm:pt-8">
      <button type="button" onClick={backToDay} className="-ml-1.5 flex min-h-[44px] items-center gap-0.5 self-start text-[15px] font-bold" style={{ color: 'var(--teal)' }}>
        <ChevronLeft size={22} aria-hidden="true" /> {dayName}
      </button>

      <header className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold" style={{ color: 'var(--ink-3)' }}>
          {SECTION_LABEL[section]}
          {focus ? ` · ${focus}` : ''}
        </span>
        <h1 className="font-number m-0 text-[36px] font-extrabold leading-[40px]" style={{ color: 'var(--ink)' }}>
          {title}
        </h1>
        {sub ? <span className="text-[14px]" style={{ color: 'var(--ink-2)' }}>{sub}</span> : null}
        {ex.swapped_from ? <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Swapped from {ex.swapped_from}</span> : null}
      </header>

      <div className="grid items-start gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))' }}>
        {catalogged ? (
          <div className="flex min-w-0 flex-col gap-4">
            {ex.exercise_id ? (
              <div className="flex flex-col gap-2">
                <ExerciseDemo exerciseId={ex.exercise_id} name={ex.name} accessToken={session?.access_token} onCues={() => undefined} showName={false} />
                <button type="button" onClick={() => setInfoOpen(true)} className="min-h-[44px] self-start text-[15px] font-bold" style={{ color: 'var(--teal)' }}>
                  How to do it
                </button>
              </div>
            ) : (
              <div className={`${card} flex flex-col gap-2.5 p-4`}>
                <span className="text-[15px] font-bold" style={{ color: 'var(--ink)' }}>No form demo yet</span>
                <span className="text-[13.5px] leading-[19px]" style={{ color: 'var(--ink-2)' }}>
                  It isn&apos;t linked to the exercise catalog. Find it there for a demo and how-to, or leave it as it is.
                </span>
                <Button variant="quiet" onClick={() => setSwapOpen(true)}>
                  Find it in the catalog
                </Button>
              </div>
            )}
            {ex.exercise_id ? (
              <LastTime
                exerciseId={ex.exercise_id}
                fallback={ex.last_performance}
                canApply={usesWeight(type)}
                weightOnly={countdown}
                onApply={(last) =>
                  patch({
                    // A hold has no rep count to restore: only the load carries over.
                    ...(last.reps != null && !countdown ? { reps: String(last.reps) } : {}),
                    ...(last.weight != null ? { target_weight: last.weight, weight_unit: last.weight_unit ?? unit } : {}),
                  })
                }
              />
            ) : null}
          </div>
        ) : null}

        <div className="flex min-w-0 flex-col gap-5">
          <section aria-label="Targets" className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>Targets</h2>
              {summary ? <span className="text-[13px] font-semibold" style={{ color: 'var(--ink-2)' }}>{summary}</span> : null}
            </div>
            <div className={`${card} overflow-hidden`}>
              {rows.map((row, i) => (
                <div key={i} style={{ borderTop: i === 0 ? undefined : '1px solid var(--line)' }}>
                  {row}
                </div>
              ))}
            </div>
          </section>

          <label className="flex flex-col gap-1.5">
            <span className="px-1 text-[15.5px] font-bold" style={{ color: 'var(--ink)' }}>Notes</span>
            <textarea
              rows={2}
              value={ex.notes ?? ''}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Tempo, cues, reminders"
              className="min-h-[72px] w-full resize-y rounded-2xl px-3.5 py-3 text-[15px] leading-[21px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--aqua)]"
              style={{ background: 'var(--surface)', color: 'var(--ink)' }}
            />
          </label>

          <section aria-label="More options" className={card}>
            <button type="button" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} className="flex min-h-[60px] w-full items-center justify-between px-4 text-left">
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-bold" style={{ color: 'var(--ink)' }}>More options</span>
                <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Rename, change type{ex.exercise_id ? ', unlink' : ''}</span>
              </span>
              <ChevronDown size={18} aria-hidden="true" style={{ color: 'var(--ink-3)', transform: moreOpen ? 'rotate(180deg)' : undefined }} />
            </button>
            {moreOpen ? (
              <div className="flex flex-col gap-4 px-4 pb-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13.5px] font-semibold" style={{ color: 'var(--ink-2)' }}>Name on the plan</span>
                  <input value={ex.name} onChange={(e) => patch({ name: e.target.value })} className="h-12 rounded-xl px-3.5 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--aqua)]" style={{ background: 'var(--ground)', color: 'var(--ink)' }} />
                </label>
                <div className="flex flex-col gap-2">
                  <span id="ee-type" className="text-[13.5px] font-semibold" style={{ color: 'var(--ink-2)' }}>Type</span>
                  <div role="radiogroup" aria-labelledby="ee-type" className="flex flex-wrap gap-2">
                    {TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        role="radio"
                        aria-checked={t === type}
                        onClick={() => changeType(t)}
                        className="h-10 rounded-full px-3.5 text-[14px] font-bold"
                        style={{ background: t === type ? 'var(--ink)' : 'var(--ground)', color: t === type ? 'var(--ground)' : 'var(--ink)' }}
                      >
                        {TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                  <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>Changing type asks first if it would clear targets the new type doesn&apos;t use.</span>
                </div>
                {ex.exercise_id ? (
                  <button type="button" onClick={() => patch({ exercise_id: undefined })} className="min-h-[44px] self-start text-[15px] font-bold" style={{ color: 'var(--teal)' }}>
                    Unlink from the catalog
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>

          <div className="flex flex-col gap-2">
            {catalogged && ex.exercise_id ? (
              <Button variant="quiet" fullWidth onClick={() => setSwapOpen(true)}>
                Swap for another exercise
              </Button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                removeDraftExercise(section, index);
                backToDay();
              }}
              className="min-h-12 text-[15px] font-bold"
              style={{ color: 'var(--danger)' }}
            >
              Remove from {dayName}
            </button>
          </div>
        </div>
      </div>

      {/* Done sits above the phone's tab bar, and beside the side nav. */}
      <div className="fixed inset-x-0 bottom-[calc(74px+env(safe-area-inset-bottom))] z-30 flex flex-col gap-2 px-4 pb-3 pt-2.5 md:bottom-0 md:left-[88px] lg:left-[264px]" style={{ background: 'var(--ground)', borderTop: '1px solid var(--line)' }}>
        <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-2 sm:px-6">
          <span className="text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>Kept with your other changes to {dayName} until you save the day.</span>
          <button type="button" onClick={backToDay} className="h-14 rounded-2xl text-[17px] font-bold" style={{ background: 'var(--aqua)', color: 'var(--on-aqua)' }}>
            Done
          </button>
        </div>
      </div>

      {infoOpen && ex.exercise_id ? (
        <InfoSheet
          block={{ name: ex.name, exercise_id: ex.exercise_id, targetMuscle: ex.target_muscle, notes: ex.notes, cues: ex.cues }}
          detail={null}
          alternativeCount={ex.alternatives?.length ?? 0}
          accessToken={session?.access_token}
          onAlternatives={() => {
            setInfoOpen(false);
            setSwapOpen(true);
          }}
          onClose={() => setInfoOpen(false)}
        />
      ) : null}

      {swapOpen ? (
        <FindAlternativeDialog
          accessToken={session?.access_token}
          name={ex.name}
          exerciseId={ex.exercise_id}
          coachAlternatives={ex.alternatives}
          title={ex.exercise_id ? 'Find an alternative' : 'Find it in the catalog'}
          onClose={() => setSwapOpen(false)}
          onPick={(pick) => {
            // A draft edit like any other: it persists with the day's Save.
            replaceDraftExercise(section, index, swapPlanExercise(ex, pick));
            setSwapOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

function RowLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-[15px] font-bold" style={{ color: 'var(--ink)' }}>{label}</span>
      {hint ? <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{hint}</span> : null}
    </span>
  );
}

/** Label, then −, the value (select to type) and +. Holding a button keeps stepping. */
function StepRow({
  label,
  hint,
  value,
  unit,
  step = 1,
  min = 0,
  decimals = 0,
  bigStep,
  onDelta,
  onSet,
}: {
  label: string;
  hint?: string;
  value: number;
  unit?: string;
  step?: number;
  min?: number;
  decimals?: number;
  bigStep?: number;
  onDelta: (delta: number, scale: number) => void;
  onSet?: (value: number) => void;
}) {
  const dec = useHoldRepeat((scale) => onDelta(-step, scale), { bigStep });
  const inc = useHoldRepeat((scale) => onDelta(step, scale), { bigStep });
  const button = 'flex h-11 w-11 flex-none select-none items-center justify-center rounded-full disabled:opacity-35';
  return (
    <div className="flex min-h-16 items-center gap-2 px-4 py-2.5">
      <RowLabel label={label} hint={hint} />
      <button type="button" {...dec} disabled={value <= min} aria-label={`Less ${label.toLowerCase()}`} className={button} style={{ background: 'var(--sunken)' }}>
        <Minus size={18} color="var(--ink)" aria-hidden="true" />
      </button>
      <span className="flex min-w-16 items-baseline justify-center gap-1">
        {onSet ? (
          <NumberEntry value={value} decimals={decimals} min={min} onCommit={onSet} label={`${label}${unit ? ` in ${unit}` : ''}`} className="font-number min-w-[40px] text-[24px]" color="var(--ink)" />
        ) : (
          <span className="font-number text-[24px]" style={{ color: 'var(--ink)' }}>{value}</span>
        )}
        {unit ? <span className="text-[13px] font-semibold" style={{ color: 'var(--ink-3)' }}>{unit}</span> : null}
      </span>
      <button type="button" {...inc} aria-label={`More ${label.toLowerCase()}`} className={button} style={{ background: 'var(--sunken)' }}>
        <Plus size={18} color="var(--ink)" aria-hidden="true" />
      </button>
    </div>
  );
}

function TextRow({ id, label, hint, value, numeric, onChange }: { id: string; label: string; hint?: string; value: string; numeric?: boolean; onChange: (text: string) => void }) {
  return (
    <div className="flex min-h-16 items-center gap-3 px-4 py-2.5">
      <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold" style={{ color: 'var(--ink)' }}>{label}</span>
        {hint ? <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{hint}</span> : null}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-12 rounded-xl px-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--aqua)] ${numeric ? 'font-number w-24 text-center text-[24px]' : 'w-44 text-[15px]'}`}
        style={{ background: 'var(--ground)', color: 'var(--ink)' }}
      />
    </div>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-2 px-4 text-[15px] font-bold" style={{ color: 'var(--teal)' }}>
      <Plus size={17} aria-hidden="true" /> {label}
    </button>
  );
}

function ChipRow<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: { value: T; label: string }[];
  value: T | '';
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] font-bold" style={{ color: 'var(--ink)' }}>{label}</span>
        {hint ? <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>{hint}</span> : null}
      </div>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className="h-10 min-w-[52px] rounded-xl px-3 text-[14px] font-bold"
            style={{ background: o.value === value ? 'var(--ink)' : 'var(--ground)', color: o.value === value ? 'var(--ground)' : 'var(--ink)' }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SwitchRow({ label, hint, on, onToggle }: { label: string; hint: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onToggle} className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left">
      <RowLabel label={label} hint={hint} />
      <span aria-hidden="true" className={`flex h-8 w-[52px] flex-none rounded-full p-[3px] ${on ? 'justify-end' : 'justify-start'}`} style={{ background: on ? 'var(--aqua)' : 'var(--sunken)' }}>
        <span className="h-[26px] w-[26px] rounded-full" style={{ background: on ? 'var(--on-aqua)' : 'var(--ink-3)' }} />
      </span>
    </button>
  );
}

// ─── Last time ────────────────────────────────────────────────────────────────

function LastTime({
  exerciseId,
  fallback,
  canApply,
  weightOnly = false,
  onApply,
}: {
  exerciseId: string;
  fallback?: DashboardExercise['last_performance'];
  canApply: boolean;
  /** A hold has no rep count to restore, so only a recorded load can be applied. */
  weightOnly?: boolean;
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
        // Background lookup: keep the plan's cached value (or nothing) on failure.
      }
    })();
    return () => {
      active = false;
    };
  }, [session, exerciseId, fallback]);

  // A weight of 0 is body weight: "8 reps", never "8 × 0 kg".
  const loaded = last?.weight != null && last.weight > 0;
  if (!last || (last.reps == null && !loaded)) return null;
  const when = relativeDay(last.performed_at);
  const what = loaded
    ? [last.reps != null ? String(last.reps) : null, `${last.weight} ${last.weight_unit ?? ''}`.trim()].filter(Boolean).join(' × ')
    : `${last.reps} reps`;
  return (
    <div className={`${card} flex items-center gap-3 px-4 py-3`}>
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Last time{when ? ` · ${when}` : ''}</span>
        <span className="font-number text-[22px]" style={{ color: 'var(--ink)' }}>{what}</span>
      </span>
      {canApply && (loaded || (!weightOnly && last.reps != null)) ? (
        <button type="button" onClick={() => onApply(last)} className="min-h-[44px] rounded-full px-4 text-[14px] font-bold" style={{ background: 'var(--sunken)', color: 'var(--ink)' }}>
          Use these
        </button>
      ) : null}
    </div>
  );
}
