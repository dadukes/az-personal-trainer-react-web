import { ChevronDown, ChevronUp, Pencil, Plus } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { Surface } from '@/components/ui';
import ZoneBar from '@/components/ZoneBar';
import type { BodyMeasurement, BodyMetric, MeasurementChange, ProgressSnapshot, SignalTrend } from '@/lib/api';
import { BODY_METRICS, formatMetric, formatMetricChange, isEditableSource, sourceLabel } from '@/lib/body';
import { formatExerciseName } from '@/lib/exercise';
import { gridSummary, strengthHeadline, type GridDay } from '@/lib/progress';
import { formatNumber, kgToLb, type UnitSystem } from '@/lib/units';

/**
 * The Progress page's cards, the web twin of the mobile `progress-snapshot-section`:
 * Strength, Consistency (with the 28-day grid), Body and Fitness. A null field means "not
 * tracked" and renders nothing. Body changes stay colour-neutral: "down" isn't good for
 * someone building muscle, and "up" isn't bad.
 */

/** VO2 max is a fitness signal, not a body one: it shows under Fitness. */
const FITNESS_METRICS = new Set<BodyMetric>(['vo2max_ml_kg_min']);

/** Entry rows shown once the list is open, before "Show all". */
const HISTORY_ROWS = 8;

const CONSISTENCY_TREND_COPY: Record<SignalTrend, string> = {
  up: 'More sessions than the 4 weeks before',
  flat: 'Steady with the 4 weeks before',
  down: 'A lighter stretch than the 4 weeks before',
};

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Daily means of weight over the last `days`, oldest first: what the trend line plots. */
function weightDailyMeans(rows: BodyMeasurement[], days: number): number[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const byDay = new Map<string, number[]>();
  for (const r of rows) {
    if (r.metric !== 'weight_kg') continue;
    const d = new Date(r.measured_at);
    if (d < cutoff) continue;
    const key = localDateKey(d);
    byDay.set(key, [...(byDay.get(key) ?? []), r.value]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, values]) => values.reduce((s, v) => s + v, 0) / values.length);
}

// ─── Shared pieces ────────────────────────────────────────────────────────────

/** The small grey name at the top of each card. */
export function CardLabel({ children }: { children: string }) {
  return (
    <h2 className="type-meta m-0 font-bold" style={{ color: 'var(--ink-3)' }}>
      {children}
    </h2>
  );
}

/** A number over its label, with an optional line under it ("+1.1 since Oct 1"). */
function Figure({ value, label, sub }: { value: string; label: string; sub?: string | null }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
      <span className="type-stat truncate text-[36px]" style={{ color: 'var(--ink)' }}>
        {value}
      </span>
      <span className="text-[12.5px] leading-[17px]" style={{ color: 'var(--ink-3)' }}>
        {label}
      </span>
      {sub ? (
        <span className="text-[12px] leading-4" style={{ color: 'var(--ink-2)' }}>
          {sub}
        </span>
      ) : null}
    </div>
  );
}

function LinkButton({ label, onClick, ariaLabel, plus }: { label: string; onClick: () => void; ariaLabel?: string; plus?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="-my-2 inline-flex min-h-11 items-center gap-1 text-[14px] font-bold"
      style={{ color: 'var(--teal)' }}
    >
      {plus ? <Plus size={15} strokeWidth={2.6} aria-hidden /> : null}
      {label}
    </button>
  );
}

// ─── Strength ─────────────────────────────────────────────────────────────────

