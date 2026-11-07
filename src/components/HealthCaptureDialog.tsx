import { useState } from 'react';

import { Sheet } from '@/components/ui';
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

export default function HealthCaptureDialog({ initial, saving, error, onSave, onClose }: HealthCaptureDialogProps) {
  const [sleepHours, setSleepHours] = useState(() => numToStr(initial?.sleep_hours));
  const [restingHr, setRestingHr] = useState(() => numToStr(initial?.resting_heart_rate));
  const [steps, setSteps] = useState(() => numToStr(initial?.step_count));
  const [calories, setCalories] = useState(() => numToStr(initial?.active_calories_burned));
  const [sleepQuality, setSleepQuality] = useState<number | undefined>(initial?.sleep_quality);
  const [energy, setEnergy] = useState<number | undefined>(initial?.energy_level);
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const values: HealthCaptureValues = {
    sleep_hours: parseMetric(sleepHours, { float: true, max: 24 }),
    resting_heart_rate: parseMetric(restingHr),
    step_count: parseMetric(steps),
    active_calories_burned: parseMetric(calories),
    sleep_quality: sleepQuality,
    energy_level: energy,
    notes: notes.trim() || undefined,
  };
  const hasAnyValue = Object.values(values).some((v) => v !== undefined);

  const fields: { id: string; label: string; value: string; set: (v: string) => void; unit: string; decimal?: boolean }[] = [
    { id: 'hc-sleep', label: 'Sleep', value: sleepHours, set: setSleepHours, unit: 'h', decimal: true },
    { id: 'hc-rhr', label: 'Resting heart rate', value: restingHr, set: setRestingHr, unit: 'bpm' },
    { id: 'hc-steps', label: 'Steps', value: steps, set: setSteps, unit: '' },
    { id: 'hc-kcal', label: 'Active calories', value: calories, set: setCalories, unit: 'kcal' },
  ];

  return (
    <Sheet open title="Today's health" onClose={() => (saving ? undefined : onClose())}>
      <p className="m-0 -mt-3 text-[13.5px] leading-[19px]" style={{ color: 'var(--ink-2)' }}>
        Add what you know now. You can come back and add the rest later today.
      </p>

      <div className="grid grid-cols-2 gap-2.5">
        {fields.map((f) => (
          <div key={f.id} className="flex flex-col gap-1.5">
            <label htmlFor={f.id} className="text-[13.5px] font-semibold" style={{ color: 'var(--ink-2)' }}>{f.label}</label>
            <div className="flex h-[60px] items-center gap-1.5 rounded-[14px] px-3.5 focus-within:ring-2 focus-within:ring-[var(--aqua)]" style={{ background: 'var(--ground)' }}>
              <input
                id={f.id}
                inputMode={f.decimal ? 'decimal' : 'numeric'}
                maxLength={6}
                value={f.value}
                placeholder="Add"
                onChange={(e) => f.set(e.target.value)}
                className="font-number h-14 min-w-0 flex-1 bg-transparent text-[30px] outline-none placeholder:font-sans placeholder:text-[16px] placeholder:font-semibold"
                style={{ color: 'var(--ink)' }}
              />
              {f.unit ? <span aria-hidden="true" className="text-[13px] font-semibold" style={{ color: 'var(--ink-3)' }}>{f.unit}</span> : null}
            </div>
          </div>
        ))}
      </div>

      <Scale title="How did you sleep?" low="Badly" high="Really well" value={sleepQuality} onChange={setSleepQuality} />
      <Scale title="Energy right now" low="Running on empty" high="Full of beans" value={energy} onChange={setEnergy} />

      <label className="flex flex-col gap-1.5">
        <span className="text-[13.5px] font-semibold" style={{ color: 'var(--ink-2)' }}>Anything your coach should know?</span>
        <input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="Slept badly, big day at work" className="h-[52px] w-full rounded-[14px] px-3.5 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--aqua)]" style={{ background: 'var(--ground)', color: 'var(--ink)' }} />
      </label>

      {error ? <p role="alert" className="m-0 text-[13.5px] font-semibold" style={{ color: 'var(--danger)' }}>{error}</p> : null}

      <button type="button" onClick={() => onSave(values)} disabled={saving || !hasAnyValue} className="h-14 rounded-2xl text-[17px] font-bold disabled:opacity-50" style={{ background: 'var(--aqua)', color: 'var(--on-aqua)' }}>
        {saving ? 'Saving…' : 'Save today’s health'}
      </button>
    </Sheet>
  );
}

/** A 1–5 scale with its two ends named, and Clear once something is picked. */
function Scale({ title, low, high, value, onChange }: { title: string; low: string; high: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex min-h-6 items-center justify-between">
        <h3 className="m-0 text-[15px] font-bold" style={{ color: 'var(--ink)' }}>{title}</h3>
        {value != null ? (
          <button type="button" onClick={() => onChange(undefined)} className="-my-2.5 min-h-[44px] px-1 text-[13.5px] font-bold" style={{ color: 'var(--teal)' }}>
            Clear
          </button>
        ) : null}
      </div>
      <div role="radiogroup" aria-label={`${title}, 1 to 5`} className="grid grid-cols-5 gap-1 rounded-[14px] p-1" style={{ background: 'var(--sunken)' }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${title} ${n} of 5`}
            onClick={() => onChange(n)}
            className="font-number h-11 rounded-[11px] text-[21px]"
            style={{ background: value === n ? 'var(--ink)' : 'transparent', color: value === n ? 'var(--ground)' : 'var(--ink)' }}
          >
            {n}
          </button>
        ))}
      </div>
      <div aria-hidden="true" className="flex justify-between text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </section>
  );
}
