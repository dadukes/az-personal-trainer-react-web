import { Check } from 'lucide-react';

import type { PlanSuggestion } from '@/lib/api';
import { replacedText, savedView, suggestionCardView, type SuggestionDayRow } from '@/lib/planSuggestion';

interface SuggestionCardProps {
  suggestion: PlanSuggestion;
  accepting: boolean;
  error: string | null;
  onAccept: () => void;
  /** Where "See plan" goes: a day, or null for the whole week (Home). */
  onSeePlan: (day: string | null) => void;
}

/** One day of a week table. Below `sm` it stacks, so a phone never scrolls sideways. */
function WeekRow({ row }: { row: SuggestionDayRow }) {
  const ink = row.isWorkout ? 'var(--ink)' : 'var(--ink-3)';
  const exercises = row.exercises.map((ex) => ex.name).join(', ');
  return (
    <tr className="block border-b py-2.5 sm:table-row sm:py-0" style={{ borderColor: 'var(--line)', color: ink }}>
      <td className="inline pr-2 font-bold sm:table-cell sm:py-2.5 sm:pr-3">{row.short}</td>
      <td className="inline pr-2 font-semibold sm:table-cell sm:w-[34%] sm:px-3 sm:py-2.5">{row.workout}</td>
      <td className="inline tabular sm:table-cell sm:whitespace-nowrap sm:px-3 sm:py-2.5" style={{ color: 'var(--ink-2)' }}>
        {row.time ? <span className="sm:hidden">· </span> : null}
        {row.time}
      </td>
      <td className="block pt-1 text-[13.5px] sm:table-cell sm:py-2.5 sm:pl-3 sm:text-[14px]" style={{ color: 'var(--ink-2)' }}>
        {exercises}
      </td>
    </tr>
  );
}

export default function SuggestionCard({ suggestion, accepting, error, onAccept, onSeePlan }: SuggestionCardProps) {
  if (suggestion.status === 'replaced') {
    return (
      <p className="m-0 rounded-[14px] px-3.5 py-3 text-[13.5px] leading-[19px]" style={{ background: 'var(--sunken)', color: 'var(--ink-2)' }}>
        {replacedText(suggestion)}
      </p>
    );
  }

  if (suggestion.status === 'accepted') {
    const saved = savedView(suggestion);
    return (
      <article
        aria-label="Plan saved"
        className="flex flex-wrap items-center gap-3 rounded-[20px] px-4 py-3.5 sm:px-5"
        style={{ background: 'var(--surface)' }}
      >
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full" style={{ background: 'var(--aqua)' }}>
          <Check size={20} strokeWidth={3} color="var(--on-aqua)" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-bold leading-5" style={{ color: 'var(--ink)' }}>
            {saved.title}
          </span>
          <span className="text-[13.5px] leading-[18px]" style={{ color: 'var(--ink-2)' }}>
            {saved.body}
          </span>
        </span>
        <button
          type="button"
          onClick={() => onSeePlan(saved.planDay)}
          className="flex min-h-11 flex-none items-center text-[14.5px] font-bold"
          style={{ color: 'var(--teal)' }}
        >
          See plan
        </button>
      </article>
    );
  }

  const view = suggestionCardView(suggestion);

  return (
    <article
      aria-label={view.layout === 'swap' ? 'Suggested change' : 'Suggested plan'}
      className="flex flex-col gap-3.5 rounded-[20px] p-4 sm:p-5"
      style={{ background: 'var(--surface)' }}
    >
      {view.layout === 'swap' ? (
        <>
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold" style={{ color: 'var(--ink-3)' }}>
              Suggested change, not saved yet
            </span>
            <h2 className="m-0 text-[17px] font-bold leading-[23px]" style={{ color: 'var(--ink)' }}>
              {view.title}
            </h2>
          </div>
          <div className="flex flex-col gap-1 text-[14.5px] leading-5">
            <span className="line-through" style={{ color: 'var(--ink-2)' }}>
              <span className="sr-only">Before: </span>
              {view.before}
            </span>
            <span className="font-bold" style={{ color: 'var(--ink)' }}>
              <span className="sr-only">After: </span>
              {view.after}
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="m-0 text-[17px] font-bold leading-[23px] sm:text-[18px]" style={{ color: 'var(--ink)' }}>
              {view.title}
            </h2>
            <span className="text-[13.5px] sm:text-[14px]" style={{ color: 'var(--ink-2)' }}>
              {view.meta}
            </span>
          </div>

          {view.layout === 'week' ? (
            <table className="block w-full border-collapse text-left text-[14.5px] leading-[21px] sm:table">
              <thead className="hidden sm:table-header-group">
                <tr className="text-[13px]" style={{ color: 'var(--ink-3)', borderBottom: '2px solid var(--line)' }}>
                  <th className="py-2 pr-3 font-bold">Day</th>
                  <th className="px-3 py-2 font-bold">Workout</th>
                  <th className="px-3 py-2 font-bold">Time</th>
                  <th className="py-2 pl-3 font-bold">Exercises</th>
                </tr>
              </thead>
              <tbody className="block sm:table-row-group">
                {view.rows.map((row) => (
                  <WeekRow key={row.day} row={row} />
                ))}
              </tbody>
            </table>
          ) : view.exercises.length > 0 ? (
            <ul className="m-0 flex list-none flex-col p-0">
              <li
                aria-hidden="true"
                className="flex justify-between gap-3 pb-1.5 text-[12.5px] font-bold"
                style={{ color: 'var(--ink-3)', borderBottom: '2px solid var(--line)' }}
              >
                <span>Exercise</span>
                <span>Sets</span>
              </li>
              {view.exercises.map((ex, i) => (
                <li
                  key={`${ex.name}-${i}`}
                  className="flex min-h-11 items-center justify-between gap-3 text-[14.5px]"
                  style={{ color: 'var(--ink)', borderBottom: '1px solid var(--line)' }}
                >
                  <span className="min-w-0">{ex.name}</span>
                  <span className="tabular flex-none font-semibold" style={{ color: 'var(--ink-2)' }}>
                    {ex.target}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {view.layout === 'day' && view.removedNote ? (
            <p className="m-0 text-[13.5px] leading-[19px]" style={{ color: 'var(--ink-2)' }}>
              {view.removedNote}
            </p>
          ) : null}
        </>
      )}

      {error ? (
        <p role="alert" className="m-0 text-[13.5px] leading-[19px]" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3.5">
        <button
          type="button"
          onClick={onAccept}
          disabled={accepting}
          className="h-12 flex-none whitespace-nowrap rounded-[14px] px-6 text-[15px] font-bold transition-transform active:scale-[0.98] disabled:opacity-60"
          style={{ background: 'var(--aqua)', color: 'var(--on-aqua)' }}
        >
          {accepting ? 'Saving…' : view.acceptLabel}
        </button>
        <span className="text-center text-[13px] leading-[18px] sm:text-left sm:text-[14px]" style={{ color: 'var(--ink-2)' }}>
          Not saved yet. Want something different? Just tell me below.
        </span>
      </div>
    </article>
  );
}
