import { useState } from 'react';

import DayPicker from '@/components/DayPicker';
import { Sheet } from '@/components/ui';
import type { ActivityLogPayload, ActivityType, CardioActivityKind } from '@/lib/api';
import { completedAtFor } from '@/lib/captureDay';
import { cardioKindLabel } from '@/lib/exercise';
import { displayToKm, distanceUnit } from '@/lib/units';
import { localISODate } from '@/lib/workout';
import { useAppStore } from '@/store/useAppStore';

/**
 * Quick-log: recording something that happened outside the plan.
 *
 * Deliberately four tiles, not a form — the point is that logging a walk should cost
 * less effort than skipping it. Each tile asks only for what changes its XP: cardio
 * needs distance/time (XP is proportional), a class is flat, a micro win is just a note.
 */

type QuickLogKind = 'walk' | 'cardio' | 'class' | 'micro_win';

const TILES: { kind: QuickLogKind; label: string; hint: string }[] = [
  { kind: 'cardio', label: 'Run or ride', hint: 'Distance counts' },
  { kind: 'walk', label: 'Walk', hint: 'Every step counts' },
  { kind: 'class', label: 'Class', hint: 'Spin, yoga, Pump' },
  { kind: 'micro_win', label: 'Micro win', hint: 'Small, still counts' },
];

const CARDIO_KINDS: CardioActivityKind[] = ['run', 'cycle', 'swim', 'row', 'other'];

const ACTIVITY_TYPE: Record<QuickLogKind, ActivityType> = {
  walk: 'walk',
  cardio: 'cardio',
  class: 'class',
  micro_win: 'micro_win',
};

interface QuickLogDialogProps {
  saving: boolean;
  error: string | null;
  onSave: (payload: ActivityLogPayload) => void;
  onClose: () => void;
}

const label = 'text-[13.5px] font-semibold';
const field = 'w-full rounded-[14px] px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--aqua)]';

export default function QuickLogDialog({ saving, error, onSave, onClose }: QuickLogDialogProps) {
  const system = useAppStore((s) => s.profile.preferred_unit_system);
  const [kind, setKind] = useState<QuickLogKind>('cardio');
  const [cardioKind, setCardioKind] = useState<CardioActivityKind>('run');
  const [minutes, setMinutes] = useState('30');
  const [distance, setDistance] = useState('');
  const [notes, setNotes] = useState('');
  const [today] = useState(() => localISODate());
  const [day, setDay] = useState(today);

  const mins = Number.parseInt(minutes, 10);
  const typed = Number.parseFloat(distance.replace(',', '.'));
  const km = Number.isFinite(typed) && typed > 0 ? displayToKm(typed, system) : NaN;
  const canSave = !saving && (kind === 'micro_win' || (Number.isFinite(mins) && mins > 0));
  const saveLabel =
    kind === 'cardio' ? `Log ${cardioKindLabel(cardioKind).toLowerCase()}` : kind === 'walk' ? 'Log walk' : kind === 'class' ? 'Log class' : 'Log micro win';

  const submit = () => {
    if (!canSave) return;
    const completedAt = completedAtFor(day, today, new Date());
    onSave({
      activity_type: ACTIVITY_TYPE[kind],
      ...(kind !== 'micro_win' && Number.isFinite(mins) && mins > 0 ? { duration_minutes: mins } : {}),
      // Only cardio carries distance, and the backend rejects a non-positive value.
      ...(kind === 'cardio' && Number.isFinite(km) ? { distance_km: Math.round(km * 100) / 100 } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : kind === 'cardio' ? { notes: cardioKindLabel(cardioKind) } : {}),
      ...(completedAt ? { completed_at: completedAt } : {}),
    });
  };

  const pill = (on: boolean) => ({ background: on ? 'var(--ink)' : 'var(--ground)', color: on ? 'var(--ground)' : 'var(--ink)' });

  return (
    <Sheet open title="Log an activity" onClose={() => (saving ? undefined : onClose())}>
      <p className="m-0 -mt-3 text-[13.5px]" style={{ color: 'var(--ink-2)' }}>Not on the plan? It still counts.</p>

      <div role="radiogroup" aria-label="What did you do?" className="grid grid-cols-2 gap-2">
        {TILES.map((t) => (
          <button
            key={t.kind}
            type="button"
            role="radio"
            aria-checked={kind === t.kind}
            onClick={() => setKind(t.kind)}
            className="flex min-h-16 flex-col justify-center gap-0.5 rounded-2xl px-3.5 py-2.5 text-left"
            style={pill(kind === t.kind)}
          >
            <span className="text-[15px] font-bold">{t.label}</span>
            <span className="text-[12.5px] leading-4 opacity-80">{t.hint}</span>
          </button>
        ))}
      </div>

      {kind === 'cardio' ? (
        <div role="radiogroup" aria-label="Which sport" className="flex flex-wrap gap-2">
          {CARDIO_KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={cardioKind === k} onClick={() => setCardioKind(k)} className="h-10 rounded-full px-3.5 text-[14px] font-bold" style={pill(cardioKind === k)}>
              {k === 'other' ? 'Other' : cardioKindLabel(k)}
            </button>
          ))}
        </div>
      ) : null}

      {kind !== 'micro_win' ? (
        <div className={`grid gap-2.5 ${kind === 'cardio' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <label className="flex flex-col gap-1.5">
            <span className={label} style={{ color: 'var(--ink-2)' }}>Minutes</span>
            <input inputMode="numeric" maxLength={4} value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ''))} className={`${field} font-number h-[60px] text-[32px]`} style={{ background: 'var(--ground)', color: 'var(--ink)' }} />
          </label>
          {kind === 'cardio' ? (
            <label className="flex flex-col gap-1.5">
              <span className={label} style={{ color: 'var(--ink-2)' }}>Distance, {distanceUnit(system)}</span>
              <input inputMode="decimal" maxLength={6} value={distance} placeholder="Optional" onChange={(e) => setDistance(e.target.value)} className={`${field} font-number h-[60px] text-[32px] placeholder:font-sans placeholder:text-[16px]`} style={{ background: 'var(--ground)', color: 'var(--ink)' }} />
            </label>
          ) : null}
        </div>
      ) : null}

      <DayPicker value={day} today={today} onChange={setDay} />

      <label className="flex flex-col gap-1.5">
        <span className={label} style={{ color: 'var(--ink-2)' }}>{kind === 'micro_win' ? 'What did you do?' : 'Notes, if you like'}</span>
        <input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder={kind === 'micro_win' ? 'Took the stairs' : 'How did it go?'} className={`${field} h-[52px] text-[15px]`} style={{ background: 'var(--ground)', color: 'var(--ink)' }} />
      </label>

      {error ? <p role="alert" className="m-0 text-[13.5px] font-semibold" style={{ color: 'var(--danger)' }}>{error}</p> : null}

      <button type="button" onClick={submit} disabled={!canSave} className="h-14 rounded-2xl text-[17px] font-bold disabled:opacity-50" style={{ background: 'var(--aqua)', color: 'var(--on-aqua)' }}>
        {saving ? 'Saving…' : saveLabel}
      </button>
    </Sheet>
  );
}