export function StrengthCard({ strength, unitSystem }: { strength: NonNullable<ProgressSnapshot['strength']>; unitSystem: UnitSystem }) {
  const imperial = unitSystem === 'imperial';
  return (
    <Surface padding="18px 16px 12px" className="flex flex-col gap-3" style={{ borderRadius: 'var(--radius-hero)' }}>
      <div className="flex flex-col gap-1">
        <CardLabel>Strength</CardLabel>
        <p className="type-display m-0 text-[44px]" style={{ color: 'var(--ink)' }}>
          {strengthHeadline(strength)}
        </p>
        <span className="type-meta" style={{ color: 'var(--ink-3)' }}>
          {strength.exercises_improved > 0
            ? 'Last 8 weeks, first session vs latest'
            : 'Keep logging sets, and gains show up here as they happen.'}
        </span>
      </div>
      {strength.top_gains.length > 0 ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {strength.top_gains.map((g) => {
            const fmt = (v: number) =>
              g.measure === 'reps' ? String(Math.round(v)) : formatNumber(imperial ? kgToLb(v) : v, imperial ? 0 : 1);
            const unit = g.measure === 'reps' ? 'reps' : `${imperial ? 'lb' : 'kg'} 1RM`;
            return (
              <li
                key={g.name}
                className="flex min-h-11 items-center justify-between gap-3"
                style={{ borderTop: '1px solid var(--line)' }}
              >
                <span className="min-w-0 truncate text-[14.5px] font-semibold" style={{ color: 'var(--ink)' }}>
                  {formatExerciseName(g.name)}
                </span>
                <span className="type-stat flex-none whitespace-nowrap text-[21px]" style={{ color: 'var(--ink)' }}>
                  {fmt(g.from)} → {fmt(g.to)}{' '}
                  <span className="font-sans text-[12px] font-medium tracking-normal" style={{ color: 'var(--ink-3)' }}>
                    {unit}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Surface>
  );
}

// ─── Consistency ──────────────────────────────────────────────────────────────

export function ConsistencyCard({
  consistency,
  windowDays,
  streakDays,
  grid,
}: {
  consistency: ProgressSnapshot['consistency'];
  windowDays: number;
  streakDays: number | null;
  /** Null until history has loaded; the grid then appears. */
  grid: GridDay[] | null;
}) {
  return (
    <Surface padding="18px 16px" className="flex flex-col gap-3.5" style={{ borderRadius: 'var(--radius-hero)' }}>
      <CardLabel>Consistency</CardLabel>
      {consistency || streakDays != null ? (
        <dl className="m-0 flex gap-2">
          {consistency ? <Figure value={formatNumber(consistency.sessions_per_week)} label="Sessions / week" /> : null}
          {consistency ? <Figure value={String(consistency.active_days)} label={`Active days in ${windowDays}`} /> : null}
          {streakDays != null ? <Figure value={String(streakDays)} label="Day streak" /> : null}
        </dl>
      ) : null}
      {grid ? <ConsistencyGrid days={grid} /> : null}
      {consistency?.trend ? (
        <span className="type-meta" style={{ color: 'var(--ink-2)' }}>
          {CONSISTENCY_TREND_COPY[consistency.trend]}
        </span>
      ) : null}
    </Surface>
  );
}

function ConsistencyGrid({ days }: { days: GridDay[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div role="img" aria-label={gridSummary(days)} className="grid grid-cols-7 gap-[5px]">
        {days.map((d) => (
          <span
            key={d.date}
            title={new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            className="flex h-[30px] items-center justify-center rounded-[7px]"
            style={{
              background: d.mark === 'workout' ? 'var(--aqua)' : d.mark === 'future' ? 'transparent' : 'var(--sunken)',
              boxShadow: d.today ? 'inset 0 0 0 2px var(--ink)' : d.mark === 'future' ? 'inset 0 0 0 1px var(--line)' : undefined,
            }}
          >
            {d.mark === 'other' ? <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--sky-fill)' }} /> : null}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px]" style={{ background: 'var(--aqua)' }} />
          Workout
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--sky-fill)' }} />
          Other activity
        </span>
      </div>
    </div>
  );
}

// ─── Body ─────────────────────────────────────────────────────────────────────

export function BodyCard({
  snapshot,
  measurements,
  unitSystem,
  onAdd,
  onEdit,
}: {
  snapshot: ProgressSnapshot | null;
  /** Recent rows from `GET /body/measurements`, newest first: the trend line and the entries. */
  measurements: BodyMeasurement[];
  unitSystem: UnitSystem;
  onAdd: (metric: BodyMetric | null) => void;
  /** Only offered for manual and coach rows; device imports are read-only. */
  onEdit: (measurement: BodyMeasurement) => void;
}) {
  const weight = snapshot?.weight ?? null;
  const changes = (snapshot?.measurements ?? []).filter((m) => !FITNESS_METRICS.has(m.metric));
  const [entriesOpen, setEntriesOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const weightPoints = useMemo(() => weightDailyMeans(measurements, 28), [measurements]);
  const history = showAll ? measurements : measurements.slice(0, HISTORY_ROWS);
  const hasBody = weight != null || changes.length > 0 || measurements.length > 0;

  return (
    <Surface padding="18px 16px 8px" className="flex flex-col gap-3" style={{ borderRadius: 'var(--radius-hero)' }}>
      <div className="flex min-h-8 items-center justify-between">
        <CardLabel>Body</CardLabel>
        <LinkButton label="Add" ariaLabel="Add a measurement" onClick={() => onAdd(null)} plus />
      </div>

      {!hasBody ? (
        <p className="m-0 pb-2 text-[14px] leading-5" style={{ color: 'var(--ink-2)' }}>
          Add your weight or a measurement to see how it changes. It&apos;s optional.
        </p>
      ) : null}

      {weight ? (
        <button
          type="button"
          onClick={() => onAdd('weight_kg')}
          aria-label={`Weight ${formatMetric('weight_kg', weight.latest_kg, unitSystem)}. Add a weigh-in`}
          className="flex flex-col gap-[3px] text-left"
        >
          <span className="type-display" style={{ color: 'var(--ink)' }}>
            {formatMetric('weight_kg', weight.latest_kg, unitSystem)}
          </span>
          <span className="type-meta" style={{ color: 'var(--ink-3)' }}>
            {weight.trend_kg_per_week != null
              ? `7-day average · ${formatMetricChange('weight_kg', weight.trend_kg_per_week, unitSystem)} / week over ${weight.span_days} days`
              : '7-day average · a few more weigh-ins and the trend shows here'}
          </span>
        </button>
      ) : null}
      {weight?.trend_kg_per_week != null && weightPoints.length >= 2 ? <Sparkline values={weightPoints} /> : null}

      {changes.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
          {changes.map((m) => (
            <MeasurementFigure
              key={m.metric}
              change={m}
              waistToHeight={m.metric === 'waist_cm' ? (snapshot?.waist_to_height ?? null) : null}
              unitSystem={unitSystem}
              onAdd={() => onAdd(m.metric)}
            />
          ))}
        </div>
      ) : null}

      {measurements.length > 0 ? (
        <button
          type="button"
          onClick={() => setEntriesOpen((o) => !o)}
          aria-expanded={entriesOpen}
          className="inline-flex min-h-11 items-center gap-1 self-start text-[14px] font-semibold"
          style={{ color: 'var(--ink-2)' }}
        >
          {entriesOpen ? 'Hide entries' : `Show entries (${measurements.length})`}
          {entriesOpen ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        </button>
      ) : null}

      {entriesOpen && history.length > 0 ? (
        <div className="-mt-2 pb-2">
          {history.map((row) => {
            const editable = isEditableSource(row.source);
            return (
              <div key={row.id} className="flex min-h-[52px] items-center gap-3" style={{ borderTop: '1px solid var(--line)' }}>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>
                    {BODY_METRICS[row.metric].label} · <span className="tabular">{formatMetric(row.metric, row.value, unitSystem)}</span>
                  </div>
                  <div className="truncate text-[12px]" style={{ color: 'var(--ink-3)' }}>
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
                    className="-mr-3 flex h-11 w-11 items-center justify-center"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    <Pencil size={15} aria-hidden />
                  </button>
                ) : null}
              </div>
            );
          })}
          {measurements.length > HISTORY_ROWS ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="flex min-h-11 w-full items-center text-[14px] font-bold"
              style={{ color: 'var(--teal)', borderTop: '1px solid var(--line)' }}
            >
              {showAll ? 'Show fewer' : `Show all ${measurements.length}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </Surface>
  );
}

function MeasurementFigure({
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
  const label = BODY_METRICS[change.metric].label;
  const value = formatMetric(change.metric, change.latest, unitSystem);
  return (
    <button type="button" onClick={onAdd} aria-label={`${label}: ${value}. Add a new reading`} className="flex flex-col gap-[3px] text-left">
      <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
        {label}
      </span>
      <span className="type-stat" style={{ color: 'var(--ink)' }}>
        {value}
      </span>
      {change.change != null ? (
        <span className="text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
          {formatMetricChange(change.metric, change.change, unitSystem)} since {shortDate(change.since)}
        </span>
      ) : null}
      {waistToHeight != null ? (
        <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
          Waist-to-height {formatNumber(waistToHeight, 2)}
        </span>
      ) : null}
    </button>
  );
}

/** The daily means behind the weight trend. No axes: the shape, not the numbers. */
function Sparkline({ values }: { values: number[] }) {
  const W = 326;
  const H = 56;
  const PAD = 6;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (values.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = values.length - 1;
  return (
    <svg role="img" aria-label="Weight over the last 28 days" viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" preserveAspectRatio="none">
      <path d={d} fill="none" stroke="var(--sky)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(last)} cy={y(values[last])} r={4.5} fill="var(--sky)" stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}

// ─── Fitness ──────────────────────────────────────────────────────────────────

/** Renders nothing when there's no VO2 max, resting heart rate or cardio to show. */
export function FitnessCard({
  snapshot,
  unitSystem,
  onAddVo2,
}: {
  snapshot: ProgressSnapshot | null;
  unitSystem: UnitSystem;
  onAddVo2: () => void;
}): ReactNode {
  const vo2 = (snapshot?.measurements ?? []).find((m) => m.metric === 'vo2max_ml_kg_min') ?? null;
  const restingHr = snapshot?.resting_hr ?? null;
  const cardio = snapshot?.cardio ?? null;
  if (!vo2 && !restingHr && !cardio) return null;
  const zones = cardio?.zone_minutes_per_week ?? null;
  const zoneTotal = zones ? zones.reduce((s, m) => s + m, 0) : 0;
  const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}`;

  return (
    <Surface padding="18px 16px" className="flex flex-col gap-3.5" style={{ borderRadius: 'var(--radius-hero)' }}>
      <div className="flex min-h-8 items-center justify-between">
        <CardLabel>Fitness</CardLabel>
        {vo2 ? <LinkButton label="VO2 max" ariaLabel="Add a VO2 max reading" onClick={onAddVo2} plus /> : null}
      </div>
      <div className="flex gap-2">
        {vo2 ? (
          <Figure
            value={formatNumber(vo2.latest)}
            label="VO2 max"
            sub={vo2.change != null ? `${formatMetricChange(vo2.metric, vo2.change, unitSystem)} since ${shortDate(vo2.since)}` : null}
          />
        ) : null}
        {restingHr ? (
          <Figure
            value={String(restingHr.avg_7d)}
            label="Resting HR"
            sub={restingHr.change != null ? `${signed(restingHr.change)} bpm vs a month ago` : null}
          />
        ) : null}
        {cardio ? (
          <Figure
            value={String(Math.round(cardio.minutes_per_week))}
            label="Cardio min / wk"
            sub={`${cardio.sessions} ${cardio.sessions === 1 ? 'session' : 'sessions'} in 4 weeks`}
          />
        ) : null}
      </div>
      {zones && zoneTotal > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="type-meta font-semibold" style={{ color: 'var(--ink-2)' }}>
            About {Math.round(zones.slice(1).reduce((s, m) => s + m, 0))} min / week in zone 2 or above
          </span>
          <ZoneBar values={zones} format={(m) => `${Math.round(m)}m`} />
        </div>
      ) : null}
    </Surface>
  );
}
