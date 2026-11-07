import { useState } from 'react';

import DayPicker from '@/components/DayPicker';
import { Sheet } from '@/components/ui';
import type { BodyMeasurement, BodyMetric } from '@/lib/api';
import { BODY_METRIC_ORDER, BODY_METRICS, formatMetric, metricFromDisplay, metricToDisplay, metricUnit } from '@/lib/body';
import { formatNumber, type UnitSystem } from '@/lib/units';

/** What the dialog hands back — `value` is already canonical (kg / cm). */
export interface BodyMeasurementEntry {
  metric: BodyMetric;
  value: number;
  measured_at: string;
  note: string | null;
}

interface BodyMeasurementDialogProps {
  /** Edit an existing `manual`/`coach` row; omitted = add a new one. */
  editing?: BodyMeasurement | null;
  /** Metric to preselect when adding; defaults to weight. */
  initialMetric?: BodyMetric | null;
  unitSystem: UnitSystem;
  saving: boolean;
  error: string | null;
  /** Earlier entries: the newest of the chosen metric shows as "Last". */
  measurements?: BodyMeasurement[];
  onSave: (entry: BodyMeasurementEntry) => void;
  /** Edit mode only. */
  onDelete?: () => void;
  onClose: () => void;
}

/** The common ones show first; the rest are behind More. */
const FIRST_METRICS = 5;

function localDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Today → now; a past day → local noon, so a timezone shift can't move it a day. An
 * edited row keeps its original time when the day is unchanged.
 */
function measuredAtFor(day: string, original: string | null): string {
  if (original && localDateInput(new Date(original)) === day) return original;
  const today = localDateInput(new Date());
  if (day === today) return new Date().toISOString();
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
}

/**
 * Add or edit one body measurement. Presentational, like `HealthCaptureDialog`: the page
 * owns the API calls and the refresh. The value is typed in the user's units and
 * converted to canonical here, so nothing downstream ever sees lb or inches. Mirrors the
 * mobile `body-measurement-sheet`.
 */
