import { HeartPulse } from 'lucide-react';
import { lazy, Suspense } from 'react';

import { Surface } from '@/components/ui';
import ZoneBar from '@/components/ZoneBar';
import { ZONE_DESCRIPTIONS, ZONE_LABELS, formatMinutes, zoneRanges } from '@/lib/activities';
import type { HrCurveSegment, ZoneModel, ZoneSeconds } from '@/lib/api';

// recharts stays in its own chunk, as for the Progress trends chart.
const HeartRateChart = lazy(() => import('@/components/HeartRateChart'));

interface HeartRateCardProps {
  avgHr: number | null;
  maxHr: number | null;
  secondsInZone: ZoneSeconds | null;
  zoneModel: ZoneModel | null;
  /** "Garmin Connect", for the footnote; omit when the page header already says it. */
  sourceLabel?: string | null;
  /** The curve(s) for the chart; a workout passes one segment per recording. */
  curve?: HrCurveSegment[] | null;
  onAddBirthYear: () => void;
}

/**
 * The heart-rate section of an activity / workout detail page: avg and max bpm, the curve
 * over the session (when stored), then the time in each zone as a bar plus a list (zone, bpm range, minutes), easiest
 * first, zones with no time left out. Colour is never the only signal. Without a zone model the zones can't be drawn, so the card
 * asks for a birth year instead of guessing one.
 */
export default function HeartRateCard({
  avgHr,
  maxHr,
  secondsInZone,
  zoneModel,
  sourceLabel,
  curve,
  onAddBirthYear,
}: HeartRateCardProps) {
  if (avgHr == null && maxHr == null) return null;
  const total = secondsInZone?.reduce((sum, s) => sum + s, 0) ?? 0;
  const ranges = zoneModel ? zoneRanges(zoneModel.floors) : null;

  const zones = [0, 1, 2, 3, 4].filter((i) => (secondsInZone?.[i] ?? 0) > 0);
  const avgMax = [avgHr != null ? `Avg ${avgHr}` : null, maxHr != null ? `Max ${maxHr}` : null].filter(Boolean).join(' · ');

  return (
    <Surface padding="16px" className="flex flex-col gap-3.5" style={{ borderRadius: 'var(--radius-hero)' }}>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
            Heart rate
          </h2>
          <span className="type-stat text-[20px] font-semibold" style={{ color: 'var(--ink-2)' }}>
            {avgMax}
          </span>
        </div>
        {sourceLabel ? (
          <span className="type-meta" style={{ color: 'var(--ink-3)' }}>
            From {sourceLabel}
          </span>
        ) : null}
      </div>

      {curve && curve.length > 0 ? (
        <Suspense fallback={<div className="h-[180px]" />}>
          <HeartRateChart segments={curve} zoneModel={zoneModel} />
        </Suspense>
      ) : null}

      {secondsInZone && total > 0 ? (
        <>
          <ZoneBar values={secondsInZone} format={(s) => `${Math.round(s / 60)}m`} compact />
          <ul aria-label="Time in heart-rate zones" className="m-0 flex list-none flex-col p-0">
            {zones.map((i) => {
              const seconds = secondsInZone[i];
              return (
                <li
                  key={ZONE_LABELS[i]}
                  aria-label={`Zone ${i + 1}, ${ZONE_DESCRIPTIONS[i]}: ${formatMinutes(seconds / 60)}`}
                  className="flex min-h-8 items-center gap-2.5 text-[14px]"
                >
                  <span aria-hidden className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: `var(--zone-${i + 1})` }} />
                  <span className="w-[54px] font-semibold" style={{ color: 'var(--ink)' }}>
                    Zone {i + 1}
                  </span>
                  <span className="flex-1 truncate" style={{ color: 'var(--ink-3)' }}>
                    {ranges ? `${ranges[i]} bpm` : ZONE_DESCRIPTIONS[i]}
                  </span>
                  <span className="type-stat text-[19px]" style={{ color: 'var(--ink)' }}>
                    {seconds >= 60 ? formatMinutes(seconds / 60) : '< 1 min'}
                  </span>
                </li>
              );
            })}
          </ul>
          {zoneModel ? (
            <p className="m-0 text-[12px] leading-[17px]" style={{ color: 'var(--ink-3)' }}>
              Zones use a max heart rate of {zoneModel.max_hr} bpm
              {zoneModel.method === 'hrr' ? ' and your resting heart rate' : ''}. Change your birth year or max heart rate in
              Profile.
            </p>
          ) : null}
        </>
      ) : !zoneModel ? (
        <button
          type="button"
          onClick={onAddBirthYear}
          className="flex min-h-11 items-center gap-2.5 rounded-control p-3 text-left"
          style={{ background: 'var(--sunken)' }}
        >
          <HeartPulse size={16} color="var(--ink-2)" aria-hidden />
          <span className="type-meta flex-1" style={{ color: 'var(--ink-2)' }}>
            Add your birth year to see heart-rate zones.
          </span>
          <span className="text-[13px] font-bold" style={{ color: 'var(--ink)' }}>
            Profile
          </span>
        </button>
      ) : null}
    </Surface>
  );
}
