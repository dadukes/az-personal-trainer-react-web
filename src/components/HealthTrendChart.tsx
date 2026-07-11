import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { SegmentedToggle } from '@/components/ui';
import type { HealthLog } from '@/lib/api';
import { useAppTheme } from '@/providers/ThemeProvider';

/**
 * Two health dimensions plotted over the same time axis so the user can eyeball
 * how they move together (e.g. sleep quality vs steps).
 *
 * Design note: this is deliberately **not** a dual-axis chart. Two independent
 * y-scales manufacture spurious correlations (rescale one axis and any two lines
 * appear to track). Instead both series are min–max normalized to a shared 0–100
 * "relative level" over the visible window — the honest way to overlay measures
 * of different units. The tooltip always reports the **actual** captured values.
 */

type DimensionKey =
  | 'step_count'
  | 'sleep_hours'
  | 'sleep_quality'
  | 'energy_level'
  | 'stress_level'
  | 'resting_heart_rate'
  | 'active_calories_burned';

interface Dimension {
  key: DimensionKey;
  label: string;
  /** Suffix shown after the raw value in the tooltip/legend (e.g. "h", "/5"). */
  unit: string;
  /** Formats a raw captured value for display. */
  format: (v: number) => string;
}

const DIMENSIONS: Dimension[] = [
  { key: 'step_count', label: 'Steps', unit: '', format: (v) => Math.round(v).toLocaleString() },
  { key: 'sleep_hours', label: 'Sleep duration', unit: 'h', format: (v) => `${v}` },
  { key: 'sleep_quality', label: 'Sleep quality', unit: '/5', format: (v) => `${v}` },
  { key: 'energy_level', label: 'Energy level', unit: '/5', format: (v) => `${v}` },
  { key: 'stress_level', label: 'Stress level', unit: '/5', format: (v) => `${v}` },
  { key: 'resting_heart_rate', label: 'Resting HR', unit: 'bpm', format: (v) => `${Math.round(v)}` },
  { key: 'active_calories_burned', label: 'Active calories', unit: 'kcal', format: (v) => `${Math.round(v)}` },
];

const RANGE_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
];

// Categorical series colors (dataviz-validated blue + orange; CVD-safe in both
// modes). The brand aqua stays reserved for UI chrome (toggles/selection).
const SERIES_COLORS = {
  a: { light: '#2a78d6', dark: '#3987e5' },
  b: { light: '#eb6834', dark: '#d95926' },
};

interface ChartRow {
  /** Local YYYY-MM-DD for the day. */
  date: string;
  /** Short axis label, e.g. "Jul 5". */
  label: string;
  aRaw: number | null;
  bRaw: number | null;
  aNorm: number | null;
  bNorm: number | null;
}

/** Local YYYY-MM-DD for a Date (avoids UTC off-by-one from toISOString). */
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Min–max normalize to 0–100 across the non-null values; flat series → 50. */
function normalize(values: (number | null)[]): (number | null)[] {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return values.map(() => null);
  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max - min;
  return values.map((v) => (v === null ? null : span === 0 ? 50 : ((v - min) / span) * 100));
}

interface TooltipPayloadItem {
  payload: ChartRow;
}

