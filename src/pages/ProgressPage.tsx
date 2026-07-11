import {
  ArrowDownRight,
  ArrowUpRight,
  BatteryCharging,
  Brain,
  Dumbbell,
  Flame,
  Footprints,
  Gauge,
  HeartPulse,
  Minus,
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
  getProgressInsights,
  type HealthInsight,
  type HealthLog,
  type HealthSummary,
  type HealthSummaryMetric,
  type HealthTrendDirection,
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

// The deterministic 30-day averages, in display order. `avgKey` reads the value off
// `health_summary`; `good` marks which trend direction is a *positive* change for the metric
// (e.g. resting HR falling is good, energy rising is good) so the arrow can be colored honestly.
interface SummaryMetricConfig {
  metric: HealthSummaryMetric;
  avgKey: keyof HealthSummary;
  label: string;
  icon: ComponentType<{ size?: number; color?: string }>;
  format: (value: number) => string;
  good: 'up' | 'down';
}

const SUMMARY_METRICS: SummaryMetricConfig[] = [
  { metric: 'sleep_hours', avgKey: 'avg_sleep_hours', label: 'Avg sleep', icon: Moon, format: (v) => `${v}h`, good: 'up' },
  { metric: 'sleep_quality', avgKey: 'avg_sleep_quality', label: 'Sleep quality', icon: Gauge, format: (v) => `${v}`, good: 'up' },
  { metric: 'energy_level', avgKey: 'avg_energy_level', label: 'Energy', icon: BatteryCharging, format: (v) => `${v}`, good: 'up' },
  { metric: 'stress_level', avgKey: 'avg_stress_level', label: 'Stress', icon: Brain, format: (v) => `${v}`, good: 'down' },
  { metric: 'resting_heart_rate', avgKey: 'avg_resting_heart_rate', label: 'Resting HR', icon: HeartPulse, format: (v) => `${v} bpm`, good: 'down' },
  { metric: 'steps', avgKey: 'avg_steps', label: 'Daily steps', icon: Footprints, format: (v) => v.toLocaleString(), good: 'up' },
  { metric: 'active_calories', avgKey: 'avg_active_calories', label: 'Active cal', icon: Flame, format: (v) => v.toLocaleString(), good: 'up' },
];

// 1–5 subjective scales read better with the denominator shown.
const SCALE_METRICS = new Set<HealthSummaryMetric>(['sleep_quality', 'energy_level', 'stress_level']);

function TrendPill({ direction, good }: { direction: HealthTrendDirection | null; good: 'up' | 'down' }) {
  if (!direction) return null;
  if (direction === 'flat') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
        <Minus size={13} /> flat
      </span>
    );
  }
  const isGood = direction === good;
  const color = isGood ? 'var(--accent-text)' : 'var(--forma-gold)';
  const Arrow = direction === 'up' ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold" style={{ color }}>
      <Arrow size={13} /> {direction}
    </span>
  );
}

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
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [weekStats, setWeekStats] = useState<WeeklyActivityStats | null>(null);
  const [healthSummary, setHealthSummary] = useState<HealthSummary | null>(null);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(false);

  // Fast path: level/XP, weekly activity, and the deterministic health-summary stats. No LLM.
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
        setWeekStats(result.data.this_week ?? null);
        setHealthSummary(result.data.health_summary ?? null);
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

  // AI insight cards load separately and non-blocking — the endpoint may take a few seconds on a
  // cache miss, so it must never gate the stats above.
  useEffect(() => {
    if (!session?.access_token) return;
    const token = session.access_token;
    let mounted = true;
    setInsightsLoading(true);
    void (async () => {
      try {
        const result = await getProgressInsights(token);
        if (mounted) setInsights(result.data.health_insights);
      } catch {
        // Non-blocking — the section falls back to placeholder cards.
      } finally {
        if (mounted) setInsightsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session]);

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

  // While the background call is in flight show nothing (the eyebrow carries a spinner); only
  // fall back to placeholder cards once it resolves empty, to avoid flashing fake insights.
  const displayInsights = insights.length > 0 ? insights : insightsLoading ? [] : FALLBACK_INSIGHTS;

  // Only render summary tiles for metrics the user has actually logged (avg is non-null).
  const summaryTiles = healthSummary
    ? SUMMARY_METRICS.flatMap((cfg) => {
        const value = healthSummary[cfg.avgKey];
        if (typeof value !== 'number') return [];
        return [{ cfg, value }];
      })
    : [];

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

      {summaryTiles.length > 0 && healthSummary && (
        <>
          <div className="flex items-center justify-between">
            <Eyebrow>
              {healthSummary.window_days}-day averages
            </Eyebrow>
            <span className="text-[11.5px] font-semibold" style={{ color: 'var(--text-muted)' }}>
              {healthSummary.days_logged} {healthSummary.days_logged === 1 ? 'day' : 'days'} logged
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {summaryTiles.map(({ cfg, value }) => {
              const Icon = cfg.icon;
              const display = SCALE_METRICS.has(cfg.metric) ? `${cfg.format(value)}/5` : cfg.format(value);
              return (
                <div
                  key={cfg.metric}
                  className="rounded-2xl p-4"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-center justify-between">
                    <Icon size={17} color="var(--accent)" />
                    <TrendPill direction={healthSummary.trends[cfg.metric]} good={cfg.good} />
                  </div>
                  <div className="tabular mt-2.5 text-[22px] font-extrabold leading-tight" style={{ color: 'var(--text-primary)' }}>
                    {display}
                  </div>
                  <div className="mt-1 text-[11.5px] leading-tight" style={{ color: 'var(--text-muted)' }}>
                    {cfg.label}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

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

      <div className="flex items-center gap-2">
        <Eyebrow>AI Health Insights</Eyebrow>
        {insightsLoading && insights.length === 0 && (
          <div
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
        )}
      </div>
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
