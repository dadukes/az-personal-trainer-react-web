import { useCallback, useEffect, useState } from 'react';

import BodyMeasurementDialog, { type BodyMeasurementEntry } from '@/components/BodyMeasurementDialog';
import HealthTrendChart from '@/components/HealthTrendChart';
import {
  ConsistencyGridCard,
  KpiRow,
  StrengthTableCard,
  TrainingTimeCard,
  WeightChartCard,
  type Kpi,
} from '@/components/ProgressReport';
import { BodyCard } from '@/components/ProgressSnapshotSection';
import { Segmented, Surface } from '@/components/ui';
import {
  deleteBodyMeasurement,
  getBodyMeasurements,
  getHealthLogs,
  getProgress,
  getProgressInsights,
  getProgressReport,
  saveBodyMeasurements,
  updateBodyMeasurement,
  type BodyMeasurement,
  type BodyMetric,
  type HealthInsight,
  type HealthLog,
  type ProgressReport,
  type ReportRange,
} from '@/lib/api';
import { formatMetricChange } from '@/lib/body';
import { levelLine } from '@/lib/progress';
import {
  DEFAULT_REPORT_RANGE,
  isReportRange,
  REPORT_RANGES,
  reportIsEmpty,
  sessionsSub,
  zone2PlusPerWeek,
} from '@/lib/report';
import { formatNumber } from '@/lib/units';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

/** Body history window for the entries list. */
const BODY_HISTORY_DAYS = 90;

/** The chosen range, remembered in this browser only. */
const RANGE_KEY = 'forma:progress-range';

function storedRange(): ReportRange {
  try {
    const value = localStorage.getItem(RANGE_KEY);
    return isReportRange(value) ? value : DEFAULT_REPORT_RANGE;
  } catch {
    return DEFAULT_REPORT_RANGE;
  }
}

function bodyHistoryFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - BODY_HISTORY_DAYS);
  return d.toISOString();
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Add (`editing` null) or edit an existing manual/coach row. */
type BodyDialogState = { editing: BodyMeasurement | null; metric: BodyMetric | null } | null;

/**
 * Progress as a reporting page (Phase 9, board `WebProgress`): a range from 4 weeks to a year
 * scopes the KPI row and the four report cards (`GET /progress/report`). Body entries, health
 * trends and the coach's insights follow. On a phone the same cards stack.
 */