export default function BodyMeasurementDialog({
  editing,
  initialMetric,
  unitSystem,
  saving,
  error,
  measurements,
  onSave,
  onDelete,
  onClose,
}: BodyMeasurementDialogProps) {
  const [metric, setMetric] = useState<BodyMetric>(editing?.metric ?? initialMetric ?? 'weight_kg');
  const [raw, setRaw] = useState(() =>
    editing ? formatNumber(metricToDisplay(editing.metric, editing.value, unitSystem), 2) : '',
  );
  const [day, setDay] = useState(() => localDateInput(editing ? new Date(editing.measured_at) : new Date()));
  const [note, setNote] = useState(editing?.note ?? '');
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const meta = BODY_METRICS[metric];
  const unit = metricUnit(metric, unitSystem);
  const parsed = Number(raw.trim().replace(',', '.'));
  const hasValue = raw.trim() !== '' && Number.isFinite(parsed) && parsed > 0;
  const today = localDateInput(new Date());
  const [more, setMore] = useState(() => BODY_METRIC_ORDER.indexOf(metric) >= FIRST_METRICS);
  const last = editing || !measurements
    ? null
    : measurements.filter((m) => m.metric === metric).sort((a, b) => b.measured_at.localeCompare(a.measured_at))[0];
  // Only where earlier entries were passed in can it know this is the first.
  const first = !editing && measurements != null && measurements.length === 0;

  const handleSave = () => {
    if (!hasValue) return;
    if (!day || day > today) {
      setLocalError('Pick a date that isn’t in the future.');
      return;
    }
    const canonical = metricFromDisplay(metric, parsed, unitSystem);
    if (canonical < meta.min || canonical > meta.max) {
      const lo = formatNumber(metricToDisplay(metric, meta.min, unitSystem));
      const hi = formatNumber(metricToDisplay(metric, meta.max, unitSystem));
      setLocalError(`${meta.label} should be between ${lo} and ${hi} ${unit}.`);
      return;
    }
    setLocalError(null);
    onSave({
      metric,
      value: Math.round(canonical * 100) / 100,
      measured_at: measuredAtFor(day, editing?.measured_at ?? null),
      note: note.trim() || null,
    });
  };

  const shownError = localError ?? error;
  const metrics = more ? BODY_METRIC_ORDER : BODY_METRIC_ORDER.slice(0, FIRST_METRICS);
  const name = meta.label.toLowerCase().replace('vo2', 'VO2');

  return (
    <Sheet open title={editing ? `Change ${name}` : 'Add a measurement'} onClose={() => (saving ? undefined : onClose())}>
      <p className="m-0 -mt-3 text-[13.5px] leading-[19px]" style={{ color: 'var(--ink-2)' }}>
        {editing
          ? `Logged ${shortDay(editing.measured_at)}.`
          : first
            ? 'Your first one. Measure at the same time of day and your trend will be clearer.'
            : 'Trends matter more than any single reading.'}
      </p>

      {!editing ? (
        <div role="radiogroup" aria-label="What are you measuring?" className="flex flex-wrap gap-2">
          {metrics.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={metric === m}
              onClick={() => {
                setMetric(m);
                setLocalError(null);
              }}
              className="h-10 rounded-full px-3.5 text-[14px] font-bold"
              style={{ background: metric === m ? 'var(--ink)' : 'var(--ground)', color: metric === m ? 'var(--ground)' : 'var(--ink)' }}
            >
              {BODY_METRICS[m].label}
            </button>
          ))}
          {!more ? (
            <button type="button" onClick={() => setMore(true)} className="h-10 px-3 text-[14px] font-bold" style={{ color: 'var(--teal)' }}>
              More
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="bm-val" className="text-[13.5px] font-semibold" style={{ color: 'var(--ink-2)' }}>
          {meta.label}, {unit}
        </label>
        <div className="flex h-[84px] items-center gap-2 rounded-2xl px-[18px]" style={{ background: 'var(--ground)', outline: '2px solid var(--aqua)' }}>
          <input
            id="bm-val"
            inputMode="decimal"
            maxLength={7}
            value={raw}
            placeholder="0.0"
            autoFocus
            onChange={(e) => {
              setRaw(e.target.value);
              setLocalError(null);
            }}
            className="font-number h-20 min-w-0 flex-1 bg-transparent text-[52px] font-extrabold outline-none"
            style={{ color: 'var(--ink)' }}
          />
          <span aria-hidden="true" className="text-[17px] font-bold" style={{ color: 'var(--ink-2)' }}>{unit}</span>
        </div>
        {last ? (
          <span className="text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
            Last: {formatMetric(metric, last.value, unitSystem)} on {shortDay(last.measured_at)}
          </span>
        ) : null}
      </div>

      <DayPicker value={day} today={today} onChange={setDay} />

      <label className="flex flex-col gap-1.5">
        <span className="text-[13.5px] font-semibold" style={{ color: 'var(--ink-2)' }}>Note, if you like</span>
        <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Morning, before breakfast" className="h-[52px] w-full rounded-[14px] px-3.5 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--aqua)]" style={{ background: 'var(--ground)', color: 'var(--ink)' }} />
      </label>

      {shownError ? <p role="alert" className="m-0 text-[13.5px] font-semibold" style={{ color: 'var(--danger)' }}>{shownError}</p> : null}

      <button type="button" onClick={handleSave} disabled={saving || !hasValue} className="h-14 rounded-2xl text-[17px] font-bold disabled:opacity-50" style={{ background: 'var(--aqua)', color: 'var(--on-aqua)' }}>
        {saving ? 'Saving…' : editing ? 'Save change' : `Save ${name}`}
      </button>

      {editing && onDelete ? (
        confirmDelete ? (
          <div className="flex items-center gap-1">
            <span className="flex-1 text-[14px]" style={{ color: 'var(--ink-2)' }}>Delete this entry?</span>
            <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-[44px] px-2.5 text-[15px] font-bold" style={{ color: 'var(--ink)' }}>Keep</button>
            <button type="button" onClick={onDelete} disabled={saving} className="min-h-[44px] px-2.5 text-[15px] font-bold" style={{ color: 'var(--danger)' }}>Delete</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-[44px] text-[15px] font-bold" style={{ color: 'var(--danger)' }}>
            Delete entry
          </button>
        )
      ) : null}
    </Sheet>
  );
}

function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
