import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

/** Back to wherever the user came from (Home, the list), else the Activities list. */
export function useBackToActivities(): () => void {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/activities');
  };
}

interface DetailHeaderProps {
  /** The line above the title: "Wednesday, November 4 · 6:42 – 7:13 PM". */
  meta?: string | null;
  title: string;
  /** The line under it: where it came from, or the workout's focus. */
  sub?: string | null;
  onBack: () => void;
  /** Top right, level with Back (e.g. Edit). */
  action?: ReactNode;
}

/** Back, then the date, the big name and where it came from. Mobile twin: `detail-header`. */
export default function DetailHeader({ meta, title, sub, onBack, action }: DetailHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="-ml-3 flex items-center justify-between">
        <button type="button" onClick={onBack} aria-label="Back" className="flex h-11 w-11 items-center justify-center" style={{ color: 'var(--ink)' }}>
          <ChevronLeft size={24} strokeWidth={2.2} aria-hidden />
        </button>
        {action}
      </div>
      <div className="flex flex-col gap-1.5">
        {meta ? (
          <span className="type-meta font-semibold" style={{ color: 'var(--ink-3)' }}>
            {meta}
          </span>
        ) : null}
        <h1 className="type-display m-0 text-[44px] leading-[1.05]" style={{ color: 'var(--ink)' }}>
          {title}
        </h1>
        {sub ? (
          <span className="text-[14px] leading-5" style={{ color: 'var(--ink-2)' }}>
            {sub}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** The detail pages' numbers: three to a row on a phone, four from `sm`. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <dl className="m-0 grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4">{children}</dl>;
}

/** One number in a `StatGrid`: the value over its label. */
export function DetailStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse gap-[3px]">
      <dt className="type-meta" style={{ color: 'var(--ink-3)' }}>
        {label}
      </dt>
      <dd className="type-stat m-0 truncate text-[34px]" style={{ color: 'var(--ink)' }}>
        {value}
      </dd>
    </div>
  );
}
