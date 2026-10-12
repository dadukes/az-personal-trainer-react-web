import { Activity, Dumbbell, HeartPulse, Pencil, Plus, Ruler, Scale, Wind } from 'lucide-react';
import type { ComponentType } from 'react';
import { useMemo, useState } from 'react';

import { Card, Eyebrow } from '@/components/ui';
import type { BodyMeasurement, BodyMetric, MeasurementChange, ProgressSnapshot, SignalTrend } from '@/lib/api';
import { BODY_METRICS, formatMetric, formatMetricChange, isEditableSource, sourceLabel } from '@/lib/body';
import { formatNumber, kgToLb, type UnitSystem } from '@/lib/units';

interface ProgressSnapshotSectionProps {
  snapshot: ProgressSnapshot | null;
  /** Recent rows from `GET /body/measurements` (newest first) — sparkline + history. */
  measurements: BodyMeasurement[];
  /** From `this_week` — the snapshot has no streak of its own. */
  streakDays: number | null;
  unitSystem: UnitSystem;
  onAdd: (metric: BodyMetric | null) => void;
  /** Only offered for `manual`/`coach` rows; device imports are read-only. */
  onEdit: (measurement: BodyMeasurement) => void;
}

/** History rows shown before "Show all". */
const HISTORY_ROWS = 8;

/** VO2 max is a fitness signal, not a body one — it renders under Fitness. */
const FITNESS_METRICS = new Set<BodyMetric>(['vo2max_ml_kg_min']);

const CONSISTENCY_TREND_COPY: Record<SignalTrend, string> = {
  up: 'More sessions than the 4 weeks before',
  flat: 'Steady with the 4 weeks before',
  down: 'A lighter stretch than the 4 weeks before',
};

type IconType = ComponentType<{ size?: number; color?: string }>;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Daily means of weight over the last `days`, oldest first — what the trend line plots. */
function weightDailyMeans(rows: BodyMeasurement[], days: number): { day: string; value: number }[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const byDay = new Map<string, number[]>();
  for (const r of rows) {
    if (r.metric !== 'weight_kg') continue;
    const d = new Date(r.measured_at);
    if (d < cutoff) continue;
    const key = localDateKey(d);
    const list = byDay.get(key);
    if (list) list.push(r.value);
    else byDay.set(key, [r.value]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, values]) => ({ day, value: values.reduce((s, v) => s + v, 0) / values.length }));
}

/**
 * "Your progress" on the Progress page, rendered from the backend's `progress_snapshot`
 * — the web twin of the mobile `progress-snapshot-section`. Encouraging signals first
 * (strength, consistency), then body, then fitness. A null field means "not tracked" and
 * simply doesn't render — no prompts to fill it in. Body changes are deliberately
 * colour-neutral: "down" isn't good for a muscle-gain user and "up" isn't bad.
 */
