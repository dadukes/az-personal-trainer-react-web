import { HeartPulse } from 'lucide-react';
import { lazy, Suspense } from 'react';

import { Card } from '@/components/ui';
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
    <Card padding="18px 20px">
      <div className="flex flex-col gap-4">
        {/* Mixed case on purpose: HeartRateCard's uppercase eyebrow would read as a different label. */}
        <h2 className="text-[14px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
          General HR data
        </h2>

        <div className="flex items-baseline gap-1.5">
          <HeartPulse size={16} color="var(--zone-5)" className="self-center" />
          <span className="tabular text-[24px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
            {data.avg_hr}
          </span>
          <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            avg bpm
          </span>
        </div>

        <Suspense fallback={<div className="h-[180px]" />}>
          <HeartRateChart segments={data.hr_curve} zoneModel={null} />
        </Suspense>

        <p className="text-[11.5px] leading-[17px]" style={{ color: 'var(--text-muted)' }}>
          From your watch&rsquo;s all-day readings, not a recorded workout, so the curve is smoothed and short peaks
          won&rsquo;t show.
        </p>
      </div>
    </Card>
  );
}
