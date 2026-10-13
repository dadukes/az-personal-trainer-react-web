import { Activity, Bike, Dumbbell, Footprints, HeartPulse, MessageCircle, Sparkles, Users, Watch, Zap } from 'lucide-react';

import ZoneBar from '@/components/ZoneBar';
import { activityNote, activitySourceLabel, activityStats, activityTitle, isCycling, isDeviceActivity } from '@/lib/activities';
import type { ActivityItem } from '@/lib/api';
import type { UnitSystem } from '@/lib/units';

export function ActivityIcon({ item, size = 19 }: { item: ActivityItem; size?: number }) {
  const props = { size, color: 'var(--accent-text)' };
  if (item.is_strength) return <Dumbbell {...props} />;
  switch (item.activity_type) {
    case 'walk':
      return <Footprints {...props} />;
    case 'cardio':
      return isCycling(item) ? <Bike {...props} /> : <Activity {...props} />;
    case 'class':
      return <Users {...props} />;
    case 'micro_win':
      return <Sparkles {...props} />;
    default:
      return <Dumbbell {...props} />;
  }
}

export function SourceBadge({ item }: { item: ActivityItem }) {
  const iconProps = { size: 11, color: 'var(--text-muted)' };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)', color: 'var(--text-secondary)' }}
    >
      {isDeviceActivity(item) ? <Watch {...iconProps} /> : item.source === 'coach' ? <MessageCircle {...iconProps} /> : <Zap {...iconProps} />}
      {activitySourceLabel(item)}
    </span>
  );
}

interface ActivityRowProps {
  item: ActivityItem;
  unitSystem: UnitSystem;
  /** Show max bpm and the time-in-zone bar (history); Home keeps rows to one glance. */
  detailed?: boolean;
  /** Prefix for the time line, e.g. a date in history. */
  when?: string;
  highlighted?: boolean;
  onClick?: () => void;
}

/**
 * One activity outside guided workouts (web twin of the mobile `activity-row`): title,
 * duration / distance, where it came from ("Garmin Connect", "Logged with coach",
 * "Quick log") and the heart-rate summary when the watch recorded one. Read-only.
 */
export default function ActivityRow({ item, unitSystem, detailed = false, when, highlighted = false, onClick }: ActivityRowProps) {
  const stats = activityStats(item, unitSystem);
  const time = new Date(item.started_at ?? item.completed_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const Tag = onClick ? 'button' : 'div';
  const note = activityNote(item);

  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      id={`activity-${item.id}`}
      className={`flex w-full gap-3 rounded-2xl p-3.5 text-left ${onClick ? 'transition-transform active:scale-[0.99]' : ''}`}
      style={{
        background: 'var(--bg-surface)',
        border: highlighted ? '2px solid var(--accent)' : '1px solid var(--border-base)',
      }}
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--bg-subtle)' }}>
        <ActivityIcon item={item} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[14.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
            {activityTitle(item)}
          </span>
          {item.xp_earned > 0 ? (
            <span className="tabular flex-shrink-0 text-[11.5px] font-bold" style={{ color: 'var(--accent-text)' }}>
              +{item.xp_earned} XP
            </span>
          ) : null}
        </div>
        {note ? (
          <span className="truncate text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            {note}
          </span>
        ) : null}
        <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {[when ? `${when}, ${time}` : time, stats].filter(Boolean).join(' · ')}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge item={item} />
          {item.avg_hr != null ? (
            <span className="inline-flex items-center gap-1 text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
              <HeartPulse size={12} color="var(--text-muted)" />
              avg {item.avg_hr}
              {detailed && item.max_hr != null ? ` · max ${item.max_hr}` : ''} bpm
            </span>
          ) : null}
        </div>
        {detailed && item.seconds_in_zone ? (
          <div className="mt-1">
            <ZoneBar values={item.seconds_in_zone} format={(s) => `${Math.round(s / 60)}m`} />
          </div>
        ) : null}
      </div>
    </Tag>
  );
}