export default function ProgressSnapshotSection({
  snapshot,
  measurements,
  streakDays,
  unitSystem,
  onAdd,
  onEdit,
}: ProgressSnapshotSectionProps) {
  const [showAll, setShowAll] = useState(false);
  const strength = snapshot?.strength ?? null;
  const consistency = snapshot?.consistency ?? null;
  const weight = snapshot?.weight ?? null;
  const bodyChanges = (snapshot?.measurements ?? []).filter((m) => !FITNESS_METRICS.has(m.metric));
  const vo2 = (snapshot?.measurements ?? []).find((m) => m.metric === 'vo2max_ml_kg_min') ?? null;
  const restingHr = snapshot?.resting_hr ?? null;
  const cardio = snapshot?.cardio ?? null;

  const weightPoints = useMemo(() => weightDailyMeans(measurements, 28), [measurements]);
  const history = showAll ? measurements : measurements.slice(0, HISTORY_ROWS);

  const hasBody = weight != null || bodyChanges.length > 0 || measurements.length > 0;
  const hasFitness = vo2 != null || restingHr != null || cardio != null;
  const hasStrength = strength != null && strength.exercises_tracked > 0;

  return (
    <>
      <Eyebrow>Your progress</Eyebrow>

      {hasStrength || consistency ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* ── Strength ── */}
          {hasStrength && strength ? (
            <Card>
              <CardHeader icon={Dumbbell} title="Strength" />
              <div className="mt-2.5 text-[20px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                {strength.exercises_improved > 0
                  ? `${strength.exercises_improved} of ${strength.exercises_tracked} lifts up`
                  : `${strength.exercises_tracked} ${strength.exercises_tracked === 1 ? 'lift' : 'lifts'} tracked`}
              </div>
              <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                {strength.exercises_improved > 0
                  ? 'Over the last 8 weeks, first session vs latest.'
                  : 'Keep logging sets — gains show up here as they happen.'}
              </p>
              {strength.top_gains.length > 0 ? (
                <div className="mt-3 flex flex-col gap-2">
                  {strength.top_gains.map((g) => {
                    const fmt = (v: number) =>
                      g.measure === 'reps'
                        ? String(Math.round(v))
                        : formatNumber(unitSystem === 'imperial' ? kgToLb(v) : v, unitSystem === 'imperial' ? 0 : 1);
                    const unit = g.measure === 'reps' ? 'reps' : `${unitSystem === 'imperial' ? 'lb' : 'kg'} est. 1RM`;
                    return (
                      <div key={g.name} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                          {g.name}
                        </span>
                        <span className="tabular text-[14px] font-bold" style={{ color: 'var(--accent-text)' }}>
                          {fmt(g.from)} → {fmt(g.to)}{' '}
                          <span className="text-[12px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                            {unit}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </Card>
          ) : null}

          {/* ── Consistency ── */}
          {consistency ? (
            <Card>
              <CardHeader icon={Activity} title="Consistency" />
              <div className="mt-3 flex flex-wrap gap-3">
                <Stat value={formatNumber(consistency.sessions_per_week)} label="sessions / week" />
                <Stat value={String(consistency.active_days)} label={`active days in ${snapshot?.window_days ?? 28}`} />
                {streakDays != null ? <Stat value={String(streakDays)} label="day streak" /> : null}
              </div>
              {consistency.trend ? (
                <p className="mt-2.5 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                  {CONSISTENCY_TREND_COPY[consistency.trend]}
                </p>
              ) : null}
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ── Body ── */}
      {hasBody ? (
        <Card>
          <div className="flex items-center justify-between">
            <CardHeader icon={Ruler} title="Body" />
            <PillButton label="Add" icon={Plus} onClick={() => onAdd(null)} ariaLabel="Add a measurement" />
          </div>

          {/* Two columns only when weight and the tiles both show — alone, weight spans the card. */}
          <div
            className={`mt-4 grid grid-cols-1 gap-5 ${weight && bodyChanges.length > 0 ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}`}
          >
            {weight ? (
              <div>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-bold" style={{ color: 'var(--text-secondary)' }}>
                    <Scale size={15} color="var(--accent-text)" /> Weight
                  </span>
                  <PillButton label="Weigh-in" icon={Plus} onClick={() => onAdd('weight_kg')} ariaLabel="Add a weigh-in" />
                </div>
                <div className="tabular mt-1.5 text-[26px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                  {formatMetric('weight_kg', weight.latest_kg, unitSystem)}
                </div>
                <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                  {weight.trend_kg_per_week != null
                    ? `7-day average · ${formatMetricChange('weight_kg', weight.trend_kg_per_week, unitSystem)} / week over ${weight.span_days} days`
                    : '7-day average · a few more weigh-ins and your trend shows here'}
                </p>
                {weight.trend_kg_per_week != null && weightPoints.length >= 2 ? (
                  <Sparkline values={weightPoints.map((p) => p.value)} />
                ) : null}
              </div>
            ) : null}

            {bodyChanges.length > 0 ? (
              <div className="grid grid-cols-2 content-start gap-2.5 sm:grid-cols-3 lg:grid-cols-2">
                {bodyChanges.map((m) => (
                  <MeasurementTile
                    key={m.metric}
                    change={m}
                    waistToHeight={m.metric === 'waist_cm' ? (snapshot?.waist_to_height ?? null) : null}
                    unitSystem={unitSystem}
                    onAdd={() => onAdd(m.metric)}
                  />
                ))}
              </div>
            ) : null}
          </div>

          {history.length > 0 ? (
            <div className="mt-5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-label)' }}>
                  Entries
                </span>
                {measurements.length > HISTORY_ROWS ? (
                  <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="text-[12px] font-bold"
                    style={{ color: 'var(--accent-text)' }}
                  >
                    {showAll ? 'Show fewer' : `Show all ${measurements.length}`}
                  </button>
                ) : null}
              </div>
              {history.map((row) => {
                const editable = isEditableSource(row.source);
                return (
                  <div
                    key={row.id}
                    className="flex items-center gap-3 py-2.5"
                    style={{ borderTop: '1px solid var(--border-subtle)' }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {BODY_METRICS[row.metric].label} · <span className="tabular">{formatMetric(row.metric, row.value, unitSystem)}</span>
                      </div>
                      <div className="truncate text-[12px]" style={{ color: 'var(--text-muted)' }}>
                        {shortDate(row.measured_at)} · {sourceLabel(row.source, row.source_app)}
                        {row.note ? ` · ${row.note}` : ''}
                      </div>
                    </div>
                    {/* Imported rows are read-only: the next sync would restore them. */}
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => onEdit(row)}
                        aria-label={`Edit ${BODY_METRICS[row.metric].label} entry from ${shortDate(row.measured_at)}`}
                        className="rounded-full p-2 transition-transform active:scale-[0.92]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <Pencil size={15} />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </Card>
      ) : (
        <Card>
          <CardHeader icon={Ruler} title="Body" />
          <p className="mt-2.5 text-[14px] leading-5" style={{ color: 'var(--text-secondary)' }}>
            Track weight or measurements to see trends — totally optional.
          </p>
          <div className="mt-3 flex">
            <PillButton label="Add a measurement" icon={Plus} onClick={() => onAdd(null)} ariaLabel="Add a measurement" />
          </div>
        </Card>
      )}

      {/* ── Fitness ── */}
      {hasFitness ? (
        <Card>
          <CardHeader icon={HeartPulse} title="Fitness" />
          <div className="mt-3 flex flex-wrap gap-3">
            {vo2 ? (
              <Stat
                value={formatNumber(vo2.latest)}
                label="VO2 max"
                sub={vo2.change != null ? `${formatMetricChange(vo2.metric, vo2.change, unitSystem)} since ${shortDate(vo2.since)}` : undefined}
              />
            ) : null}
            {restingHr ? (
              <Stat
                value={`${restingHr.avg_7d}`}
                label="resting HR (7-day)"
                sub={
                  restingHr.change != null
                    ? `${restingHr.change > 0 ? '+' : restingHr.change < 0 ? '−' : '±'}${Math.abs(restingHr.change)} bpm vs a month ago`
                    : undefined
                }
              />
            ) : null}
            {cardio ? (
              <Stat
                value={`${Math.round(cardio.minutes_per_week)}`}
                label="cardio min / week"
                sub={`${cardio.sessions} ${cardio.sessions === 1 ? 'session' : 'sessions'} in 4 weeks`}
              />
            ) : null}
          </div>
          {vo2 ? (
            <div className="mt-3 flex">
              <PillButton label="VO2 max" icon={Wind} onClick={() => onAdd('vo2max_ml_kg_min')} ariaLabel="Add VO2 max" />
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function CardHeader({ icon: Icon, title }: { icon: IconType; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={17} color="var(--accent-text)" />
      <span className="text-[15px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
        {title}
      </span>
    </div>
  );
}

function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div
      className="min-w-[120px] flex-1 rounded-2xl p-3.5"
      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="tabular text-[20px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
        {value}
      </div>
      <div className="mt-0.5 text-[11.5px] leading-tight" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      {sub ? (
        <div className="mt-1 text-[11.5px] leading-tight" style={{ color: 'var(--text-secondary)' }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function PillButton({
  label,
  icon: Icon,
  onClick,
  ariaLabel,
}: {
  label: string;
  icon: IconType;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-transform active:scale-[0.96]"
      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)', color: 'var(--accent-text)' }}
    >
      <Icon size={14} color="var(--accent-text)" />
      {label}
    </button>
  );
}

function MeasurementTile({
  change,
  waistToHeight,
  unitSystem,
  onAdd,
}: {
  change: MeasurementChange;
  waistToHeight: number | null;
  unitSystem: UnitSystem;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label={`${BODY_METRICS[change.metric].label}: ${formatMetric(change.metric, change.latest, unitSystem)}. Add a new reading`}
      className="rounded-2xl p-3.5 text-left transition-transform active:scale-[0.98]"
      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-bold" style={{ color: 'var(--text-secondary)' }}>
          {BODY_METRICS[change.metric].label}
        </span>
        <Plus size={14} color="var(--accent-text)" />
      </div>
      <div className="tabular mt-1 text-[18px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
        {formatMetric(change.metric, change.latest, unitSystem)}
      </div>
      {change.change != null ? (
        <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
          {formatMetricChange(change.metric, change.change, unitSystem)} since {shortDate(change.since)}
        </div>
      ) : null}
      {waistToHeight != null ? (
        <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          Waist-to-height {formatNumber(waistToHeight, 2)}
        </div>
      ) : null}
    </button>
  );
}

/** Daily-mean weight line; neutral accent colour — direction is not judged here. */
function Sparkline({ values }: { values: number[] }) {
  const width = 300;
  const height = 56;
  const pad = 5;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  // Stretched to the card width (`preserveAspectRatio="none"`), so no end dot — it would turn oval.
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-14 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
