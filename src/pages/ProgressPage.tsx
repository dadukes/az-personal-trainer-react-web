import { useCallback, useEffect, useState } from 'react';

import BodyMeasurementDialog, { type BodyMeasurementEntry } from '@/components/BodyMeasurementDialog';
import HealthTrendChart from '@/components/HealthTrendChart';
import { BodyCard, ConsistencyCard, FitnessCard, StrengthCard } from '@/components/ProgressSnapshotSection';
import ScreenHeader from '@/components/ScreenHeader';
import {
  deleteBodyMeasurement,
  getBodyMeasurements,
  getHealthLogs,
  getHistory,
  getProgress,
  getProgressInsights,
  saveBodyMeasurements,
  updateBodyMeasurement,
  type BodyMeasurement,
  type BodyMetric,
  type HealthInsight,
  type HealthLog,
  type HistoryItem,
} from '@/lib/api';
import { consistencyGrid, levelLine, needsOlderHistory, type GridDay } from '@/lib/progress';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

/** Body history window: enough for the 28-day sparkline plus the full entries list. */
const BODY_HISTORY_DAYS = 90;

/** At most this many `/history` pages for the grid (50 items each). */
const GRID_MAX_PAGES = 4;

function bodyHistoryFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - BODY_HISTORY_DAYS);
  return d.toISOString();
}

function localISODate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Enough of `/history` to fill the 28-day grid, newest first. */
async function loadGridHistory(token: string): Promise<HistoryItem[]> {
  const today = localISODate();
  const items: HistoryItem[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < GRID_MAX_PAGES; page += 1) {
    const res = await getHistory(token, { before: cursor, limit: 50 });
    items.push(...res.items);
    cursor = res.next_cursor;
    if (!needsOlderHistory(items, cursor, today)) break;
  }
  return items;
}

/** Add (`editing` null) or edit an existing manual/coach row. */
type BodyDialogState = { editing: BodyMeasurement | null; metric: BodyMetric | null } | null;

export default function ProgressPage() {
  const { session } = useAuth();
  const { gamification, setGamification } = useAppStore();
  const progressSnapshot = useAppStore((s) => s.progressSnapshot);
  const setProgressSnapshot = useAppStore((s) => s.setProgressSnapshot);
  const unitSystem = useAppStore((s) => s.profile.preferred_unit_system);
  const [bodyMeasurements, setBodyMeasurements] = useState<BodyMeasurement[]>([]);
  const [bodyDialog, setBodyDialog] = useState<BodyDialogState>(null);
  const [bodySaving, setBodySaving] = useState(false);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [insights, setInsights] = useState<HealthInsight[]>([]);
  const [streakDays, setStreakDays] = useState<number | null>(null);
  const [grid, setGrid] = useState<GridDay[] | null>(null);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(false);

  // Fast path: level/XP, weekly activity, and the deterministic health-summary stats. No LLM.
  useEffect(() => {
    if (!session?.access_token) return;
    const token = session.access_token;
    let mounted = true;
    setLoading(true);
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
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session, setGamification, setProgressSnapshot]);

  // Body history (sparkline + entries) — independent, non-blocking. Includes rows the mobile
  // app imported from Health Connect, which show their source and stay read-only here.
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

  /** Re-reads what a body change affects: the snapshot and the entries list. */
  const refreshBody = useCallback(
    async (token: string) => {
      const [progress, body] = await Promise.allSettled([
        getProgress(token),
        getBodyMeasurements(token, { from: bodyHistoryFrom(), limit: 200 }),
      ]);
      if (progress.status === 'fulfilled') setProgressSnapshot(progress.value.data.progress_snapshot ?? null);
      if (body.status === 'fulfilled') setBodyMeasurements(body.value.measurements);
    },
    [setProgressSnapshot],
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

  // AI insight cards load separately and non-blocking — the endpoint may take a few seconds on a
  // cache miss, so it must never gate the stats above.
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

  // The consistency grid's days, from the activity timeline.
  useEffect(() => {
    if (!session?.access_token) return;
    const token = session.access_token;
    let mounted = true;
    void (async () => {
      try {
        const items = await loadGridHistory(token);
        if (mounted) setGrid(consistencyGrid(items, localISODate()));
      } catch {
        // Non-blocking: the card shows its numbers without the grid.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session]);

  // Health trends load independently so a slow/empty logs read never blocks the
  // level + insights UI (max window = 90 days; the chart filters to 7/14/30).
  useEffect(() => {
    if (!session?.access_token) return;
    const token = session.access_token;
    let mounted = true;
    void (async () => {
      try {
        const { logs } = await getHealthLogs(token, 90);
        if (mounted) setHealthLogs(logs);
      } catch {
        // Non-blocking — the chart shows its own empty state.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session]);

  const level = levelLine(gamification);
  const strength = progressSnapshot?.strength ?? null;

  return (
    <div className="mx-auto flex w-full max-w-[680px] animate-fade-slide-up flex-col gap-5 px-4 pb-28 pt-6 sm:px-10 sm:pt-10">
      <ScreenHeader title="Progress" subtitle="Consistency over intensity." />

      {/* Level: one thin bar */}
      {loading && gamification.current_xp === 0 ? (
        <div className="flex h-[38px] items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--teal)', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <section aria-label="Level" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[14px] font-bold" style={{ color: 'var(--ink)' }}>
              Level {level.level}
            </span>
            {level.fresh ? (
              <span className="type-meta" style={{ color: 'var(--ink-2)' }}>
                {level.label}
              </span>
            ) : (
              <span className="type-stat text-[19px] font-semibold" style={{ color: 'var(--ink-2)' }}>
                {level.label}
              </span>
            )}
          </div>
          <div
            role="progressbar"
            aria-valuenow={level.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${level.percent} percent of the way to level ${level.level + 1}`}
            className="h-2 overflow-hidden rounded"
            style={{ background: 'var(--sunken)' }}
          >
            <div className="h-2 rounded" style={{ width: `${level.percent}%`, background: 'var(--gold-fill)' }} />
          </div>
        </section>
      )}

      {strength && strength.exercises_tracked > 0 ? <StrengthCard strength={strength} unitSystem={unitSystem} /> : null}

      <ConsistencyCard
        consistency={progressSnapshot?.consistency ?? null}
        windowDays={progressSnapshot?.window_days ?? 28}
        streakDays={streakDays}
        grid={grid}
      />

      <BodyCard
        snapshot={progressSnapshot}
        measurements={bodyMeasurements}
        unitSystem={unitSystem}
        onAdd={(metric) => openBodyDialog({ editing: null, metric })}
        onEdit={(row) => openBodyDialog({ editing: row, metric: row.metric })}
      />

      <FitnessCard
        snapshot={progressSnapshot}
        unitSystem={unitSystem}
        onAddVo2={() => openBodyDialog({ editing: null, metric: 'vo2max_ml_kg_min' })}
      />

      <HealthTrendChart logs={healthLogs} />

      {/* From your coach: real insights only, never placeholders. */}
      {insights.length > 0 ? (
        <section aria-label="Insights from your coach" className="flex flex-col gap-2.5">
          <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
            From your coach
          </h2>
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
        </section>
      ) : null}

      {bodyDialog ? (
        <BodyMeasurementDialog
          editing={bodyDialog.editing}
          initialMetric={bodyDialog.metric}
          unitSystem={unitSystem}
          saving={bodySaving}
          error={bodyError}
          onSave={(entry) => void handleSaveBody(entry)}
          onDelete={bodyDialog.editing ? () => void handleDeleteBody() : undefined}
          onClose={() => setBodyDialog(null)}
        />
      ) : null}
    </div>
  );
}