export default function HealthTrendChart({ logs }: { logs: HealthLog[] }) {
  const { isDark } = useAppTheme();
  const [rangeDays, setRangeDays] = useState('14');
  const [dimAKey, setDimAKey] = useState<DimensionKey>('step_count');
  const [dimBKey, setDimBKey] = useState<DimensionKey>('sleep_quality');

  const dimA = DIMENSIONS.find((d) => d.key === dimAKey)!;
  const dimB = DIMENSIONS.find((d) => d.key === dimBKey)!;
  const colorA = isDark ? SERIES_COLORS.a.dark : SERIES_COLORS.a.light;
  const colorB = isDark ? SERIES_COLORS.b.dark : SERIES_COLORS.b.light;

  const { rows, hasData, latestA, latestB } = useMemo(() => {
    const days = Number(rangeDays);
    const byDate = new Map(logs.map((log) => [log.logged_date, log]));

    // Build a continuous daily axis ending today so gaps read as gaps in time.
    const dates: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(d);
    }

    const aRawVals: (number | null)[] = [];
    const bRawVals: (number | null)[] = [];
    for (const d of dates) {
      const log = byDate.get(localDateKey(d));
      aRawVals.push((log?.[dimAKey] ?? null) as number | null);
      bRawVals.push((log?.[dimBKey] ?? null) as number | null);
    }

    const aNormVals = normalize(aRawVals);
    const bNormVals = normalize(bRawVals);

    const built: ChartRow[] = dates.map((d, i) => ({
      date: localDateKey(d),
      label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      aRaw: aRawVals[i],
      bRaw: bRawVals[i],
      aNorm: aNormVals[i],
      bNorm: bNormVals[i],
    }));

    const lastA = [...built].reverse().find((r) => r.aRaw !== null)?.aRaw ?? null;
    const lastB = [...built].reverse().find((r) => r.bRaw !== null)?.bRaw ?? null;

    return {
      rows: built,
      hasData: aRawVals.some((v) => v !== null) || bRawVals.some((v) => v !== null),
      latestA: lastA,
      latestB: lastB,
    };
  }, [logs, rangeDays, dimAKey, dimBKey]);

  const dimOptions = (excludeKey: DimensionKey) =>
    DIMENSIONS.filter((d) => d.key !== excludeKey);

  return (
    <div className="flex flex-col gap-4">
      {/* Controls: dimension pickers + range. Stack full-width on mobile; inline on ≥sm. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <DimensionSelect
            label="Compare"
            value={dimAKey}
            swatch={colorA}
            options={dimOptions(dimBKey)}
            onChange={(v) => setDimAKey(v)}
          />
          <span
            className="hidden pb-2.5 text-[12px] font-semibold sm:inline"
            style={{ color: 'var(--text-muted)' }}
          >
            with
          </span>
          <DimensionSelect
            label="Against"
            value={dimBKey}
            swatch={colorB}
            options={dimOptions(dimAKey)}
            onChange={(v) => setDimBKey(v)}
          />
        </div>
        <SegmentedToggle
          className="w-full lg:w-[240px]"
          options={RANGE_OPTIONS}
          value={rangeDays}
          onChange={setRangeDays}
        />
      </div>

      {/* Legend — identity is never color-alone; shows the latest captured value. */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        <LegendItem color={colorA} label={dimA.label} value={latestA} dim={dimA} />
        <LegendItem color={colorB} label={dimB.label} value={latestB} dim={dimB} />
      </div>

      {hasData ? (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border-base)' }}
                minTickGap={24}
              />
              {/* Shared normalized scale — axis hidden because 0–100 "relative
                  level" is not meaningful to read; the tooltip carries real values. */}
              <YAxis hide domain={[0, 100]} />
              <Tooltip
                cursor={{ stroke: 'var(--border-base)', strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const row = (payload as unknown as TooltipPayloadItem[])[0]?.payload;
                  if (!row) return null;
                  return (
                    <div
                      className="rounded-xl px-3 py-2 text-[12px] shadow-md"
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-base)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <div className="mb-1 font-bold">{row.label}</div>
                      <TooltipRow color={colorA} dim={dimA} raw={row.aRaw} />
                      <TooltipRow color={colorB} dim={dimB} raw={row.bRaw} />
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="aNorm"
                stroke={colorA}
                strokeWidth={2}
                dot={{ r: 2.5, fill: colorA, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="bNorm"
                stroke={colorB}
                strokeWidth={2}
                dot={{ r: 2.5, fill: colorB, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div
          className="flex h-[220px] flex-col items-center justify-center rounded-2xl text-center"
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
        >
          <p className="text-[14px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
            No health data in this range yet
          </p>
          <p className="mt-1 max-w-[280px] text-[12px]" style={{ color: 'var(--text-muted)' }}>
            Log sleep, steps and energy from Home to start seeing your trends here.
          </p>
        </div>
      )}

      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        Lines are scaled to a shared 0–100 range so two different metrics fit one view — hover any
        point for the real values.
      </p>
    </div>
  );
}

function DimensionSelect({
  label,
  value,
  swatch,
  options,
  onChange,
}: {
  label: string;
  value: DimensionKey;
  swatch: string;
  options: Dimension[];
  onChange: (v: DimensionKey) => void;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1.5 sm:flex-none">
      <span
        className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em]"
        style={{ color: 'var(--text-label)' }}
      >
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: swatch }} />
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as DimensionKey)}
        className="h-11 w-full rounded-xl px-3 text-[14px] font-semibold outline-none focus:border-[var(--accent)] sm:w-[190px]"
        style={{
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border-base)',
          color: 'var(--text-primary)',
        }}
      >
        {options.map((d) => (
          <option key={d.key} value={d.key}>
            {d.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function LegendItem({
  color,
  label,
  value,
  dim,
}: {
  color: string;
  label: string;
  value: number | null;
  dim: Dimension;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span className="text-[12.5px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      {value !== null ? (
        <span className="tabular text-[12.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
          {dim.format(value)}
          {dim.unit ? ` ${dim.unit}` : ''}
        </span>
      ) : null}
    </div>
  );
}

function TooltipRow({ color, dim, raw }: { color: string; dim: Dimension; raw: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      <span style={{ color: 'var(--text-secondary)' }}>{dim.label}</span>
      <span className="tabular ml-auto font-bold" style={{ color: 'var(--text-primary)' }}>
        {raw !== null ? `${dim.format(raw)}${dim.unit ? ` ${dim.unit}` : ''}` : '—'}
      </span>
    </div>
  );
}
