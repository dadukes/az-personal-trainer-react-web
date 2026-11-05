import { lazy, Suspense } from 'react';

import { Surface } from '@/components/ui';
import type { GeneralHeartRate } from '@/lib/api';

// recharts stays in its own chunk, as for the Progress trends chart.
const HeartRateChart = lazy(() => import('@/components/HeartRateChart'));

/**
 * "General HR data" on a guided workout the watch didn't record: the watch's all-day
 * readings over the workout, as an average and a smoothed curve. Background readings are
 * too sparse for a max or zones, so the card has neither (and no zone bands behind the
 * chart). A watch recording replaces it with `HeartRateCard`. Mobile twin:
 * `general-heart-rate-card.tsx`.
 */
export default function GeneralHeartRateCard({ data }: { data: GeneralHeartRate }) {
  return (
    <Surface padding="16px" className="flex flex-col gap-3.5" style={{ borderRadius: 'var(--radius-hero)' }}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="type-section-title m-0" style={{ color: 'var(--ink)' }}>
          General heart rate
        </h2>
        <span className="type-stat text-[20px] font-semibold" style={{ color: 'var(--ink-2)' }}>
          Avg {data.avg_hr}
        </span>
      </div>

      <Suspense fallback={<div className="h-[180px]" />}>
        <HeartRateChart segments={data.hr_curve} zoneModel={null} />
      </Suspense>

      <p className="m-0 text-[12px] leading-[17px]" style={{ color: 'var(--ink-3)' }}>
        From your watch&rsquo;s all-day readings, not a recorded workout, so the curve is smoothed and short peaks
        won&rsquo;t show.
      </p>
    </Surface>
  );
}
