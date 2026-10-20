import { Check, Dumbbell, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { DurationEntry, NumberEntry } from '@/components/NumberEntry';
import { Button } from '@/components/ui';
import type { LoggedSet, SessionExercise, WeightUnit, WorkoutSection } from '@/lib/api';
import {
  editWeightUnit,
  isSingleEntry,
  sameAsLogged,
  seedEditSets,
  setFields,
  toLoggedSets,
  type EditSet,
} from '@/lib/workoutEdit';

const SECTION_NAMES: Record<WorkoutSection, string> = { warmup: 'Warm-up', main: 'Main', cooldown: 'Cool-down' };
const MAX_SETS = 30;

interface WorkoutExerciseDialogProps {
  exercise: SessionExercise;
  /** The user's unit, for an exercise with no logged or planned weight. */
  preferredUnit: WeightUnit;
  saving: boolean;
  error: string | null;
  onSave: (sets: LoggedSet[]) => void;
  onClose: () => void;
}

function subtitle(exercise: SessionExercise): string {
  const section = SECTION_NAMES[exercise.section];
  if (!exercise.earns_xp) return `${section} · Your watch recording already earned this part’s XP.`;
  if (exercise.status === 'done' && exercise.done_by === 'coach') return `${section} · Counted as done with your coach. XP updates to match.`;
  return `${section} · XP updates to match.`;
}

/**
 * Edit one exercise of a logged workout: tick sets done, fix reps / weight / time, add or
 * remove a set. Opening one that wasn't logged seeds it from the plan, ticked, so logging
 * a missed warm-up is one click on Save. Presentational — the page owns the API call.
 * Mobile twin: `components/workout-exercise-sheet.tsx`.
 */
export default function WorkoutExerciseDialog({ exercise, preferredUnit, saving, error, onSave, onClose }: WorkoutExerciseDialogProps) {
  const [sets, setSets] = useState<EditSet[]>(() => seedEditSets(exercise));
  const unit = editWeightUnit(exercise, preferredUnit);
  const fields = setFields(exercise.type);
  const single = isSingleEntry(exercise.type);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saving, onClose]);

  const update = (index: number, patch: Partial<EditSet>) =>
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const allDone = sets.length > 0 && sets.every((s) => s.completed);

  const handleSave = () => {
    const logged = toLoggedSets(sets, exercise.type, unit);
    if (sameAsLogged(exercise, logged)) return onClose();
    onSave(logged);
  };

  const fieldLabel = 'text-[10px] font-bold uppercase tracking-[0.05em]';

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
        aria-label={exercise.name}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[calc(100dvh-40px)] w-full max-w-[500px] overflow-y-auto rounded-[24px] p-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--bg-selected)' }}>
              <Dumbbell size={18} color="var(--text-on-mint)" />
            </div>
            <div className="min-w-0">
              <div className="text-[17px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                {exercise.name}
              </div>
              <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                {subtitle(exercise)}
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

        {!single ? (
          <button
            type="button"
            onClick={() => setSets((prev) => prev.map((s) => ({ ...s, completed: !allDone })))}
            className="mt-4 text-[13px] font-bold"
            style={{ color: 'var(--accent-text)' }}
          >
            {allDone ? 'Untick all' : 'Mark all done'}
          </button>
        ) : null}

        <div className="mt-3 flex flex-col gap-2.5">
          {sets.map((set, index) => {
            // On the mint fill the theme text tokens turn unreadable in dark — use the on-mint ones.
            const ink = set.completed ? 'var(--text-on-mint)' : 'var(--text-primary)';
            const soft = set.completed ? 'var(--text-on-mint-soft)' : 'var(--text-label)';
            return (
            <div
              key={index}
              className="flex items-center gap-3 rounded-2xl p-3"
              style={{
                background: set.completed ? 'var(--bg-selected)' : 'var(--bg-subtle)',
                border: `1px solid ${set.completed ? 'var(--accent)' : 'var(--border-subtle)'}`,
              }}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={set.completed}
                aria-label={single ? 'Done' : `Set ${index + 1} done`}
                onClick={() => update(index, { completed: !set.completed })}
                className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.92]"
                style={{
                  border: `2px solid ${set.completed ? 'var(--accent)' : 'var(--border-strong)'}`,
                  background: set.completed ? 'var(--accent)' : 'transparent',
                }}
              >
                {set.completed ? <Check size={16} strokeWidth={3} color="var(--text-on-accent)" /> : null}
              </button>
              {!single ? (
                <span className="w-[38px] flex-shrink-0 text-[12px] font-bold" style={{ color: soft }}>
                  Set {index + 1}
                </span>
              ) : null}

              <div className="flex min-w-0 flex-1 items-end gap-4">
                {fields.reps ? (
                  <label className="flex flex-col items-center gap-1">
                    <span className={fieldLabel} style={{ color: soft }}>
                      Reps
                    </span>
                    <NumberEntry
                      value={set.reps}
                      onCommit={(reps) => update(index, { reps })}
                      label={`Set ${index + 1} reps`}
                      max={1000}
                      color={ink}
                      className="w-[52px] text-[18px]"
                    />
                  </label>
                ) : null}
                {fields.duration ? (
                  <div className="flex flex-col items-center gap-1">
                    <span className={fieldLabel} style={{ color: soft }}>
                      Time
                    </span>
                    <DurationEntry
                      seconds={set.durationSeconds}
                      onCommit={(durationSeconds) => update(index, { durationSeconds })}
                      label={single ? 'Time' : `Set ${index + 1} time`}
                      className="text-[18px]"
                      style={{ color: ink }}
                    />
                  </div>
                ) : null}
                {fields.weight ? (
                  <label className="flex flex-col items-center gap-1">
                    <span className={fieldLabel} style={{ color: soft }}>
                      {unit}
                    </span>
                    <NumberEntry
                      value={set.weight}
                      decimals={2}
                      onCommit={(weight) => update(index, { weight })}
                      label={`Set ${index + 1} weight in ${unit}`}
                      max={2000}
                      color={ink}
                      className="w-[64px] text-[18px]"
                    />
                  </label>
                ) : null}
              </div>

              {sets.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Remove set ${index + 1}`}
                  onClick={() => setSets((prev) => prev.filter((_, i) => i !== index))}
                  className="rounded-full p-1 transition-transform active:scale-[0.92]"
                  style={{ color: soft }}
                >
                  <X size={16} />
                </button>
              ) : null}
            </div>
            );
          })}
        </div>

        {!single && sets.length < MAX_SETS ? (
          <button
            type="button"
            onClick={() => setSets((prev) => [...prev, { ...(prev[prev.length - 1] ?? seedEditSets(exercise)[0]), completed: true }])}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[14px] py-2.5 text-[13.5px] font-bold"
            style={{ border: '1px dashed var(--border-strong)', color: 'var(--accent-text)' }}
          >
            <Plus size={15} /> Add set
          </button>
        ) : null}

        {error ? (
          <p className="mt-3 text-[13px] font-semibold" style={{ color: 'var(--forma-danger)' }}>
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex gap-3">
          <Button variant="secondary" fullWidth disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button fullWidth disabled={saving || sets.length === 0} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
