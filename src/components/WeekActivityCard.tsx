import { Check, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import ActivityRow from '@/components/ActivityRow';
import { Card, Eyebrow } from '@/components/ui';
import type { ActivityItem } from '@/lib/api';
import type { UnitSystem } from '@/lib/units';
import { localISODate } from '@/lib/workout';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Local `YYYY-MM-DD` for Monday..Sunday of the current week. */
function currentWeekDates(base: Date = new Date()): string[] {
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localISODate(d);
  });
}

function weekdayName(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long' });
}

interface WeekActivityCardProps {
  /** Dashboard `week_activities`: local date → activities outside guided workouts. */
  weekActivities: Record<string, ActivityItem[]>;
  /** Dates whose planned workout is done (`completed_days` + the local mirror). */
  isPlanDone: (dateISO: string) => boolean;
  unitSystem: UnitSystem;
  onOpenActivity: (item: ActivityItem | null) => void;
}

/**
 * Home's "This week" (web twin of the mobile `week-activity-card`): a planned workout done
 * keeps its own tick, anything else — a run from the watch, a class told to the coach, a
 * quick log — gets a separate dot, so the plan's completion stays truthful while nothing
 * the user did is invisible. Selecting a day lists its activities.
 */
export default function WeekActivityCard({ weekActivities, isPlanDone, unitSystem, onOpenActivity }: WeekActivityCardProps) {
  const today = localISODate();
  const dates = useMemo(() => currentWeekDates(), []);
  const [selected, setSelected] = useState(today);

  const hasAnything = dates.some((d) => (weekActivities[d]?.length ?? 0) > 0 || isPlanDone(d));
  if (!hasAnything) return null;

  const items = weekActivities[selected] ?? [];
  const emptyCopy = isPlanDone(selected)
    ? 'Planned workout done 💪 Nothing else logged.'
    : selected === today
      ? 'Nothing logged yet today.'
      : `Nothing logged on ${weekdayName(selected)}.`;

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Eyebrow>This week</Eyebrow>
          <button
            type="button"
            onClick={() => onOpenActivity(null)}
            className="inline-flex items-center gap-0.5 text-[12.5px] font-bold"
            style={{ color: 'var(--accent-text)' }}
          >
            All activities <ChevronRight size={14} />
          </button>
        </div>

        <div className="flex justify-between gap-1 sm:justify-start sm:gap-4">
          {dates.map((date, i) => {
            const count = weekActivities[date]?.length ?? 0;
            const done = isPlanDone(date);
            const isSelected = date === selected;
            const isFuture = date > today;
            const label = `${weekdayName(date)}${done ? ', planned workout done' : ''}${count > 0 ? `, ${count} other ${count === 1 ? 'activity' : 'activities'}` : ''}`;
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelected(date)}
                disabled={isFuture}
                aria-pressed={isSelected}
                aria-label={label}
                className="flex w-[38px] flex-col items-center gap-1.5 disabled:opacity-45"
              >
                <span
                  className="text-[11px] font-bold"
                  style={{ color: date === today ? 'var(--accent-text)' : 'var(--text-muted)' }}
                >
                  {DAY_LETTERS[i]}
                </span>
                <span
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-[12.5px] font-bold"
                  style={{
                    background: done ? 'var(--accent)' : 'var(--bg-subtle)',
                    border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border-base)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {done ? <Check size={16} color="var(--text-on-accent)" strokeWidth={3} /> : Number(date.slice(8))}
                </span>
                {/* Other activity: its own marker, never the plan's tick. */}
                <span className="flex h-1.5 gap-0.5">
                  {Array.from({ length: Math.min(count, 3) }, (_, k) => (
                    <span key={k} className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--forma-sky)' }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--accent)' }} />
            Planned workout done
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--forma-sky)' }} />
            Other activity
          </span>
        </div>

        {items.length > 0 ? (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <ActivityRow key={item.id} item={item} unitSystem={unitSystem} onClick={() => onOpenActivity(item)} />
            ))}
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            {emptyCopy}
          </p>
        )}
      </div>
    </Card>
  );
}
