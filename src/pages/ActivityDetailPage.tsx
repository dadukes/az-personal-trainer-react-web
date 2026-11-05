import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import ActivityEditDialog from '@/components/ActivityEditDialog';
import DetailHeader, { DetailStat, StatGrid, useBackToActivities } from '@/components/DetailHeader';
import HeartRateCard from '@/components/HeartRateCard';
import { Surface } from '@/components/ui';
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
  const device = activity ? isDeviceActivity(activity) : false;
  // A device title that just repeats the type ("Run") adds nothing.
  const rawNote = activity?.notes?.trim() || null;
  const note = activity && rawNote && !(device && rawNote.toLowerCase() === activityTitle(activity).toLowerCase()) ? rawNote : null;

  const sourceLine = activity
    ? device
      ? `From ${activitySourceLabel(activity)}`
      : activity.source === 'coach'
        ? 'Logged with your coach'
        : 'Quick-logged in Forma'
    : null;

  return (
    <div className="mx-auto flex w-full max-w-[680px] animate-fade-slide-up flex-col gap-6 px-4 pb-28 pt-4 sm:px-10 sm:pt-8">
      <DetailHeader
        meta={activity ? timeRangeText(activity.started_at, activity.completed_at) : null}
        title={activity ? activityTitle(activity) : 'Activity'}
        sub={sourceLine}
        onBack={goBack}
        action={
          activity && isEditableActivity(activity) ? (
            <button type="button" onClick={() => setEditing(true)} className="min-h-11 px-1 text-[15px] font-bold" style={{ color: 'var(--teal)' }}>
              Edit
            </button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--teal)', borderTopColor: 'transparent' }} />
        </div>
      ) : error || !activity ? (
        <p className="type-body" style={{ color: 'var(--danger)' }}>
          {error ?? 'This activity could not be found.'}
        </p>
      ) : (
        <>
          <StatGrid>
            {activity.distance_km != null && activity.distance_km > 0 ? (
              <DetailStat value={formatDistance(activity.distance_km, unitSystem, 2)} label="Distance" />
            ) : null}
            {activity.duration_minutes ? <DetailStat value={formatMinutes(activity.duration_minutes)} label="Time" /> : null}
            {pace ? <DetailStat value={pace.value} label={pace.label} /> : null}
            {topSpeed ? <DetailStat value={topSpeed} label="Max speed" /> : null}
            {activity.active_calories ? <DetailStat value={formatCalories(activity.active_calories)} label="Active kcal" /> : null}
            {activity.elevation_gain_m ? <DetailStat value={formatElevation(activity.elevation_gain_m, unitSystem)} label="Elevation" /> : null}
            {activity.xp_earned > 0 ? <DetailStat value={`+${activity.xp_earned}`} label="XP" /> : null}
          </StatGrid>

          <HeartRateCard
            avgHr={activity.avg_hr}
            maxHr={activity.max_hr}
            secondsInZone={activity.seconds_in_zone}
            zoneModel={zoneModel}
            curve={curve}
            onAddBirthYear={() => navigate('/profile')}
          />

          {note ? (
            <Surface padding="16px" className="flex flex-col gap-1">
              <span className="type-meta font-bold" style={{ color: 'var(--ink-3)' }}>
                {device ? 'Title' : 'Note'}
              </span>
              <p className="type-body m-0" style={{ color: 'var(--ink)' }}>
                {note}
              </p>
            </Surface>
          ) : null}

          <p className="type-meta m-0" style={{ color: 'var(--ink-3)' }}>
            {device
              ? `It’s read-only here: change it in ${activitySourceLabel(activity)} and the next sync from your phone updates it.`
              : 'Edit it if something’s off; XP updates to match.'}
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
