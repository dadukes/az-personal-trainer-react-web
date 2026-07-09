import { HeartPulse, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button, Input } from '@/components/ui';
import type { ManualHealthCapture } from '@/lib/health';

/** The editable fields of a manual capture (everything except the date/timestamp meta). */
export type HealthCaptureValues = Omit<ManualHealthCapture, 'logged_date' | 'captured_at'>;

interface HealthCaptureDialogProps {
  /** Today's previous capture, if any — prefills the form so the user edits, not re-types. */
  initial: ManualHealthCapture | null;
  saving: boolean;
  error: string | null;
  onSave: (values: HealthCaptureValues) => void;
  onClose: () => void;
}

function numToStr(value: number | undefined): string {
  return value != null ? String(value) : '';
}

/** Empty → undefined; otherwise a non-negative number (clamped to `max` when given). */
function parseMetric(raw: string, opts?: { float?: boolean; max?: number }): number | undefined {
  if (!raw.trim()) return undefined;
  const n = opts?.float ? Number.parseFloat(raw) : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return opts?.max != null ? Math.min(n, opts.max) : n;
}

function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div>
      <span
        className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em]"
        style={{ color: 'var(--text-label)' }}
      >
        {label}
      </span>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? undefined : n)}
              className="flex h-10 flex-1 items-center justify-center rounded-xl text-[14px] font-bold transition-transform active:scale-[0.94]"
              style={{
                background: active ? 'var(--bg-selected)' : 'var(--bg-subtle)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border-base)'}`,
                color: active ? 'var(--text-on-mint)' : 'var(--text-secondary)',
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Manual health capture dialog. Presentational: the page owns the API call
 * (`syncHealth`) and persistence; this component only collects the values.
 * All fields are optional — the user logs whatever they know right now and can
 * come back to fill in the rest later the same day.
 */
export default function HealthCaptureDialog({
  initial,
  saving,
  error,
  onSave,
  onClose,
}: HealthCaptureDialogProps) {
  const [sleepHours, setSleepHours] = useState(() => numToStr(initial?.sleep_hours));
  const [restingHr, setRestingHr] = useState(() => numToStr(initial?.resting_heart_rate));
  const [steps, setSteps] = useState(() => numToStr(initial?.step_count));
  const [calories, setCalories] = useState(() => numToStr(initial?.active_calories_burned));
  const [sleepQuality, setSleepQuality] = useState<number | undefined>(initial?.sleep_quality);
  const [energy, setEnergy] = useState<number | undefined>(initial?.energy_level);
  const [notes, setNotes] = useState(initial?.notes ?? '');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saving, onClose]);

  const values: HealthCaptureValues = {
    sleep_hours: parseMetric(sleepHours, { float: true, max: 24 }),
    sleep_quality: sleepQuality,
    energy_level: energy,
    resting_heart_rate: parseMetric(restingHr),
    step_count: parseMetric(steps),
    active_calories_burned: parseMetric(calories),
    notes: notes.trim() || undefined,
  };
  const hasAnyValue = Object.values(values).some((v) => v !== undefined);

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
        aria-label="Log today's health"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[calc(100vh-40px)] w-full max-w-[440px] overflow-y-auto rounded-[24px] p-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ background: 'var(--bg-selected)' }}
            >
              <HeartPulse size={19} color="var(--accent-text)" />
            </div>
            <div>
              <div className="text-[17px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                {initial ? 'Update today’s health' : 'Log today’s health'}
              </div>
              <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                Fill in what you know — update anytime today.
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

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Input
            label="Sleep (hours)"
            type="number"
            inputMode="decimal"
            min={0}
            max={24}
            step={0.5}
            placeholder="7.5"
            value={sleepHours}
            onChange={(e) => setSleepHours(e.target.value)}
          />
          <Input
            label="Resting HR (bpm)"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="62"
            value={restingHr}
            onChange={(e) => setRestingHr(e.target.value)}
          />
          <Input
            label="Steps"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="8000"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
          />
          <Input
            label="Active calories"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="350"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
          />
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <RatingRow label="Sleep quality" value={sleepQuality} onChange={setSleepQuality} />
          <RatingRow label="Energy level" value={energy} onChange={setEnergy} />
          <Input
            label="Notes (optional)"
            type="text"
            maxLength={280}
            placeholder="Anything your coach should know?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error ? (
          <p className="mt-3 text-[13px] font-semibold" style={{ color: 'var(--forma-danger)' }}>
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex gap-3">
          <Button variant="secondary" fullWidth disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button fullWidth disabled={saving || !hasAnyValue} onClick={() => onSave(values)}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
