import { HeartPulse } from 'lucide-react';

import { Card, Eyebrow } from '@/components/ui';
import ZoneBar from '@/components/ZoneBar';
import { ZONE_DESCRIPTIONS, ZONE_LABELS, formatMinutes, zoneRanges } from '@/lib/activities';
import type { ZoneModel, ZoneSeconds } from '@/lib/api';

interface HeartRateCardProps {
  avgHr: number | null;
  maxHr: number | null;
  secondsInZone: ZoneSeconds | null;
  zoneModel: ZoneModel | null;
  /** "Garmin Connect", for the footnote; omit when the page header already says it. */
  sourceLabel?: string | null;
  onAddBirthYear: () => void;
}

/**
 * The heart-rate section of an activity / workout detail page: avg and max bpm, then the
 * time in each zone as a bar plus a table (zone, name, bpm range, minutes, share). Colour
 * is never the only signal. Without a zone model the zones can't be drawn, so the card
 * asks for a birth year instead of guessing one.
 */
export default function HeartRateCard({ avgHr, maxHr, secondsInZone, zoneModel, sourceLabel, onAddBirthYear }: HeartRateCardProps) {
  if (avgHr == null && maxHr == null) return null;
  const total = secondsInZone?.reduce((sum, s) => sum + s, 0) ?? 0;
  const ranges = zoneModel ? zoneRanges(zoneModel.floors) : null;

  return (
    <Card padding="18px 20px">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Eyebrow>Heart rate</Eyebrow>
          {sourceLabel ? (
            <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              from {sourceLabel}
            </span>
          ) : null}
        </div>

        <div className="flex gap-6">
          {[
            ['Avg', avgHr],
            ['Max', maxHr],
          ].map(([label, value]) =>
            value != null ? (
              <div key={label as string} className="flex items-baseline gap-1.5">
                <HeartPulse size={16} color="var(--zone-5)" className="self-center" />
                <span className="tabular text-[24px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                  {value}
                </span>
                <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  {(label as string).toLowerCase()} bpm
                </span>
              </div>
            ) : null,
          )}
        </div>

        {secondsInZone && total > 0 ? (
          <>
            <ZoneBar values={secondsInZone} format={(s) => `${Math.round(s / 60)}m`} compact />
            <div role="table" aria-label="Time in heart-rate zones" className="flex flex-col">
              {[...secondsInZone].map((_, idx) => {
                // Hardest zone first, as on a watch.
                const i = secondsInZone.length - 1 - idx;
                const seconds = secondsInZone[i];
                const share = Math.round((seconds / total) * 100);
                return (
                  <div
                    role="row"
                    key={ZONE_LABELS[i]}
                    className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 py-1.5 text-[13px]"
                    style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--border-subtle)' }}
                  >
                    <span role="cell" className="inline-flex items-center gap-1.5 font-bold" style={{ color: 'var(--text-primary)' }}>
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: `var(--zone-${i + 1})` }} />
                      {ZONE_LABELS[i]}
                    </span>
                    <span role="cell" style={{ color: 'var(--text-secondary)' }}>
                      {ZONE_DESCRIPTIONS[i]}
                      {ranges ? (
                        <span className="tabular ml-1.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                          {ranges[i]} bpm
                        </span>
                      ) : null}
                    </span>
                    <span role="cell" className="tabular font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {seconds >= 60 ? formatMinutes(seconds / 60) : seconds > 0 ? '< 1 min' : '–'}
                    </span>
                    <span role="cell" className="tabular w-10 text-right text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      {share}%
                    </span>
                  </div>
                );
              })}
            </div>
            {zoneModel ? (
              <p className="text-[11.5px] leading-[1.5]" style={{ color: 'var(--text-muted)' }}>
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
      </div>
    </Card>
  );
}
