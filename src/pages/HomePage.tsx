import { Activity, Calendar, Flame, HeartPulse, MessageCircle, Moon, Play, RotateCcw, ShieldCheck, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import ScreenHeader from '@/components/ScreenHeader';
import { Badge, Button, Card, Eyebrow, SegmentedToggle } from '@/components/ui';
import { getDashboard, submitPulse } from '@/lib/api';
import { isNativeHealthAvailable, readTodayHealthData } from '@/lib/health';
import { completionKey, currentWeekDateForDayKey, localISODate } from '@/lib/workout';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

type StressLevel = 'chill' | 'stressed' | null;

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STRESS_LEVEL_MAP: Record<'chill' | 'stressed', number> = { chill: 1, stressed: 4 };

function buildWeekLabels(): string[] {
  const today = new Date();
  return [0, 1, 2, 3, 4].map((offset) => {
    if (offset === 0) return 'Today';
    if (offset === 1) return 'Tomorrow';
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    return DAY_ABBR[d.getDay()];
  });
}

function getTimeGreeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatEmailName(email: string | null | undefined): string {
  if (!email) return '';
  const firstToken = (email.split('@')[0] ?? '').split(/[._-]/)[0] ?? '';
  return firstToken ? firstToken.charAt(0).toUpperCase() + firstToken.slice(1) : '';
}

export default function HomePage() {
  const navigate = useNavigate();
  const { session, user } = useAuth();
  const { healthSnapshot, setHealthSnapshot, weekPlan, setWeekPlan, appendMessage, profile, completedWorkouts } =
    useAppStore();
  const [pulse, setPulse] = useState<StressLevel>(null);
  const [pulseSubmitting, setPulseSubmitting] = useState(false);
  const [planId, setPlanId] = useState<string | undefined>();
  /** Authoritative completed dates (local `YYYY-MM-DD`) from the dashboard's `completed_days`. */
  const [serverCompletedDates, setServerCompletedDates] = useState<Set<string>>(() => new Set());
  const [redoConfirm, setRedoConfirm] = useState<string | null>(null);
  const isNative = isNativeHealthAvailable();

  const loadDashboard = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const result = await getDashboard(session.access_token);
      const plan = result.data.active_workout_plan;
      setPlanId(plan?.id);
      setServerCompletedDates(
        new Set(
          Object.keys(result.data.completed_days ?? {}).map((dayKey) =>
            currentWeekDateForDayKey(dayKey),
          ),
        ),
      );
      if (!plan) {
        setWeekPlan([]);
        return;
      }
      const weekLabels = buildWeekLabels();
      const todayKey = DAY_KEYS[new Date().getDay()];
      const mapped = weekLabels.map((label, idx) => {
        const d = new Date();
        d.setDate(d.getDate() + idx);
        const key = DAY_KEYS[d.getDay()];
        const date = localISODate(d);
        const dayPlan = plan.plan[key];
        const status = (key === todayKey ? 'today' : 'planned') as 'today' | 'planned' | 'rest';
        if (!dayPlan || dayPlan.is_rest_day) {
          return { day: label, key, date, status, title: 'Rest', duration: '-' };
        }
        return {
          day: label,
          key,
          date,
          status,
          title: dayPlan.focus ?? 'Workout',
          duration: dayPlan.estimated_duration_minutes ? `${dayPlan.estimated_duration_minutes}m` : '-',
        };
      });
      setWeekPlan(mapped);
    } catch {
      // Non-blocking
    }
  }, [session, setWeekPlan]);

  useEffect(() => {
    let mounted = true;
    void readTodayHealthData().then((data) => {
      if (mounted) setHealthSnapshot(data);
    });
    void loadDashboard();
    return () => {
      mounted = false;
    };
  }, [loadDashboard, setHealthSnapshot]);

  const hasPlan = weekPlan.length > 0;
  const todayWorkout = weekPlan.find((d) => d.status === 'today');

  // Server `completed_days` is authoritative (cross-device); the local mirror keeps the badge
  // instant right after finishing, before the next dashboard refresh confirms it.
  const isDayCompleted = useCallback(
    (dateISO: string) =>
      serverCompletedDates.has(dateISO) || Boolean(completedWorkouts[completionKey(planId, dateISO)]),
    [serverCompletedDates, completedWorkouts, planId],
  );
  const todayHasWorkout = Boolean(todayWorkout && todayWorkout.duration !== '-');
  const todayCompleted = todayWorkout ? isDayCompleted(todayWorkout.date) : false;

  const startTodayWorkout = () => {
    if (todayCompleted) {
      setRedoConfirm(todayWorkout?.key ?? 'today');
      return;
    }
    navigate('/workout/today');
  };

  const greeting = useMemo(() => {
    const storedName = profile.display_name?.trim();
    const name = storedName || formatEmailName(user?.email);
    return `${getTimeGreeting(new Date().getHours())}${name ? `, ${name}` : ''}`;
  }, [profile.display_name, user?.email]);

  const pulseHint = useMemo(() => {
    if (pulse === 'chill') return 'Nice. Keep momentum with today’s plan.';
    if (pulse === 'stressed') return 'Noted. We can swap to a short recovery flow.';
    return 'Set your pulse check so your plan can adapt.';
  }, [pulse]);

  const handlePulse = async (level: 'chill' | 'stressed') => {
    if (pulseSubmitting) return;
    setPulse(level);
    if (!session?.access_token) return;
    setPulseSubmitting(true);
    try {
      await submitPulse(session.access_token, STRESS_LEVEL_MAP[level]);
    } catch {
      // Optimistic update already applied
    } finally {
      setPulseSubmitting(false);
    }
  };

  const handlePlanCTA = () => {
    appendMessage({
      id: `msg-${Date.now()}`,
      role: 'user',
      content: 'Help me come up with an exercise plan tailored for me',
      createdAt: new Date().toISOString(),
    });
    navigate('/coach');
  };

  const sleepLabel = healthSnapshot.sleep_hours != null ? `${healthSnapshot.sleep_hours}h` : '--';
  const hrLabel = healthSnapshot.resting_heart_rate != null ? `${healthSnapshot.resting_heart_rate} bpm` : '--';
  const stepsLabel = healthSnapshot.step_count != null ? healthSnapshot.step_count.toLocaleString() : '--';
  const calLabel =
    healthSnapshot.active_calories_burned != null ? `${healthSnapshot.active_calories_burned} kcal` : '--';

  const metrics = [
    {
      icon: <Moon size={18} color="var(--forma-sleep)" />,
      value: sleepLabel,
      label:
        healthSnapshot.sleep_hours != null && healthSnapshot.sleep_hours < 6
          ? 'Sleep · Needs focus'
          : 'Sleep looks solid',
    },
    { icon: <HeartPulse size={18} color="#39B1F2" />, value: hrLabel, label: 'Resting heart rate' },
    { icon: <Activity size={18} color="#34D2C1" />, value: stepsLabel, label: 'Steps today' },
    { icon: <Flame size={18} color="#39B1F2" />, value: calLabel, label: 'Active calories' },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1120px] animate-fade-slide-up flex-col gap-6 p-6 sm:p-10">
      <ScreenHeader
        title={greeting}
        subtitle="Fitness that fits you. Let's check your baseline before we move."
      />

      {/* Snapshot + pulse */}
      <div className="flex flex-col gap-5 lg:flex-row">
        <Card className="lg:flex-[1.3]">
          <div className="mb-4 flex items-center gap-1.5">
            <ShieldCheck size={15} color="#34D2C1" />
            <span className="text-[11.5px] font-bold tracking-[0.08em]" style={{ color: 'var(--accent-text)' }}>
              {isNative ? 'HEALTH CONNECT SYNCED' : 'HEALTH SNAPSHOT (MOCK)'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {metrics.map((m) => (
              <div
                key={m.label}
                className="rounded-2xl p-4"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
              >
                {m.icon}
                <div className="tabular mt-2 text-[20px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                  {m.value}
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {m.label}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col lg:flex-[0.85]">
          <div className="flex items-center justify-between">
            <span className="text-[15.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
              How are your stress levels?
            </span>
            <Activity size={18} color="var(--forma-sleep)" />
          </div>
          <p className="mb-3.5 mt-2 text-[13px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
            {pulseHint}
          </p>
          <div className="mt-auto">
            <SegmentedToggle
              options={[
                { value: 'chill', label: 'Chill' },
                { value: 'stressed', label: 'Stressed' },
              ]}
              value={pulse ?? ''}
              onChange={(v) => void handlePulse(v as 'chill' | 'stressed')}
              tone="mint"
            />
          </div>
        </Card>
      </div>

      {/* Today's plan or CTA */}
      {hasPlan ? (
        <div className="rounded-[24px] p-1" style={{ background: 'var(--forma-aqua)' }}>
          <div
            className="flex items-center justify-between rounded-[20px] px-6 py-6 sm:px-7"
            style={{ background: 'var(--forma-navy)' }}
          >
            <div className="min-w-0">
              {todayCompleted ? (
                <div
                  className="mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-[0.04em]"
                  style={{ background: 'var(--forma-aqua)', color: '#06224D' }}
                >
                  <span>COMPLETED</span>
                  <span aria-hidden className="text-[13px] leading-none">💪</span>
                </div>
              ) : (
                <div className="text-[11px] font-bold tracking-[0.08em]" style={{ color: 'var(--forma-mint)' }}>
                  TODAY&rsquo;S PLAN
                </div>
              )}
              <div className="my-1.5 text-[24px] font-extrabold text-white">
                {todayWorkout?.title ?? 'Rest Day'}
              </div>
              {todayHasWorkout ? (
                <div className="flex items-center gap-1.5 text-[13.5px]" style={{ color: '#C9F0E6' }}>
                  <Calendar size={14} color="#C9F0E6" />
                  <span>{todayWorkout?.duration}</span>
                  {todayCompleted ? <span style={{ color: 'var(--forma-mint)' }}>· Nice work today</span> : null}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-3.5">
              {todayWorkout ? (
                <Button
                  variant="secondary"
                  className="hidden sm:inline-flex"
                  style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.35)', color: '#fff' }}
                  onClick={() => navigate(`/plan/${todayWorkout.key}`)}
                >
                  View full plan
                </Button>
              ) : null}
              {todayHasWorkout ? (
                <button
                  onClick={startTodayWorkout}
                  aria-label={todayCompleted ? 'Do this workout again' : "Start today's workout"}
                  className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
                  style={{
                    background: 'var(--forma-aqua)',
                    boxShadow: '0 6px 18px rgba(52,210,193,0.35)',
                  }}
                >
                  {todayCompleted ? (
                    <RotateCcw size={22} color="#06224D" strokeWidth={2.6} />
                  ) : (
                    <Play size={22} color="#06224D" fill="#06224D" style={{ marginLeft: 2 }} />
                  )}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <Card onClick={handlePlanCTA} className="hover:brightness-[0.99]">
          <div className="flex items-start gap-3">
            <MessageCircle size={24} color="#34D2C1" />
            <div className="flex-1">
              <div className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>
                Ready to plan your workout?
              </div>
              <p className="mt-2 text-[14px] leading-5" style={{ color: 'var(--text-secondary)' }}>
                Let&rsquo;s jump into chat and create a personalized exercise plan tailored just for you.
              </p>
              <div
                className="mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: 'var(--forma-aqua)' }}
              >
                <MessageCircle size={16} color="#0E4C45" />
                <span className="font-semibold" style={{ color: '#0E4C45' }}>
                  Start Planning
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Upcoming week */}
      {hasPlan ? (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <Eyebrow>Upcoming week</Eyebrow>
            <Badge tone="neutral">
              <Zap size={10} color="#34D2C1" />
              AI ADAPTS DAILY
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {weekPlan.map((day) => {
              const isToday = day.status === 'today';
              const completed = isDayCompleted(day.date);
              return (
                <button
                  key={day.key}
                  onClick={() => navigate(`/plan/${day.key}`)}
                  className="relative overflow-hidden rounded-[18px] p-4 text-left transition-transform active:scale-[0.98]"
                  style={{
                    background: isToday ? 'var(--bg-selected)' : 'var(--bg-surface)',
                    border: `1px solid ${completed ? 'var(--accent)' : isToday ? 'var(--accent)' : 'var(--border-base)'}`,
                  }}
                >
                  {completed ? (
                    <>
                      {/* Faint muscle watermark */}
                      <span
                        aria-hidden
                        className="pointer-events-none absolute -bottom-2 -right-1 text-[52px] leading-none opacity-[0.12] select-none"
                      >
                        💪
                      </span>
                      {/* Corner "Done" ribbon */}
                      <span
                        className="absolute right-0 top-0 inline-flex items-center gap-1 rounded-bl-[12px] px-2 py-1 text-[9.5px] font-extrabold tracking-[0.04em]"
                        style={{ background: 'var(--forma-aqua)', color: '#06224D' }}
                      >
                        DONE 💪
                      </span>
                    </>
                  ) : null}
                  <div
                    className="text-[12px] font-semibold"
                    style={{ color: isToday ? 'var(--text-on-mint)' : 'var(--text-muted)' }}
                  >
                    {day.day}
                  </div>
                  <div
                    className="mt-2.5 text-[14px] font-bold"
                    style={{ color: isToday ? 'var(--text-on-mint)' : 'var(--text-primary)' }}
                  >
                    {day.title}
                  </div>
                  <div
                    className="mt-1 text-[12px]"
                    style={{ color: isToday ? 'rgba(14,76,69,.7)' : 'var(--text-muted)' }}
                  >
                    {day.duration}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Redo confirmation — a completed workout asks before starting again. */}
      {redoConfirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5"
          style={{ background: 'rgba(6,34,77,0.45)' }}
          onClick={() => setRedoConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[380px] rounded-[24px] p-6 text-center"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
          >
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-[28px]" style={{ background: 'var(--forma-mint)' }}>
              💪
            </div>
            <div className="text-[18px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
              Already crushed it today
            </div>
            <p className="mx-auto mt-2 max-w-[300px] text-[14px] leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
              You&rsquo;ve already completed this workout. Want to run through it again?
            </p>
            <div className="mt-5 flex gap-3">
              <Button variant="secondary" fullWidth onClick={() => setRedoConfirm(null)}>
                Not now
              </Button>
              <Button
                fullWidth
                onClick={() => {
                  const key = redoConfirm;
                  setRedoConfirm(null);
                  navigate(`/workout/${key}`);
                }}
              >
                Do it again
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
