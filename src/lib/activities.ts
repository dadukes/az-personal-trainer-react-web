import type { ActivityItem, ActivityType, ZoneSeconds } from '@/lib/api';
import { sourceAppLabel } from '@/lib/body';

/**
 * Display helpers for activities outside guided workouts (`GET /activities`, the
 * dashboard's `week_activities`). Zones and labels come from the backend; nothing
 * here computes heart-rate maths.
 */

const TYPE_LABELS: Record<ActivityType, string> = {
  full_workout: 'Workout',
  micro_win: 'Quick win',
  walk: 'Walk',
  cardio: 'Cardio',
  class: 'Class',
  other: 'Activity',
};

/** "Run", "Strength training", else the type's label ("Cardio", "Walk"…). */
export function activityTitle(item: Pick<ActivityItem, 'name' | 'activity_type'>): string {
  return item.name ?? TYPE_LABELS[item.activity_type] ?? 'Activity';
}

/** Where an activity came from, in the user's words: "Garmin Connect", "Logged with coach", "Quick log". */
export function activitySourceLabel(item: Pick<ActivityItem, 'source' | 'source_app'>): string {
  if (item.source === 'coach') return 'Logged with coach';
  if (item.source === 'app') return 'Quick log';
  return sourceAppLabel(item.source_app);
}

/** Cycling-type device sessions, for an icon that matches ("Cycling", "Indoor cycling"). */
export function isCycling(item: Pick<ActivityItem, 'name'>): boolean {
  return /cycl|bik|ride/i.test(item.name ?? '');
}

/**
 * The user's own words on a coach / quick log ("Yoga with Sam"). Device rows keep their
 * title in `name`, so their notes aren't repeated.
 */
export function activityNote(item: Pick<ActivityItem, 'source' | 'notes'>): string | null {
  if (isDeviceActivity(item)) return null;
  const note = item.notes?.trim();
  return note ? note : null;
}

export function isDeviceActivity(item: Pick<ActivityItem, 'source'>): boolean {
  return item.source === 'health_connect' || item.source === 'apple_health';
}

/** `32 min · 5.4 km` (distance in the user's system); empty parts are dropped. */
export function activityStats(
  item: Pick<ActivityItem, 'duration_minutes' | 'distance_km'>,
  system: 'metric' | 'imperial',
): string {
  const parts: string[] = [];
  if (item.duration_minutes != null && item.duration_minutes > 0) {
    parts.push(formatMinutes(item.duration_minutes));
  }
  if (item.distance_km != null && item.distance_km > 0) {
    parts.push(
      system === 'imperial'
        ? `${(item.distance_km / 1.609344).toFixed(1)} mi`
        : `${item.distance_km.toFixed(1)} km`,
    );
  }
  return parts.join(' · ');
}

export function formatMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Zone names for labels; colour is never the only signal. */
export const ZONE_LABELS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'] as const;

export const ZONE_DESCRIPTIONS = ['Very light', 'Light', 'Moderate', 'Hard', 'Max'] as const;

/** Whole minutes per zone, for a bar legend. */
export function zoneMinutes(zones: ZoneSeconds): number[] {
  return zones.map((s) => Math.round(s / 60));
}

/** Short lower-case noun for a notice: "run", "treadmill run", "HIIT" stays as is. */
export function activityNoun(item: Pick<ActivityItem, 'name' | 'activity_type'>): string {
  const title = activityTitle(item);
  return title === title.toUpperCase() ? title : title.charAt(0).toLowerCase() + title.slice(1);
}

/** Sort key for a day list: when it started, else when it ended. */
export function activityTime(item: Pick<ActivityItem, 'started_at' | 'completed_at'>): string {
  return item.started_at ?? item.completed_at;
}
