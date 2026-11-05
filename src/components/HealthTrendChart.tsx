import { useMemo, useState } from 'react';

import { CardLabel } from '@/components/ProgressSnapshotSection';
import { Segmented, Surface } from '@/components/ui';
import type { HealthLog } from '@/lib/api';
import { addDaysISO, keysWithRecentData, trendSummary } from '@/lib/progress';

/**
 * One health metric over 7, 14 or 30 days, from `getHealthLogs`. One metric at a time, so
 * the value axis is honest: there's only one unit in view. Only metrics with data get a
 * chip. The line's average over the range sits above it. Mobile twin: `health-trend-chart`.
 * The whole Health trends card; renders nothing without data in the last 30 days.
 */

type DimensionKey =
  | 'sleep_hours'
  | 'step_count'
  | 'resting_heart_rate'
  | 'energy_level'
  | 'sleep_quality'
  | 'stress_level'
  | 'active_calories_burned';

interface Dimension {
  key: DimensionKey;
  label: string;
  format: (v: number) => string;
}

const DIMENSIONS: Dimension[] = [
  { key: 'sleep_hours', label: 'Sleep', format: (v) => `${v.toFixed(1)} h` },
  { key: 'step_count', label: 'Steps', format: (v) => Math.round(v).toLocaleString() },
  { key: 'resting_heart_rate', label: 'Resting HR', format: (v) => `${Math.round(v)} bpm` },
  { key: 'energy_level', label: 'Energy', format: (v) => `${v.toFixed(1)} / 5` },
  { key: 'sleep_quality', label: 'Sleep quality', format: (v) => `${v.toFixed(1)} / 5` },
  { key: 'stress_level', label: 'Stress', format: (v) => `${v.toFixed(1)} / 5` },
  { key: 'active_calories_burned', label: 'Active kcal', format: (v) => Math.round(v).toLocaleString() },
];

type RangeValue = '7' | '14' | '30';
const RANGES = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
] as const;

const W = 600;
const H = 170;
const PAD_LEFT = 44;
const PAD_RIGHT = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shortLabel(dateISO: string): string {
  return new Date(`${dateISO}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function HealthTrendChart({ logs }: { logs: HealthLog[] }) {
  const today = localDateKey(new Date());
  const available = useMemo(() => {
    const recent = keysWithRecentData(logs, DIMENSIONS.map((d) => d.key), today);
    return DIMENSIONS.filter((d) => recent.includes(d.key));
  }, [logs, today]);
  const [picked, setPicked] = useState<DimensionKey | null>(null);
  const [range, setRange] = useState<RangeValue>('14');

  const dim = available.find((d) => d.key === picked) ?? available[0] ?? null;
  const days = Number(range);

  const points = useMemo(() => {
    if (!dim) return [];
    const byDate = new Map(logs.map((log) => [log.logged_date, log]));
    const pts: { index: number; date: string; value: number }[] = [];
    for (let i = 0; i < days; i += 1) {
      const date = addDaysISO(today, i - (days - 1));
      const raw = byDate.get(date)?.[dim.key];
      if (typeof raw === 'number') pts.push({ index: i, date, value: raw });
    }
    return pts;
  }, [logs, dim, days, today]);

  if (!dim) return null;
  const summary = trendSummary(logs, dim.key, days, today);
  const values = points.map((p) => p.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const span = max - min;
  const yMin = span === 0 ? min - 1 : min - span * 0.1;
  const yMax = span === 0 ? max + 1 : max + span * 0.1;
  const plotW = W - PAD_LEFT - PAD_RIGHT;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const xFor = (index: number) => PAD_LEFT + (days <= 1 ? plotW / 2 : (index / (days - 1)) * plotW);
  const yFor = (value: number) => PAD_TOP + (1 - (value - yMin) / (yMax - yMin || 1)) * plotH;
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.index).toFixed(1)} ${yFor(p.value).toFixed(1)}`).join(' ');
  const axis = (v: number) => dim.format(v).replace(/ .*/, '');

  return (
    <Surface padding="18px 16px" className="flex flex-col gap-3.5" style={{ borderRadius: 'var(--radius-hero)' }}>
      <CardLabel>Health trends</CardLabel>
      {available.length > 1 ? (
        <div role="radiogroup" aria-label="Metric" className="flex flex-wrap gap-2">
          {available.map((d) => {
            const on = d.key === dim.key;
            return (
              <button
                key={d.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPicked(d.key)}
                className="min-h-11 rounded-control px-3.5 text-[14px] font-semibold"
                style={{ background: on ? 'var(--ink)' : 'var(--sunken)', color: on ? 'var(--ground)' : 'var(--ink)' }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-0.5">
        <span className="type-stat text-[26px]" style={{ color: 'var(--ink)' }}>
          {summary.average != null ? dim.format(summary.average) : 'No data'}
        </span>
        <span className="type-meta" style={{ color: 'var(--ink-3)' }}>
          {summary.average != null
            ? `${dim.label} average, ${summary.daysWithData} of ${days} days`
            : `No ${dim.label.toLowerCase()} in the last ${days} days`}
        </span>
      </div>

      {points.length > 0 ? (
        <svg role="img" aria-label={`${dim.label} over the last ${days} days`} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
          {[0, 1, 2].map((i) => {
            const gy = PAD_TOP + (i / 2) * plotH;
            return <line key={i} x1={PAD_LEFT} y1={gy} x2={W - PAD_RIGHT} y2={gy} stroke="var(--line)" strokeWidth={1} />;
          })}
          <text x={PAD_LEFT - 6} y={PAD_TOP + 4} fontSize={11} fill="var(--ink-3)" textAnchor="end">
            {axis(max)}
          </text>
          <text x={PAD_LEFT - 6} y={PAD_TOP + plotH + 4} fontSize={11} fill="var(--ink-3)" textAnchor="end">
            {axis(min)}
          </text>
          <path d={linePath} fill="none" stroke="var(--series)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p) => (
            <circle key={p.index} cx={xFor(p.index)} cy={yFor(p.value)} r={points.length <= 14 ? 3.5 : 2} fill="var(--series)">
              <title>{`${shortLabel(p.date)}: ${dim.format(p.value)}`}</title>
            </circle>
          ))}
          <text x={PAD_LEFT} y={H - 5} fontSize={11} fill="var(--ink-3)" textAnchor="start">
            {shortLabel(addDaysISO(today, -(days - 1)))}
          </text>
          <text x={W - PAD_RIGHT} y={H - 5} fontSize={11} fill="var(--ink-3)" textAnchor="end">
            Today
          </text>
        </svg>
      ) : (
        <div className="h-[100px]" />
      )}

      <Segmented options={RANGES} value={range} onChange={setRange} />
    </Surface>
  );
}
