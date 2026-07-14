import { ChevronDown, ChevronLeft, ChevronUp, Dumbbell, History, Info, Link2, Minus, Plus, Search, Shuffle, Sparkles, Trash2, Unlink } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Badge, Button, Card, Eyebrow, Input, SegmentedToggle } from '@/components/ui';
import {
  getExerciseAlternatives,
  getExerciseDetail,
  getLastPerformance,
  getWorkoutPlan,
  searchExercises,
  type CatalogExerciseSummary,
  type DashboardExercise,
  type ExerciseAlternative,
  type ExerciseDetail,
  type LastPerformance,
  type WeightUnit,
} from '@/lib/api';
import { isTimedExercise } from '@/lib/exercise';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore, type PlanSection } from '@/store/useAppStore';

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
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
  onDelta,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  onDelta: (delta: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)' }}>
      <span className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--text-label)' }}>
        {label}
      </span>
      <div className="flex items-center gap-2.5">
        <button
          onClick={() => onDelta(-step)}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className="flex h-7 w-7 items-center justify-center rounded-lg disabled:opacity-30"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
        >
          <Minus size={13} color="var(--text-secondary)" />
        </button>
        <span className="tabular min-w-[40px] text-center text-[16px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
          {value}
        </span>
        <button
          onClick={() => onDelta(step)}
          aria-label={`Increase ${label}`}
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
        >
          <Plus size={13} color="var(--text-secondary)" />
        </button>
      </div>
    </div>
  );
}

// ─── Exercise info (ExerciseDB) ───────────────────────────────────────────────

