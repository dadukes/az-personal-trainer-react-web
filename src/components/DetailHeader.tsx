import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { Eyebrow } from '@/components/ui';

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
  eyebrow: string;
  title: string;
  onBack: () => void;
  action?: ReactNode;
}

/** Back button, eyebrow and title for the activity and workout detail pages. */
export default function DetailHeader({ eyebrow, title, onBack, action }: DetailHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onBack}
        aria-label="Back"
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
      >
        <ChevronLeft size={20} color="var(--text-secondary)" />
      </button>
      <div className="min-w-0 flex-1">
        <Eyebrow>{eyebrow}</Eyebrow>
        <div className="truncate text-[24px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </div>
      </div>
      {action}
    </div>
  );
}
