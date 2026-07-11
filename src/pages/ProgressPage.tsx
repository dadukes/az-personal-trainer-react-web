import {
  BatteryCharging,
  Brain,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Moon,
  Sparkles,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import ScreenHeader from '@/components/ScreenHeader';
import { Card, Eyebrow, ProgressBar, StatTile } from '@/components/ui';
import {
  getHealthLogs,
  getProgress,
  type HealthInsight,
  type HealthLog,
  type WeeklyActivityStats,
} from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStore } from '@/store/useAppStore';

// Lazy-loaded so recharts ships as its own chunk, loaded only when Progress renders.
const HealthTrendChart = lazy(() => import('@/components/HealthTrendChart'));

// Mirrors the backend's stable `health_insights[].icon` enum; unknown values fall back to `general`.
const ICON_MAP: Record<string, ComponentType<{ size?: number; color?: string }>> = {
  heart_pulse: HeartPulse,
  sleep: Moon,
  steps: Footprints,
  stress: Brain,
  energy: BatteryCharging,
  calories: Flame,
  workout: Dumbbell,
  trophy: Trophy,
  trending_up: TrendingUp,
  general: Sparkles,
};

const ICON_COLOR: Record<string, string> = {
  heart_pulse: '#34D2C1',
  sleep: '#39B1F2',
  steps: '#34D2C1',
  stress: '#F5C542',
  energy: '#34D2C1',
  calories: '#39B1F2',
  workout: '#34D2C1',
  trophy: '#F5C542',
  trending_up: '#34D2C1',
  general: '#34D2C1',
};

function getLevelName(level: number): string {
  if (level <= 2) return 'Foundation';
  if (level <= 4) return 'Momentum';
  if (level <= 6) return 'Traction';
  return 'Elite';
}

const FALLBACK_INSIGHTS: HealthInsight[] = [
  {
    title: 'Heart rate trend is improving',
    description: 'Your resting heart rate dropped by 3 BPM this month, a strong sign of better conditioning.',
    icon: 'heart_pulse',
  },
  {
    title: 'Sleep is the limiting factor',
    description: 'Three sessions were skipped this week due to low sleep battery. Prioritize a tighter wind-down.',
    icon: 'sleep',
  },
];

export default function ProgressPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { gamification, setGamification } = useAppStore();
  const [insights, setInsights] = useState<HealthInsight[]>([]);
  const [weekStats, setWeekStats] = useState<WeeklyActivityStats | null>(null);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session?.access_token) return;
    const token = session.access_token;
    let mounted = true;
    setLoading(true);
    void (async () => {
      try {
        const result = await getProgress(token);
        if (!mounted) return;
        setGamification({
          current_level: result.data.current_level,
          current_xp: result.data.current_xp,
          xp_to_next_level: result.data.xp_to_next_level,
        });
        setInsights(result.data.health_insights);
        setWeekStats(result.data.this_week ?? null);
      } catch {
        // Non-blocking
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session, setGamification]);

  // Health trends load independently so a slow/empty logs read never blocks the
  // level + insights UI (max window = 90 days; the chart filters to 7/14/30).
  useEffect(() => {
    if (!session?.access_token) return;
    const token = session.access_token;
    let mounted = true;
    void (async () => {
      try {
        const { logs } = await getHealthLogs(token, 90);
        if (mounted) setHealthLogs(logs);
      } catch {
        // Non-blocking — the chart shows its own empty state.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session]);

  const xpProgress =
    gamification.xp_to_next_level > 0
      ? Math.min((gamification.current_xp / gamification.xp_to_next_level) * 100, 100)
      : 0;

  const displayInsights = insights.length > 0 ? insights : FALLBACK_INSIGHTS;

  return (
    <div className="mx-auto flex w-full max-w-[1120px] animate-fade-slide-up flex-col gap-6 p-6 sm:p-10">
      <ScreenHeader title="Your Progress" subtitle="Consistency over intensity." />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
        {/* Level card */}
        <Card padding="26px 24px" className="lg:w-[360px] lg:min-w-[360px]">
          {loading ? (
            <div className="flex h-[150px] items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
            </div>
          ) : (
            <div className="text-center">
              <div className="text-[11px] font-bold tracking-[0.14em]" style={{ color: 'var(--accent-text)' }}>
                LEVEL {gamification.current_level}
              </div>
              <div className="my-1.5 mb-4 text-[32px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                {getLevelName(gamification.current_level)}
              </div>
              <ProgressBar value={xpProgress} gradient />
              <div className="mt-2.5 flex items-center justify-between">
                <span className="tabular text-[12px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {gamification.current_xp.toLocaleString()} XP
                </span>
                <span className="tabular text-[12px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {gamification.xp_to_next_level.toLocaleString()} XP to Level {gamification.current_level + 1}
                </span>
              </div>
            </div>
          )}
        </Card>

        {/* This week */}
        <Card className="flex-1">
          <div className="mb-3.5 flex items-center justify-between">
            <Eyebrow>This week</Eyebrow>
            <button
              onClick={() => navigate('/progress/workouts')}
              className="text-[12px] font-bold transition-opacity hover:opacity-80"
              style={{ color: 'var(--accent-text)' }}
            >
              Workout history →
            </button>
          </div>
          <div className="flex gap-3">
            <StatTile
              value={weekStats ? `${weekStats.consistency_streak_days} days` : '--'}
              label="Consistency streak"
            />
            <StatTile
              value={weekStats ? String(weekStats.workouts_this_week) : '--'}
              label="Workouts this week"
              onClick={() => navigate('/progress/workouts')}
            />
            <StatTile
              value={weekStats ? `${weekStats.minutes_trained_this_week}m` : '--'}
              label="Minutes trained"
            />
          </div>
        </Card>
      </div>

      <Eyebrow>Health trends</Eyebrow>
      <Card>
        <Suspense
          fallback={
            <div className="flex h-[280px] items-center justify-center">
              <div
                className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
              />
            </div>
          }
        >
          <HealthTrendChart logs={healthLogs} />
        </Suspense>
      </Card>

      <Eyebrow>AI Health Insights</Eyebrow>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {displayInsights.map((insight, i) => {
          const Icon = ICON_MAP[insight.icon] ?? ICON_MAP.general;
          const color = ICON_COLOR[insight.icon] ?? ICON_COLOR.general;
          return (
            <Card key={i} padding="18px">
              <div className="flex gap-3">
                <div
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
                  style={{ background: 'var(--bg-subtle)' }}
                >
                  <Icon size={20} color={color} />
                </div>
                <div className="flex-1">
                  <div className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>
                    {insight.title}
                  </div>
                  <p className="mt-1 text-[12.5px] leading-5" style={{ color: 'var(--text-secondary)' }}>
                    {insight.description}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
