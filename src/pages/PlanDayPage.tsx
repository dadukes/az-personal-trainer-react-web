import { Calendar, ChevronLeft, Play, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Badge, Button, Card, Eyebrow } from '@/components/ui';
import { getWorkoutPlan, type DashboardDayPlan, type DashboardExercise } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function resolveDayKey(param?: string): string {
  if (param && DAY_KEYS.includes(param)) return param;
  return DAY_KEYS[new Date().getDay()];
}

function ExerciseRow({ ex }: { ex: DashboardExercise }) {
  const meta =
    ex.duration_seconds != null && !ex.reps
      ? `${ex.duration_seconds}s`
      : `${ex.sets ?? 1} × ${ex.reps ?? '—'}`;
  return (
    <div
      className="flex items-center justify-between rounded-xl px-3.5 py-3"
      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)' }}
    >
      <div className="min-w-0">
        <div className="truncate text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>
          {ex.name}
        </div>
        {ex.target_muscle || ex.body_part ? (
          <div className="mt-0.5 text-[12px] capitalize" style={{ color: 'var(--text-muted)' }}>
            {ex.target_muscle ?? ex.body_part}
          </div>
        ) : null}
      </div>
      <div className="tabular ml-3 flex-shrink-0 text-[13px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
        {meta}
      </div>
    </div>
  );
}

function Section({ label, items }: { label: string; items?: DashboardExercise[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <Eyebrow className="mb-2.5">{label}</Eyebrow>
      <div className="flex flex-col gap-2">
        {items.map((ex, i) => (
          <ExerciseRow key={`${ex.name}-${i}`} ex={ex} />
        ))}
      </div>
    </div>
  );
}

export default function PlanDayPage() {
  const { day } = useParams<{ day: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const dayKey = resolveDayKey(day);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dayPlan, setDayPlan] = useState<DashboardDayPlan | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!session?.access_token) {
        setError('You need to be signed in to view your plan.');
        setLoading(false);
        return;
      }
      try {
        const result = await getWorkoutPlan(session.access_token);
        if (!active) return;
        setDayPlan(result.plan?.plan?.[dayKey] ?? null);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load your plan.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [session, dayKey]);

  const isRest = !dayPlan || dayPlan.is_rest_day;

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 p-5 sm:p-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
        >
          <ChevronLeft size={20} color="var(--text-secondary)" />
        </button>
        <div className="flex-1">
          <Eyebrow>Day plan</Eyebrow>
          <div className="text-[24px] font-extrabold capitalize" style={{ color: 'var(--text-primary)' }}>
            {dayKey}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : error ? (
        <Card>
          <p className="text-[14px]" style={{ color: 'var(--forma-danger)' }}>
            {error}
          </p>
        </Card>
      ) : isRest ? (
        <Card padding="32px" className="text-center">
          <div className="text-[20px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
            Rest day
          </div>
          <p className="mt-2 text-[14px]" style={{ color: 'var(--text-secondary)' }}>
            Nothing scheduled. That&rsquo;s a win for listening to your body.
          </p>
        </Card>
      ) : (
        <>
          <div className="rounded-[24px] p-1" style={{ background: 'var(--forma-aqua)' }}>
            <div className="rounded-[20px] px-6 py-5" style={{ background: 'var(--forma-navy)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold tracking-[0.08em]" style={{ color: 'var(--forma-mint)' }}>
                    FOCUS
                  </div>
                  <div className="my-1 text-[22px] font-extrabold text-white">{dayPlan?.focus ?? 'Workout'}</div>
                  <div className="flex items-center gap-1.5 text-[13px]" style={{ color: '#C9F0E6' }}>
                    <Calendar size={13} color="#C9F0E6" />
                    <span>
                      {dayPlan?.estimated_duration_minutes ? `${dayPlan.estimated_duration_minutes} mins` : 'Flexible'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/workout/${dayKey}`)}
                  aria-label="Start workout"
                  className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
                  style={{ background: 'var(--bg-surface)' }}
                >
                  <Play size={22} color="#06224D" fill="#06224D" />
                </button>
              </div>
            </div>
          </div>

          {dayPlan?.ai_notes ? (
            <Card variant="subtle" padding="14px 16px">
              <div className="flex items-start gap-2.5">
                <Zap size={16} color="#34D2C1" className="mt-0.5 flex-shrink-0" />
                <div>
                  <Badge tone="mint" className="mb-1.5">
                    Coach note
                  </Badge>
                  <p className="text-[13.5px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
                    {dayPlan.ai_notes}
                  </p>
                </div>
              </div>
            </Card>
          ) : null}

          <Section label="Warm-up" items={dayPlan?.warmup} />
          <Section label="Main" items={dayPlan?.exercises} />
          <Section label="Cool-down" items={dayPlan?.cooldown} />

          <Button size="lg" fullWidth onClick={() => navigate(`/workout/${dayKey}`)} leftIcon={<Play size={16} color="#06224D" fill="#06224D" />}>
            Start workout
          </Button>
        </>
      )}
    </div>
  );
}
