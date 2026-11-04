import { useEffect, useState } from 'react';

import TypingDots from '@/components/TypingDots';
import { stillWorkingNote } from '@/lib/chatTurn';

interface CoachWaitingProps {
  /** What the coach is doing ("Designing a beginner plan"); dots alone without one. */
  label?: string;
  /** When the label last changed. */
  since?: number;
  planBuilding?: boolean;
}

/**
 * The coach's reply on its way: dots, what it's doing, and after a while a line
 * saying it's still going, so a 40 s plan build doesn't read as stuck.
 */
export default function CoachWaiting({ label, since, planBuilding = false }: CoachWaitingProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const note = since !== undefined ? stillWorkingNote(since, now, planBuilding) : null;

  return (
    <div className="flex flex-col gap-0.5" role="status" aria-live="polite">
      <div className="flex items-center gap-2.5">
        <TypingDots color="var(--teal)" />
        {label ? (
          <span className="text-[13.5px] font-semibold" style={{ color: 'var(--ink-2)' }}>
            {label}
          </span>
        ) : null}
      </div>
      {note ? (
        <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
          {note}
        </span>
      ) : null}
    </div>
  );
}
