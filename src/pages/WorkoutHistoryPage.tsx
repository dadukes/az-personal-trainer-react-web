import { ChevronLeft, ChevronRight, Dumbbell, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Card, Eyebrow } from '@/components/ui';
import { getWorkoutSessions, type WorkoutSessionSummary } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

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

  const [sessions, setSessions] = useState<WorkoutSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) return;
    const token = session.access_token;
    let mounted = true;
    void (async () => {
      try {
        const { sessions: list } = await getWorkoutSessions(token, 50);
        if (mounted) setSessions(list);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Could not load your workouts.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session]);

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
      ) : sessions.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Dumbbell size={24} color="var(--text-muted)" />
            <p className="text-[14px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
              No workouts logged yet
            </p>
            <p className="max-w-[320px] text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              Complete a guided workout and it will show up here — tap any past session to see
              exactly what you logged.
            </p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sessions.map((s) => (
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
                <Dumbbell size={20} color="#34D2C1" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
                  {s.day ? capitalize(s.day) : 'Workout'}
                </div>
                <div className="mt-0.5 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                  {formatSessionDate(s.completed_at)}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-4">
                <div className="text-right">
                  <div className="tabular text-[14px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                    {formatDuration(s.duration_seconds)}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {s.total_sets} {s.total_sets === 1 ? 'set' : 'sets'}
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
          ))}
        </div>
      )}
    </div>
  );
}
