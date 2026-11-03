import { useState } from 'react';

import { Button, Sheet } from '@/components/ui';
import { onDate, parseLocalDate, recentDates, recentIndex, timesProblem, tooOldForXp, type PlanDayChoice } from '@/lib/logbookPast';
import { localISODate } from '@/lib/workout';

/**
 * The logbook's Log and Edit pieces: when it was, which workout, and the ways out. The live
 * workout's sheets are in `LogbookView.tsx`. Mobile twin: `workout/logbook/logbook-past-sheets`.
 */

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function clockText(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

/** "Mon", for a date chip's first line. */
function weekdayShort(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

/** "2 Nov", for a date chip's second line. */
function dayMonth(date: Date): string {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** "Mon 2 Nov". */
export function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Today · Tue 3 Nov", "Yesterday · Mon 2 Nov", or "Sat 31 Oct". */
export function dateLabel(date: Date, now: Date): string {
  const index = recentIndex(localISODate(date), now);
  return `${index === 0 ? 'Today · ' : index === 1 ? 'Yesterday · ' : ''}${shortDate(date)}`;
}

/** "7:10 am – 7:58 am · 48 min". */
export function timeRangeLabel(start: Date, end: Date): string {
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
  return `${clockText(start)} – ${clockText(end)} · ${minutes < 1 ? 'under a minute' : `${minutes} min`}`;
}

// ─── The card at the top: which workout and when ────────────────────────────

export function WhenCard({
  source,
  start,
  end,
  onChangeTimes,
  notice,
}: {
  /** Log only: the workout picked, with a way to change it. */
  source?: { label: string; onChange: () => void };
  start: Date;
  end: Date;
  /** Null when the times can't change. */
  onChangeTimes: (() => void) | null;
  notice?: string | null;
}) {
  const now = new Date();
  const when = (
    <span className="flex min-w-0 flex-1 flex-col text-left">
      <span className="text-[12.5px] font-semibold" style={{ color: 'var(--ink-3)' }}>{dateLabel(end, now)}</span>
      <span className="text-[15px] font-bold" style={{ color: 'var(--ink)' }}>{timeRangeLabel(start, end)}</span>
    </span>
  );
  return (
    <section aria-label="When this workout happened" className="flex flex-col rounded-[20px]" style={{ background: 'var(--surface)' }}>
      {source ? (
        <button onClick={source.onChange} className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-2 text-left" style={{ borderBottom: '1px solid var(--line)' }}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[12.5px] font-semibold" style={{ color: 'var(--ink-3)' }}>Workout</span>
            <span className="truncate text-[15px] font-bold" style={{ color: 'var(--ink)' }}>{source.label}</span>
          </span>
          <span className="text-[13.5px] font-bold" style={{ color: 'var(--teal)' }}>Change</span>
        </button>
      ) : null}
      {onChangeTimes ? (
        <button onClick={onChangeTimes} className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-2">
          {when}
          <span className="text-[13.5px] font-bold" style={{ color: 'var(--teal)' }}>Change</span>
        </button>
      ) : (
        <div className="flex min-h-[56px] items-center px-4 py-2">{when}</div>
      )}
      {notice ? (
        <p className="px-4 pb-3.5 pt-2.5 text-[13.5px] leading-[19px]" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>{notice}</p>
      ) : null}
    </section>
  );
}

// ─── Date and times ─────────────────────────────────────────────────────────

function toTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function withTime(date: Date, value: string): Date {
  const [hours, minutes] = value.split(':').map(Number);
  const next = new Date(date);
  next.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return next;
}

/** Today, yesterday, the day before or any earlier date, then start and end. */
export function DateTimesSheet({ start, end, onDone, onClose }: { start: Date; end: Date; onDone: (start: Date, end: Date) => void; onClose: () => void }) {
  const now = new Date();
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  const dateISO = localISODate(to);
  const chip = recentIndex(dateISO, now);
  const [otherOpen, setOtherOpen] = useState(chip == null);
  const problem = timesProblem(from, to, now);
  const minutes = Math.round((to.getTime() - from.getTime()) / 60_000);
  const message = problem ?? (minutes < 1 ? 'Under a minute' : `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  const inputStyle = { background: 'var(--ground)', color: 'var(--ink)', border: '1px solid var(--line)' };

  // A new date keeps the times and the length.
  const pickDate = (iso: string) => {
    const length = to.getTime() - from.getTime();
    const nextEnd = onDate(to, iso);
    setTo(nextEnd);
    setFrom(new Date(nextEnd.getTime() - length));
  };
  // The start's date follows the end's, unless the workout ran past midnight.
  const setStartTime = (value: string) => {
    let next = withTime(to, value);
    if (next.getTime() >= to.getTime()) next = new Date(next.getTime() - 24 * 60 * 60 * 1000);
    setFrom(next);
  };

  return (
    <Sheet open title="When was it?" onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-4 gap-1.5">
          {recentDates(now).map((iso, i) => {
            const on = chip === i && !otherOpen;
            const date = parseLocalDate(iso);
            return (
              <button
                key={iso}
                aria-pressed={on}
                onClick={() => {
                  setOtherOpen(false);
                  pickDate(iso);
                }}
                className="flex h-14 flex-col items-center justify-center rounded-xl"
                style={{ background: on ? 'var(--ink)' : 'var(--sunken)', color: on ? 'var(--ground)' : 'var(--ink)' }}
              >
                <span className="text-[13.5px] font-bold">{i === 0 ? 'Today' : i === 1 ? 'Yesterday' : weekdayShort(date)}</span>
                <span className="text-[12px]">{dayMonth(date)}</span>
              </button>
            );
          })}
          <button
            aria-pressed={otherOpen}
            onClick={() => setOtherOpen(true)}
            className="flex h-14 flex-col items-center justify-center rounded-xl"
            style={{ background: otherOpen ? 'var(--ink)' : 'var(--sunken)', color: otherOpen ? 'var(--ground)' : 'var(--ink)' }}
          >
            <span className="text-[13.5px] font-bold">Other</span>
            <span className="text-[12px]">Pick</span>
          </button>
        </div>
        {otherOpen ? (
          <label className="flex items-center justify-between gap-3 text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>
            Date
            <input
              type="date"
              value={dateISO}
              max={localISODate(now)}
              onChange={(e) => e.target.value && e.target.value <= localISODate(now) && pickDate(e.target.value)}
              className="h-12 rounded-xl px-3 text-[16px]"
              style={inputStyle}
            />
          </label>
        ) : null}
        <label className="flex items-center justify-between gap-3 text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>
          Start
          <input type="time" value={toTimeInput(from)} onChange={(e) => e.target.value && setStartTime(e.target.value)} className="h-12 rounded-xl px-3 text-[16px]" style={inputStyle} />
        </label>
        <label className="flex items-center justify-between gap-3 text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>
          End
          <input type="time" value={toTimeInput(to)} onChange={(e) => e.target.value && setTo(withTime(to, e.target.value))} className="h-12 rounded-xl px-3 text-[16px]" style={inputStyle} />
        </label>
        <div className="flex flex-col gap-1">
          <p role="status" className="text-[14px] font-semibold" style={{ color: problem ? 'var(--danger)' : 'var(--ink-2)' }}>{message}</p>
          {!problem && from.getDate() !== to.getDate() ? <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>Started {shortDate(from)}</p> : null}
          {!problem && tooOldForXp(to, now) ? (
            <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>More than 7 days ago, so it won&rsquo;t earn XP. It still counts in your history and trends.</p>
          ) : null}
        </div>
        <Button variant="strong" fullWidth disabled={problem != null} onClick={() => onDone(from, to)}>Done</Button>
      </div>
    </Sheet>
  );
}

// ─── Which workout ──────────────────────────────────────────────────────────

export function SourceSheet({ choices, dateDayKey, onPick, onClose }: { choices: PlanDayChoice[]; dateDayKey: string; onPick: (dayKey: string | null) => void; onClose: () => void }) {
  const row = 'flex min-h-[56px] flex-col justify-center px-1 py-1.5 text-left';
  return (
    <Sheet open title="Which workout?" onClose={onClose}>
      <div className="-mx-1 flex flex-col">
        {choices.map((c) => (
          <button key={c.key} onClick={() => onPick(c.key)} className={row}>
            <span className="text-[15px] font-bold" style={{ color: 'var(--ink)' }}>{c.plan.focus ?? `${capitalize(c.key)} workout`}</span>
            <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
              {capitalize(c.key)}&rsquo;s plan{c.key === dateDayKey ? ', the default for this date' : ''}
            </span>
          </button>
        ))}
        <button onClick={() => onPick(null)} className={row}>
          <span className="text-[15px] font-bold" style={{ color: 'var(--ink)' }}>Empty workout</span>
          <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Not on your plan. Add what you did.</span>
        </button>
      </div>
    </Sheet>
  );
}

// ─── Leaving and deleting ───────────────────────────────────────────────────

export function DiscardSheet({ mode, onKeep, onDiscard }: { mode: 'log' | 'edit'; onKeep: () => void; onDiscard: () => void }) {
  return (
    <Sheet open title="Discard your changes?" onClose={onKeep}>
      <div className="flex flex-col gap-2.5">
        <p className="mb-1.5 text-[14.5px] leading-[21px]" style={{ color: 'var(--ink-2)' }}>
          {mode === 'edit' ? 'Your saved workout stays as it was.' : 'Nothing has been saved yet.'}
        </p>
        <Button fullWidth size="lg" onClick={onKeep}>Keep editing</Button>
        <button onClick={onDiscard} className="min-h-[44px] text-[15px] font-bold" style={{ color: 'var(--danger)' }}>
          {mode === 'edit' ? 'Discard changes' : 'Discard this log'}
        </button>
      </div>
    </Sheet>
  );
}

export function DeleteSheet({
  sets,
  planDay,
  hasRecording,
  deleting,
  error,
  onDelete,
  onKeep,
}: {
  sets: number;
  planDay: string | null;
  hasRecording: boolean;
  deleting: boolean;
  error: string | null;
  onDelete: () => void;
  onKeep: () => void;
}) {
  const parts = [
    `Removes ${sets} ${sets === 1 ? 'set' : 'sets'} and the XP they earned, and updates your trends.`,
    planDay ? `${capitalize(planDay)} will show as not done again.` : null,
    hasRecording ? 'Your watch recording stays in Activities.' : null,
  ].filter((part): part is string => part != null);
  return (
    <Sheet open title="Delete this workout?" onClose={onKeep}>
      <div className="flex flex-col gap-2.5">
        <p className="mb-1.5 text-[14.5px] leading-[21px]" style={{ color: 'var(--ink-2)' }}>{parts.join(' ')}</p>
        {error ? <p role="alert" className="text-[13.5px]" style={{ color: 'var(--danger)' }}>{error}</p> : null}
        <Button variant="danger" fullWidth disabled={deleting} onClick={onDelete}>{deleting ? 'Deleting…' : 'Delete workout'}</Button>
        <Button variant="link" fullWidth onClick={onKeep}>Keep it</Button>
      </div>
    </Sheet>
  );
}
