import { ChevronDown, ChevronUp, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';

import { Surface } from '@/components/ui';
import type { BodyMeasurement, BodyMetric, MeasurementChange, ProgressSnapshot } from '@/lib/api';
import { BODY_METRICS, formatMetric, formatMetricChange, isEditableSource, sourceLabel } from '@/lib/body';
import { formatNumber, type UnitSystem } from '@/lib/units';

/**
 * The Progress page's Body card: measurements other than weight from `progress_snapshot`, and
 * every entry, collapsed, with Add and edit. Weight is charted by the report above it
 * (`ProgressReport.tsx`), and strength, consistency and fitness moved there in Phase 9.
 * A null field means "not tracked" and renders nothing. Body changes stay colour-neutral:
 * "down" isn't good for someone building muscle, and "up" isn't bad.
 */

/** VO2 max is a fitness signal, not a body one: it's in the KPI row. */
const FITNESS_METRICS = new Set<BodyMetric>(['vo2max_ml_kg_min']);

/** Entry rows shown once the list is open, before "Show all". */
const HISTORY_ROWS = 8;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

// ─── Body ─────────────────────────────────────────────────────────────────────

export function BodyCard({
  snapshot,
  measurements,
  unitSystem,
  onAdd,
  onEdit,
}: {
  snapshot: ProgressSnapshot | null;
  /** Recent rows from `GET /body/measurements`, newest first: the entries list. */
  measurements: BodyMeasurement[];
  unitSystem: UnitSystem;
  onAdd: (metric: BodyMetric | null) => void;
  /** Only offered for manual and coach rows; device imports are read-only. */
  onEdit: (measurement: BodyMeasurement) => void;
}) {
  const changes = (snapshot?.measurements ?? []).filter((m) => !FITNESS_METRICS.has(m.metric));
  const [entriesOpen, setEntriesOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const history = showAll ? measurements : measurements.slice(0, HISTORY_ROWS);
  const hasBody = changes.length > 0 || measurements.length > 0;

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

      {changes.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
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