function ExerciseInfo({ exerciseId }: { exerciseId: string }) {
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
  if (error || !detail) {
    return (
      <Card variant="subtle">
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          {error ?? 'No demo available for this exercise.'}
        </p>
      </Card>
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

// ─── Search / alternatives result row ─────────────────────────────────────────

function CatalogRow({
  item,
  why,
  onPick,
}: {
  item: CatalogExerciseSummary;
  why?: string;
  onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-transform active:scale-[0.99]"
      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)' }}
    >
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}>
        {item.image_url ? (
          <img src={item.image_url} alt="" className="h-full w-full object-contain" />
        ) : (
          <Dumbbell size={18} color="var(--text-muted)" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
          {item.name}
        </div>
        <div className="truncate text-[12px] capitalize" style={{ color: 'var(--text-muted)' }}>
          {why ?? [item.target, item.equipment].filter(Boolean).join(' · ')}
        </div>
      </div>
      <Plus size={16} color="var(--accent-text)" className="flex-shrink-0" />
    </button>
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

  const timed = ex ? isTimedExercise(ex) : false;
  const unit: WeightUnit = (ex?.weight_unit as WeightUnit) ?? (profile.preferred_unit_system === 'imperial' ? 'lb' : 'kg');

  const patch = useCallback(
    (p: Partial<DashboardExercise>) => patchDraftExercise(section, index, p),
    [patchDraftExercise, section, index],
  );

  const pick = useCallback(
    (item: CatalogExerciseSummary) => {
      if (!ex) return;
      const swapped = ex.exercise_id && ex.exercise_id !== item.id ? ex.name : ex.swapped_from;
      replaceDraftExercise(section, index, {
        ...ex,
        name: item.name,
        exercise_id: item.id,
        target_muscle: item.target ?? undefined,
        body_part: item.body_part ?? undefined,
        swapped_from: swapped,
        last_performance: undefined,
      });
    },
    [ex, replaceDraftExercise, section, index],
  );

  // ── Search state (name-search mode: offset-paginated within a bounded set) ──
  // The provider's name search returns a small bounded window (~10 max), so keep the page
  // size below it — otherwise page one grabs everything and "Load more" never shows.
  const SEARCH_PAGE_SIZE = 8;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogExerciseSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const reqIdRef = useRef(0);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setTotal(0);
    setLoadingMore(false);
  }, []);

  // First page: (re)runs whenever the debounced term changes.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || !session?.access_token) {
      setResults([]);
      setTotal(0);
      setSearching(false);
      setLoadingMore(false);
      return;
    }
    setSearching(true);
    const reqId = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      try {
        const res = await searchExercises(session.access_token, {
          search: term,
          limit: SEARCH_PAGE_SIZE,
          offset: 0,
        });
        if (reqId === reqIdRef.current) {
          setResults(res.exercises);
          setTotal(res.total);
        }
      } catch {
        if (reqId === reqIdRef.current) {
          setResults([]);
          setTotal(0);
        }
      } finally {
        if (reqId === reqIdRef.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [query, session]);

  // Next page: append the following offset slice, keyed to the live search request
  // so a fresh query started meanwhile discards this stale page.
  const loadMore = useCallback(async () => {
    const term = query.trim();
    if (!session?.access_token || term.length < 2) return;
    const reqId = reqIdRef.current;
    setLoadingMore(true);
    try {
      const res = await searchExercises(session.access_token, {
        search: term,
        limit: SEARCH_PAGE_SIZE,
        offset: results.length,
      });
      if (reqId === reqIdRef.current) {
        setResults((prev) => [...prev, ...res.exercises]);
        setTotal(res.total);
      }
    } catch {
      /* keep the pages we already have */
    } finally {
      setLoadingMore(false);
    }
  }, [query, session, results.length]);

  const hasMoreResults = results.length < total;

  // ── Alternatives state ──
  const [alts, setAlts] = useState<ExerciseAlternative[] | null>(null);
  const [altsLoading, setAltsLoading] = useState(false);

  const loadAlternatives = useCallback(async () => {
    if (!session?.access_token || !ex?.exercise_id) return;
    setAltsLoading(true);
    try {
      const res = await getExerciseAlternatives(session.access_token, ex.exercise_id);
      setAlts(res.alternatives);
    } catch {
      setAlts([]);
    } finally {
      setAltsLoading(false);
    }
  }, [session, ex?.exercise_id]);

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
            {ex.exercise_id ? (
              <Badge tone="mint">
                <Link2 size={11} /> Linked
              </Badge>
            ) : (
              <Badge tone="gold">Unlinked</Badge>
            )}
          </div>
          <div className="mt-1 truncate text-[22px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
            {ex.name}
          </div>
          {ex.swapped_from ? (
            <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Swapped from {ex.swapped_from}
            </div>
          ) : null}
        </div>
      </div>

      {/* Info / demo */}
      {ex.exercise_id ? (
        <ExerciseInfo exerciseId={ex.exercise_id} />
      ) : (
        <Card variant="subtle">
          <div className="flex items-start gap-2.5">
            <Link2 size={16} color="var(--forma-danger)" className="mt-0.5 flex-shrink-0" />
            <p className="text-[13px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
              This exercise isn&rsquo;t linked to the ExerciseDB catalog, so there&rsquo;s no demo or form guidance.
              Search below to link it — or leave it and we&rsquo;ll try to match it by name when you save.
            </p>
          </div>
        </Card>
      )}

      {/* Last performance */}
      {ex.exercise_id ? (
        <LastPerformanceCard
          exerciseId={ex.exercise_id}
          fallback={ex.last_performance}
          canApply={!timed}
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

          <SegmentedToggle
            tone="mint"
            value={timed ? 'time' : 'reps'}
            onChange={(v) =>
              v === 'time'
                ? patch({ duration_seconds: ex.duration_seconds ?? 30, reps: '' })
                : patch({ reps: ex.reps || '10', duration_seconds: undefined })
            }
            options={[
              { value: 'reps', label: 'Reps & weight' },
              { value: 'time', label: 'Timed / hold' },
            ]}
          />

          <Stepper label="Sets" value={ex.sets ?? 1} min={1} onDelta={(d) => patch({ sets: Math.max(1, (ex.sets ?? 1) + d) })} />

          {timed ? (
            <Stepper
              label="Duration (sec)"
              value={ex.duration_seconds ?? 30}
              step={5}
              min={5}
              onDelta={(d) => patch({ duration_seconds: Math.max(5, (ex.duration_seconds ?? 30) + d) })}
            />
          ) : (
            <>
              <Input
                label="Reps (e.g. 10 or 8–12)"
                value={ex.reps ?? ''}
                onChange={(e) => patch({ reps: e.target.value })}
              />
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Stepper
                    label={`Weight (${unit})`}
                    value={ex.target_weight ?? 0}
                    step={unit === 'kg' ? 2.5 : 5}
                    onDelta={(d) =>
                      patch({
                        target_weight: Math.max(0, Math.round(((ex.target_weight ?? 0) + d) * 10) / 10),
                        weight_unit: unit,
                      })
                    }
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

          <Stepper
            label="Rest (sec)"
            value={ex.rest_seconds ?? 0}
            step={15}
            onDelta={(d) => patch({ rest_seconds: Math.max(0, (ex.rest_seconds ?? 0) + d) })}
          />

          <Input
            label="Notes (optional)"
            value={ex.notes ?? ''}
            placeholder="Tempo, cues, reminders…"
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </div>
      </Card>

      {/* Swap / link */}
      <Card>
        <Eyebrow className="mb-3">Change or link exercise</Eyebrow>

        {ex.exercise_id ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={loadAlternatives} disabled={altsLoading} leftIcon={<Shuffle size={14} />}>
              {altsLoading ? 'Finding…' : 'Suggest alternatives'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => patch({ exercise_id: undefined })} leftIcon={<Unlink size={14} />}>
              Unlink
            </Button>
          </div>
        ) : null}

        {alts ? (
          <div className="mb-3 flex flex-col gap-2">
            {alts.length === 0 ? (
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                No alternatives found.
              </p>
            ) : (
              alts.map((a) => (
                <CatalogRow
                  key={a.id}
                  item={a}
                  why={a.why}
                  onPick={() => {
                    pick(a);
                    setAlts(null);
                  }}
                />
              ))
            )}
          </div>
        ) : null}

        <div className="relative">
          <Search size={16} color="var(--text-muted)" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" />
          <Input
            value={query}
            placeholder="Search ExerciseDB…"
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 40 }}
          />
        </div>

        {searching ? (
          <p className="mt-2 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
            Searching…
          </p>
        ) : results.length > 0 ? (
          <>
            <div className="mb-2 mt-3 text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Showing {results.length}
              {total > results.length ? ` of ${total}` : ''} — matches are loose, scroll for more
            </div>
            <div
              className="flex max-h-[340px] flex-col gap-2 overflow-y-auto pr-1"
              style={{ overscrollBehavior: 'contain' }}
            >
              {results.map((r) => (
                <CatalogRow
                  key={r.id}
                  item={r}
                  onPick={() => {
                    pick(r);
                    clearSearch();
                  }}
                />
              ))}
              {hasMoreResults ? (
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading…' : 'Load more results'}
                </Button>
              ) : null}
            </div>
          </>
        ) : query.trim().length >= 2 ? (
          <p className="mt-2 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
            No matches — you can also keep the typed name and we&rsquo;ll match it on save.
          </p>
        ) : null}
      </Card>

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
