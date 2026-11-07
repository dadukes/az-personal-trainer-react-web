import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { Segmented } from '@/components/ui';
import { addDaysISO, dayChoiceLabel, daysBack, MAX_DAYS_BACK, pastDayNote } from '@/lib/captureDay';

type Choice = 'today' | 'yesterday' | 'earlier';

/** When: Today, Yesterday, or Earlier with a day stepper. Used by the capture dialogs. */
export default function DayPicker({ value, today, onChange }: { value: string; today: string; onChange: (dateISO: string) => void }) {
  const back = daysBack(value, today);
  const [earlier, setEarlier] = useState(back > 1);
  const choice: Choice = earlier ? 'earlier' : back === 0 ? 'today' : 'yesterday';
  const note = pastDayNote(value, today);

  const pick = (next: Choice) => {
    setEarlier(next === 'earlier');
    onChange(addDaysISO(today, next === 'today' ? 0 : next === 'yesterday' ? -1 : -2));
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13.5px] font-semibold" style={{ color: 'var(--ink-2)' }}>When</span>
      <Segmented<Choice>
        options={[
          { value: 'today', label: 'Today' },
          { value: 'yesterday', label: 'Yesterday' },
          { value: 'earlier', label: 'Earlier…' },
        ]}
        value={choice}
        onChange={pick}
      />
      {earlier ? (
        <div className="flex h-12 items-center justify-between rounded-xl" style={{ background: 'var(--ground)' }}>
          <button type="button" onClick={() => onChange(addDaysISO(value, -1))} disabled={back >= MAX_DAYS_BACK} aria-label="Day before" className="flex h-12 w-12 items-center justify-center disabled:opacity-35">
            <ChevronLeft size={20} color="var(--ink)" aria-hidden="true" />
          </button>
          <span className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }} aria-live="polite">
            {dayChoiceLabel(value, today)}
          </span>
          <button type="button" onClick={() => onChange(addDaysISO(value, 1))} disabled={back <= 1} aria-label="Day after" className="flex h-12 w-12 items-center justify-center disabled:opacity-35">
            <ChevronRight size={20} color="var(--ink)" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {note ? <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>{note}</span> : null}
    </div>
  );
}
