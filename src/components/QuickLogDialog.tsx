import { Bike, Footprints, Sparkles, Users, X } from 'lucide-react';
import { useMemo, useState, type ComponentType } from 'react';

import { Button, Card, Input } from '@/components/ui';
import type { ActivityLogPayload, ActivityType, CardioActivityKind } from '@/lib/api';
import { cardioKindLabel } from '@/lib/exercise';

/**
 * Quick-log: recording something that happened outside the plan.
 *
 * Deliberately four tiles, not a form — the point is that logging a walk should cost
 * less effort than skipping it. Each tile asks only for what changes its XP: cardio
 * needs distance/time (XP is proportional), a class is flat, a micro win is just a note.
 */

type QuickLogKind = 'walk' | 'cardio' | 'class' | 'micro_win';

interface TileSpec {
  kind: QuickLogKind;
  label: string;
  hint: string;
  icon: ComponentType<{ size?: number; color?: string }>;
}

const TILES: TileSpec[] = [
  { kind: 'cardio', label: 'Run or ride', hint: 'Distance counts', icon: Footprints },
  { kind: 'walk', label: 'Walk', hint: 'Every step', icon: Footprints },
  { kind: 'class', label: 'Class', hint: 'Spin, yoga, Pump', icon: Users },
  { kind: 'micro_win', label: 'Micro win', hint: 'Small, still counts', icon: Sparkles },
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

export default function QuickLogDialog({ saving, error, onSave, onClose }: QuickLogDialogProps) {
  const [kind, setKind] = useState<QuickLogKind | null>(null);
  const [cardioKind, setCardioKind] = useState<CardioActivityKind>('run');
  const [minutes, setMinutes] = useState('30');
  const [distance, setDistance] = useState('');
  const [notes, setNotes] = useState('');

  const payload = useMemo<ActivityLogPayload | null>(() => {
    if (!kind) return null;
    const mins = Number.parseInt(minutes, 10);
    const km = Number.parseFloat(distance);
    return {
      activity_type: ACTIVITY_TYPE[kind],
      ...(Number.isFinite(mins) && mins > 0 ? { duration_minutes: mins } : {}),
      // Only cardio carries distance, and the backend rejects a non-positive value.
      ...(kind === 'cardio' && Number.isFinite(km) && km > 0 ? { distance_km: km } : {}),
      ...(notes.trim()
        ? { notes: notes.trim() }
        : kind === 'cardio'
          ? { notes: cardioKindLabel(cardioKind) }
          : {}),
    };
  }, [kind, minutes, distance, notes, cardioKind]);

  const canSave = !!payload && (kind === 'micro_win' || Number.parseInt(minutes, 10) > 0);

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
        aria-label="Log an activity"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[calc(100vh-40px)] w-full max-w-[440px] overflow-y-auto rounded-[24px] p-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[17px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
              Log something
            </div>
            <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Did something that wasn&rsquo;t in the plan? It still counts.
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
          {TILES.map((tile) => {
            const Icon = tile.kind === 'cardio' && cardioKind === 'cycle' ? Bike : tile.icon;
            const active = kind === tile.kind;
            return (
              <button
                key={tile.kind}
                type="button"
                onClick={() => setKind(tile.kind)}
                className="flex flex-col items-start gap-1.5 rounded-[18px] p-3.5 text-left transition-transform active:scale-[0.98]"
                style={{
                  background: active ? 'var(--bg-selected)' : 'var(--bg-subtle)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border-base)'}`,
                }}
              >
                <Icon size={19} color={active ? 'var(--text-on-mint)' : 'var(--text-secondary)'} />
                <span
                  className="text-[14px] font-bold"
                  style={{ color: active ? 'var(--text-on-mint)' : 'var(--text-primary)' }}
                >
                  {tile.label}
                </span>
                <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                  {tile.hint}
                </span>
              </button>
            );
          })}
        </div>

        {kind ? (
          <div className="mt-4 flex flex-col gap-3">
            {kind === 'cardio' ? (
              <div className="flex flex-wrap gap-2">
                {CARDIO_KINDS.map((ck) => (
                  <button
                    key={ck}
                    type="button"
                    onClick={() => setCardioKind(ck)}
                    className="rounded-full px-3 py-1.5 text-[12.5px] font-bold"
                    style={{
                      background: cardioKind === ck ? 'var(--bg-selected)' : 'var(--bg-surface)',
                      border: `1px solid ${cardioKind === ck ? 'var(--accent)' : 'var(--border-base)'}`,
                      color: cardioKind === ck ? 'var(--text-on-mint)' : 'var(--text-secondary)',
                    }}
                  >
                    {cardioKindLabel(ck)}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              {kind !== 'micro_win' ? (
                <Input
                  label="Minutes"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
              ) : null}
              {kind === 'cardio' ? (
                <Input
                  label="Distance (km)"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.1}
                  placeholder="5"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                />
              ) : null}
            </div>

            <Input
              label={kind === 'micro_win' ? 'What did you do?' : 'Notes (optional)'}
              placeholder={kind === 'micro_win' ? 'Took the stairs' : 'How did it go?'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        ) : null}

        {error ? (
          <Card variant="subtle" className="mt-4" padding="12px 14px">
            <p className="text-[13px]" style={{ color: 'var(--forma-danger)' }}>
              {error}
            </p>
          </Card>
        ) : null}

        <div className="mt-5 flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            fullWidth
            disabled={!canSave || saving}
            onClick={() => payload && onSave(payload)}
          >
            {saving ? 'Logging…' : 'Log it'}
          </Button>
        </div>
      </div>
    </div>
  );
}
