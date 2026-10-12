import { ChevronLeft, ChevronRight, Dumbbell, HeartPulse, MessageCircle, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import ActivityRow from '@/components/ActivityRow';
import { Card, Eyebrow } from '@/components/ui';
import {
  getActivities,
  getWorkoutSessions,
  type ActivitiesResponse,
  type ActivityItem,
  type WorkoutSessionSummary,
} from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

/** Activities outside guided workouts shown alongside the sessions (the API's max window). */
const ACTIVITY_DAYS = 90;
const ACTIVITY_LIMIT = 200;

type HistoryEntry =
  | { kind: 'session'; at: string; session: WorkoutSessionSummary }
  | { kind: 'activity'; at: string; activity: ActivityItem };

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDuration(seconds: number): string {
  const mins = Math.max(0, Math.round(seconds / 60));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function WorkoutHistoryPage() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const [searchParams] = useSearchParams();
  const focusActivity = searchParams.get('activity');
  const unitSystem = useAppStore((s) => s.profile.preferred_unit_system);

  const [sessions, setSessions] = useState<WorkoutSessionSummary[]>([]);
  const [activities, setActivities] = useState<ActivitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) return;
    const token = session.access_token;
    let mounted = true;
    void (async () => {
      // Activities are additive: if they fail the guided sessions still render.
      const [sessionsResult, activitiesResult] = await Promise.allSettled([
        getWorkoutSessions(token, 50),
        getActivities(token, { days: ACTIVITY_DAYS, limit: ACTIVITY_LIMIT }),
      ]);
      if (!mounted) return;
      if (sessionsResult.status === 'fulfilled') {
        setSessions(sessionsResult.value.sessions);
      } else {
        const err = sessionsResult.reason;
        setError(err instanceof Error ? err.message : 'Could not load your workouts.');
      }
      if (activitiesResult.status === 'fulfilled') setActivities(activitiesResult.value);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [session]);

  // Guided sessions and everything else (watch, coach, quick logs), newest first. The
  // backend leaves session mirrors and linked watch recordings out of `GET /activities`,
  // so merging never shows a session twice.
  const entries = useMemo<HistoryEntry[]>(() => {
    const list: HistoryEntry[] = [
      ...sessions.map((s) => ({ kind: 'session' as const, at: s.completed_at, session: s })),
      ...(activities?.activities ?? []).map((a) => ({ kind: 'activity' as const, at: a.completed_at, activity: a })),
    ];
    return list.sort((a, b) => b.at.localeCompare(a.at));
  }, [sessions, activities]);

  const needsBirthYear =
    activities != null && activities.zone_model == null && activities.activities.some((a) => a.avg_hr != null);

  // Arriving from Home with ?activity=<id>: bring that row into view once rendered.
  useEffect(() => {
    if (!focusActivity || loading) return;
    document.getElementById(`activity-${focusActivity}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusActivity, loading]);

  return (
    <div className="mx-auto flex w-full max-w-[760px] animate-fade-slide-up flex-col gap-5 p-5 sm:p-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/progress')}
          aria-label="Back to progress"
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
        >
          <ChevronLeft size={20} color="var(--text-secondary)" />
        </button>
        <div>
          <Eyebrow>Progress</Eyebrow>
          <div className="text-[24px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
            Workout history
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
        </div>
      ) : error ? (
        <Card>
          <p className="text-[14px]" style={{ color: 'var(--forma-danger)' }}>
            {error}
          </p>
        </Card>
      ) : entries.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Dumbbell size={24} color="var(--text-muted)" />
            <p className="text-[14px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
              No workouts logged yet
            </p>
            <p className="max-w-[320px] text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              Complete a guided workout and it will show up here — tap any past session to see
              exactly what you logged. Runs from your watch, activities you tell your coach about
              and quick logs show up here too.
            </p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {needsBirthYear ? (
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2.5 rounded-2xl p-3 text-left text-[13px]"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)', color: 'var(--text-secondary)' }}
            >
              <HeartPulse size={16} color="var(--accent-text)" />
              <span className="flex-1">Add your birth year to see heart-rate zones.</span>
              <span className="font-bold" style={{ color: 'var(--accent-text)' }}>
                Profile
              </span>
            </button>
          ) : null}
          {entries.map((entry) => {
            if (entry.kind === 'activity') {
              return (
                <ActivityRow
                  key={`a-${entry.activity.id}`}
                  item={entry.activity}
                  unitSystem={unitSystem}
                  detailed
                  when={formatSessionDate(entry.at)}
                  highlighted={entry.activity.id === focusActivity}
                />
              );
            }
            const s = entry.session;
            // The coach can log a session the user reported in chat ("did my spin class").
            // Those rows carry no per-set detail, so they render as a logged activity
            // rather than an empty set table.
            const coachLogged = s.total_sets === 0;
            return (
            <button
              key={s.id}
              onClick={() => navigate(`/progress/workouts/${s.id}`)}
              className="flex items-center gap-4 rounded-2xl p-4 text-left transition-transform active:scale-[0.99]"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
            >
              <div
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
                style={{ background: 'var(--bg-subtle)' }}
              >
                {coachLogged ? (
                  <MessageCircle size={20} color="#34D2C1" />
                ) : (
                  <Dumbbell size={20} color="#34D2C1" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
                  {s.day ? capitalize(s.day) : 'Workout'}
                </div>
                <div className="mt-0.5 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                  {coachLogged ? 'Coach-logged · ' : ''}
                  {formatSessionDate(s.completed_at)}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-4">
                <div className="text-right">
                  <div className="tabular text-[14px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                    {s.duration_seconds > 0 ? formatDuration(s.duration_seconds) : '—'}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {coachLogged ? 'logged' : `${s.total_sets} ${s.total_sets === 1 ? 'set' : 'sets'}`}
                  </div>
                </div>
                {s.xp_earned > 0 ? (
                  <div className="hidden items-center gap-1 sm:flex" style={{ color: 'var(--accent-text)' }}>
                    <Zap size={13} />
                    <span className="tabular text-[12.5px] font-bold">{s.xp_earned}</span>
                  </div>
                ) : null}
                <ChevronRight size={18} color="var(--text-muted)" />
              </div>
            </button>
            );
          })}
          {activities?.zone_model && activities.activities.length > 0 ? (
            <p className="mt-1 text-[11.5px] leading-[1.5]" style={{ color: 'var(--text-muted)' }}>
              Zones use a max heart rate of {activities.zone_model.max_hr} bpm
              {activities.zone_model.method === 'hrr' ? ' and your resting heart rate' : ''}. Change your birth
              year or max heart rate in Profile. Watch activities are read-only here — edit them in the app
              that recorded them.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
