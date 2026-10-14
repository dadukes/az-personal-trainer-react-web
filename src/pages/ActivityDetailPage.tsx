import { Clock, Flame, Gauge, MapPin, Mountain, Pencil, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import ActivityEditDialog from '@/components/ActivityEditDialog';
import DetailHeader, { useBackToActivities } from '@/components/DetailHeader';
import { ActivityIcon, SourceBadge } from '@/components/ActivityRow';
import HeartRateCard from '@/components/HeartRateCard';
import { Button, Card, Eyebrow, StatTile } from '@/components/ui';
import {
  activitySourceLabel,
  activityTitle,
  formatCalories,
  formatDistance,
  formatElevation,
  formatMinutes,
  isDeviceActivity,
  isEditableActivity,
  maxSpeedText,
  paceOrSpeed,
  statGridClass,
  timeRangeText,
} from '@/lib/activities';
import {
  deleteActivity,
  getActivity,
  updateActivity,
  type ActivityItem,
  type ActivityUpdatePayload,
  type HrCurveSegment,
  type ZoneModel,
} from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

/**
 * `/activities/:id` — one activity outside guided workouts (watch import, coach or quick
 * log), Garmin-style: the main stats, then heart rate and time in zone. Coach and quick
 * logs can be edited or deleted here; device imports are read-only (fix them in the app
 * that recorded them; the next sync brings the change).
 */
export default function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const goBack = useBackToActivities();
  const { session } = useAuth();
  const unitSystem = useAppStore((s) => s.profile.preferred_unit_system);
  const addXp = useAppStore((s) => s.addXp);
  const token = session?.access_token ?? null;

  const [activity, setActivity] = useState<ActivityItem | null>(null);
  const [zoneModel, setZoneModel] = useState<ZoneModel | null>(null);
  const [curve, setCurve] = useState<HrCurveSegment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    let mounted = true;
    setLoading(true);
    void (async () => {
      try {
        const result = await getActivity(token, id);
        if (!mounted) return;
        setActivity(result.activity);
        setZoneModel(result.zone_model);
        setCurve(result.hr_curve ?? null);
        setError(null);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Could not load this activity.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token, id]);

  const handleSave = async (changes: ActivityUpdatePayload) => {
    if (!token || !activity) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await updateActivity(token, activity.id, changes);
      if (result.activity) setActivity(result.activity);
      if (result.xp_delta) addXp(result.xp_delta);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !activity) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await deleteActivity(token, activity.id);
      if (result.xp_delta) addXp(result.xp_delta);
      navigate('/activities', { replace: true });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not delete this activity.');
      setSaving(false);
    }
  };

  const pace = activity ? paceOrSpeed(activity, unitSystem) : null;
  const topSpeed = activity ? maxSpeedText(activity, unitSystem) : null;
  const accent = 'var(--accent)';
  const tiles: ReactNode[] = activity
    ? [
        <StatTile
          key="duration"
          value={activity.duration_minutes ? formatMinutes(activity.duration_minutes) : '—'}
          label="Duration"
          icon={<Clock size={16} color={accent} />}
        />,
        activity.distance_km != null && activity.distance_km > 0 ? (
          <StatTile
            key="distance"
            value={formatDistance(activity.distance_km, unitSystem, 2)}
            label="Distance"
            icon={<MapPin size={16} color={accent} />}
          />
        ) : null,
        pace ? <StatTile key="pace" value={pace.value} label={pace.label} icon={<Gauge size={16} color={accent} />} /> : null,
        topSpeed ? <StatTile key="max-speed" value={topSpeed} label="Max speed" icon={<Gauge size={16} color={accent} />} /> : null,
        activity.active_calories ? (
          <StatTile
            key="calories"
            value={formatCalories(activity.active_calories)}
            label="Active calories"
            icon={<Flame size={16} color={accent} />}
          />
        ) : null,
        activity.elevation_gain_m ? (
          <StatTile
            key="elevation"
            value={formatElevation(activity.elevation_gain_m, unitSystem)}
            label="Elevation gain"
            icon={<Mountain size={16} color={accent} />}
          />
        ) : null,
        <StatTile
          key="xp"
          value={activity.xp_earned > 0 ? `+${activity.xp_earned}` : '—'}
          label="XP earned"
          icon={<Zap size={16} color={accent} />}
        />,
      ].filter(Boolean)
    : [];
  const device = activity ? isDeviceActivity(activity) : false;
  // A device title that just repeats the type ("Run") adds nothing.
  const rawNote = activity?.notes?.trim() || null;
  const note = activity && rawNote && !(device && rawNote.toLowerCase() === activityTitle(activity).toLowerCase()) ? rawNote : null;

  return (
    <div className="mx-auto flex w-full max-w-[760px] animate-fade-slide-up flex-col gap-5 p-5 sm:p-8">
      <DetailHeader
        eyebrow="Activity"
        title={activity ? activityTitle(activity) : 'Activity'}
        onBack={goBack}
        action={
          activity && isEditableActivity(activity) ? (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil size={14} /> Edit
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
        </div>
      ) : error || !activity ? (
        <Card>
          <p className="text-[14px]" style={{ color: 'var(--forma-danger)' }}>
            {error ?? 'This activity could not be found.'}
          </p>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'var(--bg-subtle)' }}>
              <ActivityIcon item={activity} size={17} />
            </div>
            <span className="text-[13px] font-semibold" style={{ color: 'var(--text-muted)' }}>
              {timeRangeText(activity.started_at, activity.completed_at)}
            </span>
            <SourceBadge item={activity} />
          </div>

          <div className={`grid grid-cols-2 gap-3 ${statGridClass(tiles.length)}`}>{tiles}</div>

          <HeartRateCard
            avgHr={activity.avg_hr}
            maxHr={activity.max_hr}
            secondsInZone={activity.seconds_in_zone}
            zoneModel={zoneModel}
            curve={curve}
            onAddBirthYear={() => navigate('/profile')}
          />

          {note ? (
            <Card padding="16px 18px">
              <Eyebrow>{device ? 'Title' : 'Note'}</Eyebrow>
              <p className="mt-1.5 text-[14px] leading-[1.5]" style={{ color: 'var(--text-primary)' }}>
                {note}
              </p>
            </Card>
          ) : null}

          <p className="text-[12px] leading-[1.5]" style={{ color: 'var(--text-muted)' }}>
            {device
              ? `Recorded by ${activitySourceLabel(activity)}. It’s read-only here: change it in that app and the next sync from your phone updates it.`
              : activity.source === 'coach'
                ? 'You told your coach about this one. Edit it if something’s off; XP updates to match.'
                : 'Quick-logged in Forma. Edit it if something’s off; XP updates to match.'}
          </p>
        </>
      )}

      {editing && activity ? (
        <ActivityEditDialog
          activity={activity}
          unitSystem={unitSystem}
          saving={saving}
          error={saveError}
          onSave={(changes) => void handleSave(changes)}
          onDelete={() => void handleDelete()}
          onClose={() => {
            setEditing(false);
            setSaveError(null);
          }}
        />
      ) : null}
    </div>
  );
}
