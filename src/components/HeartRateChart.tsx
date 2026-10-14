import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatElapsed, hrChartPoints, ZONE_LABELS, type HrChartPoint } from '@/lib/activities';
import type { HrCurveSegment, ZoneModel } from '@/lib/api';

interface HeartRateChartProps {
  segments: HrCurveSegment[];
  zoneModel: ZoneModel | null;
}

interface TooltipPayloadItem {
  payload: HrChartPoint;
}

/**
 * Heart rate over the session, Garmin-style: bpm against elapsed time, with the zones as
 * faint bands behind the line when a zone model exists. A workout's recordings share one
 * axis, with a gap between them. The bands repeat what the zone table says, so colour is
 * never the only signal. Mobile twin: `components/heart-rate-chart.tsx`.
 */
export default function HeartRateChart({ segments, zoneModel }: HeartRateChartProps) {
  const points = useMemo(() => hrChartPoints(segments), [segments]);
  const readings = points.filter((p): p is { t: number; bpm: number } => p.bpm != null);
  if (readings.length < 2) return null;

  const min = Math.min(...readings.map((p) => p.bpm));
  const max = Math.max(...readings.map((p) => p.bpm));
  const yMin = Math.max(30, Math.floor((min - 8) / 10) * 10);
  const yMax = Math.ceil((max + 8) / 10) * 10;
  const end = points[points.length - 1].t;
  const floors = zoneModel?.floors ?? null;

  return (
    <div
      role="img"
      aria-label={`Heart rate over ${formatElapsed(end)}: from ${min} to ${max} bpm.`}
      className="h-[180px] w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: -12 }}>
          {floors
            ? floors.map((floor, i) => (
                <ReferenceArea
                  key={ZONE_LABELS[i]}
                  y1={Math.max(floor, yMin)}
                  y2={Math.min(floors[i + 1] ?? yMax, yMax)}
                  ifOverflow="hidden"
                  fill={`var(--zone-${i + 1})`}
                  fillOpacity={0.12}
                  stroke="none"
                />
              ))
            : null}
          <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
          <XAxis
            dataKey="t"
            type="number"
            domain={[0, end]}
            tickFormatter={formatElapsed}
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
            minTickGap={36}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: 'var(--border-strong)' }}
            content={({ active, payload }) => {
              const point = (payload as unknown as TooltipPayloadItem[] | undefined)?.[0]?.payload;
              if (!active || !point || point.bpm == null) return null;
              return (
                <div
                  className="rounded-xl px-3 py-2 text-[12px] shadow-md"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                >
                  <span className="tabular font-bold">{point.bpm} bpm</span>
                  <span className="tabular ml-2" style={{ color: 'var(--text-muted)' }}>
                    {formatElapsed(point.t)}
                  </span>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="bpm"
            stroke="var(--zone-5)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
