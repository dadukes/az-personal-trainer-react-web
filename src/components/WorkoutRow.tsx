import { Activity, Dumbbell, HeartPulse, MessageCircle, Watch } from 'lucide-react';

import { formatDistance, formatMinutes, workoutTitle } from '@/lib/activities';
import type { HistoryWorkout } from '@/lib/api';
import { sourceAppLabel } from '@/lib/body';
import type { UnitSystem } from '@/lib/units';

interface WorkoutRowProps {
  workout: HistoryWorkout;
  unitSystem: UnitSystem;
  /** Date prefix for the time line, e.g. "Mon, Oct 13". */
  when?: string;
  onClick: () => void;
}

function Chip({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)', color: 'var(--text-secondary)' }}
    >
      {icon}
      {label}
    </span>
  );
}

/**
 * A planned workout in the Activities list (the `ActivityRow` twin for `workout_sessions`):
 * plan-day title, duration, sets and distance, how it was logged (the app, the coach, or a
 * watch recording that completed the day), which watch recorded it and the avg bpm.
 */
export default function WorkoutRow({ workout, unitSystem, when, onClick }: WorkoutRowProps) {
  const time = new Date(workout.started_at || workout.completed_at).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  const stats = [
    workout.duration_minutes > 0 ? formatMinutes(workout.duration_minutes) : null,
    workout.total_sets > 0 ? `${workout.total_sets} ${workout.total_sets === 1 ? 'set' : 'sets'}` : null,
    workout.distance_km ? formatDistance(workout.distance_km, unitSystem) : null,
  ].filter(Boolean);
  const Icon = workout.source === 'coach' ? MessageCircle : workout.total_sets === 0 && workout.distance_km ? Activity : Dumbbell;
  const chipIcon = { size: 11, color: 'var(--text-muted)' };

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full gap-3 rounded-2xl p-3.5 text-left transition-transform active:scale-[0.99]"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--bg-selected)' }}>
        <Icon size={19} color="var(--text-on-mint)" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[14.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
            {workoutTitle(workout)}
          </span>
          {workout.xp_earned > 0 ? (
            <span className="tabular flex-shrink-0 text-[11.5px] font-bold" style={{ color: 'var(--accent-text)' }}>
              +{workout.xp_earned} XP
            </span>
          ) : null}
        </div>
        <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {[when ? `${when}, ${time}` : time, ...stats].join(' · ')}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Chip label="Planned workout" />
          {workout.source === 'coach' ? <Chip icon={<MessageCircle {...chipIcon} />} label="Logged with coach" /> : null}
          {workout.recorded_by || workout.source === 'watch' ? (
            <Chip icon={<Watch {...chipIcon} />} label={sourceAppLabel(workout.recorded_by)} />
          ) : null}
          {workout.avg_hr != null ? (
            <span className="inline-flex items-center gap-1 text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
              <HeartPulse size={12} color="var(--text-muted)" />
              avg {workout.avg_hr} bpm
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