export default function ProgressPage() {
  const { session } = useAuth();
  const { gamification, setGamification } = useAppStore();
  const progressSnapshot = useAppStore((s) => s.progressSnapshot);
  const setProgressSnapshot = useAppStore((s) => s.setProgressSnapshot);
  const unitSystem = useAppStore((s) => s.profile.preferred_unit_system);
  const [range, setRange] = useState<ReportRange>(storedRange);
  const [report, setReport] = useState<ProgressReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(false);
  const [bodyMeasurements, setBodyMeasurements] = useState<BodyMeasurement[]>([]);
  const [bodyDialog, setBodyDialog] = useState<BodyDialogState>(null);
  const [bodySaving, setBodySaving] = useState(false);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [insights, setInsights] = useState<HealthInsight[]>([]);
  const [streakDays, setStreakDays] = useState<number | null>(null);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);

  const chooseRange = (next: ReportRange) => {
    setRange(next);
    try {
      localStorage.setItem(RANGE_KEY, next);
    } catch {
      // Remembering the range is a convenience.
    }
  };

  // Level, streak, VO2 max, resting HR and body changes: the 28-day snapshot. No LLM.
  useEffect(() => {
    if (!session?.access_token) return;
    const token = session.access_token;
    let mounted = true;
    void (async () => {
      try {
        const result = await getProgress(token);
        if (!mounted) return;
        setGamification({
          current_level: result.data.current_level,
          current_xp: result.data.current_xp,
          xp_to_next_level: result.data.xp_to_next_level,
        });
        setStreakDays(result.data.this_week?.consistency_streak_days ?? null);
        setProgressSnapshot(result.data.progress_snapshot ?? null);
      } catch {
        // Non-blocking
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session, setGamification, setProgressSnapshot]);

  // The report for the chosen range. The previous one stays on screen, dimmed, while it loads.
  const loadReport = useCallback(
    async (token: string, which: ReportRange, isCurrent: () => boolean) => {
      setReportLoading(true);
      try {
        const result = await getProgressReport(token, which);
        if (!isCurrent()) return;
        setReport(result.data);
        setReportError(false);
      } catch {
        if (isCurrent()) setReportError(true);
      } finally {
        if (isCurrent()) setReportLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!session?.access_token) return;
    let current = true;
    void loadReport(session.access_token, range, () => current);
    return () => {
      current = false;
    };
  }, [session, range, loadReport]);

  // Body entries: includes rows the mobile app imported, which show their source and stay read-only.
  useEffect(() => {
    if (!session?.access_token) return;
    const token = session.access_token;
    let mounted = true;
    void (async () => {
      try {
        const { measurements } = await getBodyMeasurements(token, { from: bodyHistoryFrom(), limit: 200 });
        if (mounted) setBodyMeasurements(measurements);
      } catch {
        // Non-blocking: the Body card renders from the snapshot alone.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session]);

  /** Re-reads what a body change affects: the snapshot, the entries and the weight chart. */
  const refreshBody = useCallback(
    async (token: string) => {
      const [progress, body] = await Promise.allSettled([
        getProgress(token),
        getBodyMeasurements(token, { from: bodyHistoryFrom(), limit: 200 }),
      ]);
      if (progress.status === 'fulfilled') setProgressSnapshot(progress.value.data.progress_snapshot ?? null);
      if (body.status === 'fulfilled') setBodyMeasurements(body.value.measurements);
      void loadReport(token, range, () => true);
    },
    [setProgressSnapshot, loadReport, range],
  );

  const openBodyDialog = (state: NonNullable<BodyDialogState>) => {
    setBodyError(null);
    setBodyDialog(state);
  };

  const handleSaveBody = async (entry: BodyMeasurementEntry) => {
    const token = session?.access_token;
    if (!token) {
      setBodyError('Your session is missing. Sign in again and retry.');
      return;
    }
    setBodySaving(true);
    setBodyError(null);
    try {
      const editing = bodyDialog?.editing ?? null;
      if (editing) {
        await updateBodyMeasurement(token, editing.id, {
          value: entry.value,
          measured_at: entry.measured_at,
          note: entry.note,
        });
      } else {
        const { results } = await saveBodyMeasurements(token, [{ ...entry, source: 'manual' }]);
        const result = results[0];
        if (result?.outcome !== 'saved') {
          setBodyError(result?.reason ?? 'That measurement could not be saved.');
          return;
        }
      }
      setBodyDialog(null);
      await refreshBody(token);
    } catch (err) {
      setBodyError(err instanceof Error ? err.message : 'Unable to save the measurement.');
    } finally {
      setBodySaving(false);
    }
  };

  const handleDeleteBody = async () => {
    const token = session?.access_token;
    const editing = bodyDialog?.editing;
    if (!token || !editing) return;
    setBodySaving(true);
    setBodyError(null);
    try {
      await deleteBodyMeasurement(token, editing.id);
      setBodyMeasurements((rows) => rows.filter((r) => r.id !== editing.id));
      setBodyDialog(null);
      await refreshBody(token);
    } catch (err) {
      setBodyError(err instanceof Error ? err.message : 'Unable to delete the measurement.');
    } finally {
      setBodySaving(false);
    }
  };

  // AI insight cards load separately: the endpoint may take a few seconds on a cache miss.
  useEffect(() => {
    if (!session?.access_token) return;
    const token = session.access_token;
    let mounted = true;
    void (async () => {
      try {
        const result = await getProgressInsights(token);
        if (mounted) setInsights(result.data.health_insights);
      } catch {
        // Non-blocking: with no insights the section doesn't show.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session]);

  // Health trends (the chart filters the 90 days to 7/14/30).
  useEffect(() => {
    if (!session?.access_token) return;
    const token = session.access_token;
    let mounted = true;
    void (async () => {
      try {
        const { logs } = await getHealthLogs(token, 90);
        if (mounted) setHealthLogs(logs);
      } catch {
        // Non-blocking: the chart shows its own empty state.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session]);

  // ── The KPI row: only the numbers there are ─────────────────────────────────
  const level = levelLine(gamification);
  const kpis: Kpi[] = [];
  if (report && report.summary.sessions > 0) {
    kpis.push({ label: 'Sessions / week', value: formatNumber(report.summary.sessions_per_week), sub: sessionsSub(report) });
  }
  if (streakDays != null && streakDays > 0) {
    kpis.push({
      label: 'Day streak',
      value: String(streakDays),
      sub: `Level ${level.level} · ${gamification.current_xp.toLocaleString('en-US')} XP`,
    });
  } else {
    kpis.push({ label: 'Level', value: String(level.level), sub: level.label });
  }
  const vo2 = progressSnapshot?.measurements.find((m) => m.metric === 'vo2max_ml_kg_min') ?? null;
  if (vo2) {
    kpis.push({
      label: 'VO2 max',
      value: formatNumber(vo2.latest),
      sub: vo2.change != null ? `${formatMetricChange(vo2.metric, vo2.change, unitSystem)} since ${shortDate(vo2.since)}` : null,
    });
  }
  const restingHr = progressSnapshot?.resting_hr ?? null;
  if (restingHr) {
    const c = restingHr.change;
    kpis.push({
      label: 'Resting HR',
      value: String(restingHr.avg_7d),
      sub: c != null ? `${c > 0 ? '+' : c < 0 ? '−' : '±'}${Math.abs(c)} bpm vs a month ago` : 'Last 7 days',
    });
  }
  const cardio = report?.cardio ?? null;
  const zone2 = zone2PlusPerWeek(cardio);
  if (cardio && zone2 != null) {
    kpis.push({ label: 'Zone 2+ / week', value: `${zone2} min`, sub: `From ${Math.round(cardio.minutes_per_week)} cardio min` });
  } else if (cardio) {
    kpis.push({
      label: 'Cardio / week',
      value: `${Math.round(cardio.minutes_per_week)} min`,
      sub: `${cardio.sessions} ${cardio.sessions === 1 ? 'session' : 'sessions'}`,
    });
  }

  const empty = report != null && reportIsEmpty(report);

  return (
    <div className="mx-auto flex w-full max-w-[1120px] animate-fade-slide-up flex-col gap-5 px-4 pb-28 pt-6 sm:px-10 sm:pt-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="type-screen-title m-0" style={{ color: 'var(--ink)' }}>
            Progress
          </h1>
          <p className="m-0 text-[14px] leading-5" style={{ color: 'var(--ink-2)' }}>
            Consistency over intensity.
          </p>
        </div>
        <div aria-label="Date range" className="w-full sm:w-auto">
          <Segmented options={REPORT_RANGES} value={range} onChange={chooseRange} />
        </div>
      </header>

      {reportError && !report ? (
        <Surface className="flex flex-col gap-1">
          <p className="m-0 text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>
            Couldn&rsquo;t load your progress.
          </p>
          <p className="m-0 text-[14px]" style={{ color: 'var(--ink-2)' }}>
            Check your connection, then pick a range to try again.
          </p>
        </Surface>
      ) : null}

      {!report && !reportError ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: 'var(--teal)', borderTopColor: 'transparent' }} />
        </div>
      ) : null}

      {report ? (
        // A new range keeps the previous one on screen, dimmed, until it arrives.
        <div className="flex flex-col gap-5 transition-opacity" style={{ opacity: reportLoading ? 0.55 : 1 }} aria-busy={reportLoading}>
          <KpiRow kpis={kpis} />
          {empty ? (
            <Surface className="flex flex-col gap-1.5">
              <h2 className="m-0 text-[17px] font-bold" style={{ color: 'var(--ink)' }}>
                Nothing in the last {REPORT_RANGES.find((r) => r.value === range)?.label}
              </h2>
              <p className="m-0 text-[14px] leading-5" style={{ color: 'var(--ink-2)' }}>
                Your workouts, activities and weigh-ins fill this page as you log them. Try a longer range to see earlier ones.
              </p>
            </Surface>
          ) : (
            <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))' }}>
              {report.strength ? <StrengthTableCard strength={report.strength} unitSystem={unitSystem} /> : null}
              {report.weight ? (
                <WeightChartCard
                  weight={report.weight}
                  from={report.from}
                  to={report.to}
                  range={report.range}
                  unitSystem={unitSystem}
                  onAdd={() => openBodyDialog({ editing: null, metric: 'weight_kg' })}
                />
              ) : null}
              <TrainingTimeCard report={report} />
              <ConsistencyGridCard report={report} />
            </div>
          )}
        </div>
      ) : null}

      <div className="grid items-start gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))' }}>
        <BodyCard
          snapshot={progressSnapshot}
          measurements={bodyMeasurements}
          unitSystem={unitSystem}
          onAdd={(metric) => openBodyDialog({ editing: null, metric })}
          onEdit={(row) => openBodyDialog({ editing: row, metric: row.metric })}
        />
        <HealthTrendChart logs={healthLogs} />
      </div>

      {/* From your coach: real insights only, never placeholders. */}
      {insights.length > 0 ? (
        <section aria-label="Insights from your coach" className="flex flex-col gap-2.5">
          <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
            From your coach
          </h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}>
            {insights.map((insight, i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-surface p-4" style={{ background: 'var(--tint)' }}>
                <span className="text-[15px] font-bold leading-[21px]" style={{ color: 'var(--ink)' }}>
                  {insight.title}
                </span>
                <span className="text-[14px] leading-5" style={{ color: 'var(--ink-2)' }}>
                  {insight.description}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {bodyDialog ? (
        <BodyMeasurementDialog
          editing={bodyDialog.editing}
          initialMetric={bodyDialog.metric}
          unitSystem={unitSystem}
          saving={bodySaving}
          error={bodyError}
          measurements={bodyMeasurements}
          onSave={(entry) => void handleSaveBody(entry)}
          onDelete={bodyDialog.editing ? () => void handleDeleteBody() : undefined}
          onClose={() => setBodyDialog(null)}
        />
      ) : null}
    </div>
  );
}
