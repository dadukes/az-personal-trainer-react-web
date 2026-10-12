import { Ruler, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button, Chip, Input } from '@/components/ui';
import type { BodyMeasurement, BodyMetric } from '@/lib/api';
import { BODY_METRIC_ORDER, BODY_METRICS, metricFromDisplay, metricToDisplay, metricUnit } from '@/lib/body';
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
  onSave: (entry: BodyMeasurementEntry) => void;
  /** Edit mode only. */
  onDelete?: () => void;
  onClose: () => void;
}

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
 * mobile `body-measurement-sheet`, plus editing (mobile only deletes).
 */
export default function BodyMeasurementDialog({
  editing,
  initialMetric,
  unitSystem,
  saving,
  error,
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saving, onClose]);

  const meta = BODY_METRICS[metric];
  const unit = metricUnit(metric, unitSystem);
  const parsed = Number(raw.trim().replace(',', '.'));
  const hasValue = raw.trim() !== '' && Number.isFinite(parsed) && parsed > 0;
  const today = localDateInput(new Date());
  const minDay = localDateInput(new Date(new Date().getFullYear() - 5, 0, 1));

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ background: 'rgba(6,34,77,0.45)' }}
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit measurement' : 'Add a measurement'}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[calc(100dvh-40px)] w-full max-w-[460px] overflow-y-auto rounded-[24px] p-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--bg-selected)' }}>
              <Ruler size={19} color="var(--text-on-mint)" />
            </div>
            <div>
              <div className="text-[17px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                {editing ? `Edit ${meta.label.toLowerCase()}` : 'Add a measurement'}
              </div>
              <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                Optional, private, and only used to show your trends.
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => {
              if (!saving) onClose();
            }}
            className="rounded-full p-1.5 transition-transform active:scale-[0.92]"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* The metric of an existing row is fixed — change it by deleting and re-adding. */}
        {!editing ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {BODY_METRIC_ORDER.map((m) => (
              <Chip
                key={m}
                active={metric === m}
                onClick={() => {
                  setMetric(m);
                  setLocalError(null);
                }}
                className="!px-3.5 !py-1.5"
              >
                {BODY_METRICS[m].label}
              </Chip>
            ))}
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Input
            label={`${meta.label} (${unit})`}
            inputMode="decimal"
            placeholder={unit}
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setLocalError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            autoFocus
          />
          <Input label="Date" type="date" min={minDay} max={today} value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <div className="mt-3">
          <Input
            label="Note (optional)"
            maxLength={1000}
            placeholder="e.g. morning, after a run"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {shownError ? (
          <p className="mt-3 text-[13px] font-semibold" style={{ color: 'var(--forma-danger)' }}>
            {shownError}
          </p>
        ) : null}

        <div className="mt-5 flex gap-3">
          <Button variant="secondary" fullWidth disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button fullWidth disabled={saving || !hasValue} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>

        {editing && onDelete ? (
          <div className="mt-4 flex justify-center">
            {confirmDelete ? (
              <div className="flex items-center gap-3 text-[13px]">
                <span style={{ color: 'var(--text-secondary)' }}>Delete this entry?</span>
                <Button variant="danger" size="sm" disabled={saving} onClick={onDelete}>
                  Delete
                </Button>
                <Button variant="ghost" size="sm" disabled={saving} onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
                style={{ color: 'var(--forma-danger)' }}
              >
                <Trash2 size={15} /> Delete entry
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
