import { Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button, Chip, Input } from '@/components/ui';
import { EDITABLE_TYPES } from '@/lib/activities';
import type { ActivityItem, ActivityUpdatePayload } from '@/lib/api';
import type { UnitSystem } from '@/lib/units';

const KM_PER_MILE = 1.609344;

interface ActivityEditDialogProps {
  /** A coach or quick log (device imports never open this). */
  activity: ActivityItem;
  unitSystem: UnitSystem;
  saving: boolean;
  error: string | null;
  /** Only the fields that changed; empty means nothing to save. */
  onSave: (changes: ActivityUpdatePayload) => void;
  onDelete: () => void;
  onClose: () => void;
}

function parseNumber(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : 'invalid';
}

/**
 * Edit or delete an activity the user logged by hand (quick log or told to the coach).
 * Presentational, like `BodyMeasurementDialog`: the page owns the API calls. Distance is
 * typed in the user's units and sent in km; the server recomputes XP when the type,
 * duration or distance changes.
 */
export default function ActivityEditDialog({ activity, unitSystem, saving, error, onSave, onDelete, onClose }: ActivityEditDialogProps) {
  const imperial = unitSystem === 'imperial';
  const [type, setType] = useState(activity.activity_type);
  const [minutes, setMinutes] = useState(activity.duration_minutes != null ? String(activity.duration_minutes) : '');
  const [distance, setDistance] = useState(() =>
    activity.distance_km != null
      ? String(Math.round((imperial ? activity.distance_km / KM_PER_MILE : activity.distance_km) * 100) / 100)
      : '',
  );
  const [notes, setNotes] = useState(activity.notes ?? '');
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saving, onClose]);

  const handleSave = () => {
    const mins = parseNumber(minutes);
    const dist = parseNumber(distance);
    if (mins === 'invalid') return setLocalError('Duration must be a positive number of minutes.');
    if (dist === 'invalid') return setLocalError('Distance must be a positive number.');
    const km = dist == null ? null : Math.round((imperial ? dist * KM_PER_MILE : dist) * 100) / 100;
    const changes: ActivityUpdatePayload = {};
    if (type !== activity.activity_type) changes.activity_type = type;
    const roundedMins = mins == null ? null : Math.round(mins);
    if (roundedMins !== activity.duration_minutes) changes.duration_minutes = roundedMins;
    // Compare in the displayed precision so re-saving an untouched imperial value isn't a change.
    if ((km == null) !== (activity.distance_km == null) || (km != null && Math.abs(km - (activity.distance_km ?? 0)) > 0.01)) {
      changes.distance_km = km;
    }
    const trimmedNotes = notes.trim() || null;
    if (trimmedNotes !== (activity.notes?.trim() || null)) changes.notes = trimmedNotes;
    setLocalError(null);
    if (Object.keys(changes).length === 0) return onClose();
    onSave(changes);
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
        aria-label="Edit activity"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[calc(100dvh-40px)] w-full max-w-[460px] overflow-y-auto rounded-[24px] p-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--bg-selected)' }}>
              <Pencil size={18} color="var(--text-on-mint)" />
            </div>
            <div>
              <div className="text-[17px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                Edit activity
              </div>
              <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                XP updates to match.
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

        <div className="mt-5 flex flex-wrap gap-2" role="radiogroup" aria-label="Type">
          {EDITABLE_TYPES.map((option) => (
            <Chip key={option.type} active={type === option.type} onClick={() => setType(option.type)} className="!px-3.5 !py-1.5">
              {option.label}
            </Chip>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Input
            label="Duration (min)"
            inputMode="numeric"
            placeholder="min"
            value={minutes}
            onChange={(e) => {
              setMinutes(e.target.value);
              setLocalError(null);
            }}
          />
          <Input
            label={`Distance (${imperial ? 'mi' : 'km'})`}
            inputMode="decimal"
            placeholder="optional"
            value={distance}
            onChange={(e) => {
              setDistance(e.target.value);
              setLocalError(null);
            }}
          />
        </div>
        <div className="mt-3">
          <Input
            label="Note (optional)"
            maxLength={1000}
            placeholder="e.g. Yoga with Sam"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
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
          <Button fullWidth disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>

        <div className="mt-4 flex justify-center">
          {confirmDelete ? (
            <div className="flex items-center gap-3 text-[13px]">
              <span style={{ color: 'var(--text-secondary)' }}>Delete this activity and its XP?</span>
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
              <Trash2 size={15} /> Delete activity
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
