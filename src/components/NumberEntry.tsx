import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui';
import {
  formatDuration,
  formatEntryNumber,
  parseNumberDraft,
  roundTo,
  sanitizeNumberDraft,
  splitDuration,
} from '@/lib/numberEntry';

/**
 * Typed entry for the numbers the ± steppers drive. Reaching 102.5 kg or a 5.23 km run
 * by tapping is slow (and halves weren't reachable at all), so the number itself is the
 * field: tap it, type, done. The dashed underline is the affordance that it's editable.
 */

/**
 * Selects a just-focused field's contents so typing replaces them. Deferred a frame
 * because iOS clears a selection made during the tap — but skipped if a digit has
 * already landed by then, or it would select (and the next key replace) that digit.
 */
function selectSoon(el: HTMLInputElement) {
  el.select();
  const at = el.value;
  requestAnimationFrame(() => {
    if (document.activeElement === el && el.value === at) el.select();
  });
}

/** Dashed underline that marks a number as tappable; solid accent while editing. */
const EDITABLE_CLASS =
  'rounded-md border-b-2 border-dashed bg-transparent outline-none transition-colors focus:border-solid';

interface NumberEntryProps {
  value: number;
  onCommit: (next: number) => void;
  /** Accessible name, e.g. "Weight in kg". */
  label: string;
  /** Decimal places the value keeps (0 = whole numbers only). */
  decimals?: number;
  min?: number;
  max?: number;
  /** Sizing/typography. Font size must stay ≥16px so iOS doesn't zoom on focus. */
  className?: string;
  /** For a completed (mint) row, where the theme text tokens are unreadable. */
  color?: string;
  /** Take the container's width instead of hugging the digits — for cramped list rows. */
  fill?: boolean;
}

/**
 * An inline number the user can type into. While focused it edits a text draft (so
 * "12," survives mid-typing), and commits on blur or Enter; Escape or an empty field
 * leaves the value untouched.
 */
export function NumberEntry({
  value,
  onCommit,
  label,
  decimals = 0,
  min = 0,
  max,
  className = '',
  color = 'var(--text-primary)',
  fill = false,
}: NumberEntryProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const shown = draft ?? formatEntryNumber(value, decimals);

  const commit = () => {
    if (draft == null) return;
    setDraft(null);
    const parsed = parseNumberDraft(draft);
    if (parsed == null) return;
    let next = roundTo(parsed, decimals);
    next = Math.max(min, max != null ? Math.min(max, next) : next);
    if (next !== value) onCommit(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      cancelRef.current = true;
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="text"
      inputMode={decimals > 0 ? 'decimal' : 'numeric'}
      enterKeyHint="done"
      autoComplete="off"
      aria-label={label}
      value={shown}
      onFocus={(e) => {
        setDraft(formatEntryNumber(value, decimals));
        selectSoon(e.currentTarget);
      }}
      onChange={(e) => setDraft(sanitizeNumberDraft(e.target.value, decimals))}
      onBlur={() => {
        if (cancelRef.current) {
          cancelRef.current = false;
          setDraft(null);
          return;
        }
        commit();
      }}
      onKeyDown={onKeyDown}
      className={`tabular min-w-0 text-center font-extrabold ${EDITABLE_CLASS} ${className}`}
      style={{
        color,
        borderColor: draft != null ? 'var(--accent)' : 'var(--border-strong)',
        // Hug the digits so the underline reads as belonging to the number.
        width: fill ? '100%' : `${Math.max(2, shown.length) + 0.5}ch`,
      }}
    />
  );
}

// ─── Duration ─────────────────────────────────────────────────────────────────

interface DurationEntryProps {
  seconds: number;
  onCommit: (seconds: number) => void;
  /** What is being timed, e.g. "Time" — titles the entry sheet. */
  label: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * A duration shown as "32:45" (or "1:05:30"). A clock time isn't one number, and a
 * numeric keypad has no ":" key, so tapping opens a small sheet with hours / minutes /
 * seconds fields instead of editing inline.
 */
export function DurationEntry({ seconds, onCommit, label, className = '', style }: DurationEntryProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label}: ${formatDuration(seconds)}. Tap to type an exact time`}
        className={`tabular font-extrabold ${EDITABLE_CLASS} ${className}`}
        style={{ color: 'var(--text-primary)', borderColor: 'var(--border-strong)', ...style }}
      >
        {formatDuration(seconds)}
      </button>
      {open ? (
        <DurationSheet
          label={label}
          seconds={seconds}
          onClose={() => setOpen(false)}
          onDone={(next) => {
            setOpen(false);
            if (next !== seconds) onCommit(next);
          }}
        />
      ) : null}
    </>
  );
}

function DurationSheet({
  label,
  seconds,
  onClose,
  onDone,
}: {
  label: string;
  seconds: number;
  onClose: () => void;
  onDone: (seconds: number) => void;
}) {
  const initial = splitDuration(seconds);
  const [parts, setParts] = useState({
    h: String(initial.h),
    m: String(initial.m),
    s: String(initial.s),
  });
  const refs = {
    h: useRef<HTMLInputElement | null>(null),
    m: useRef<HTMLInputElement | null>(null),
    s: useRef<HTMLInputElement | null>(null),
  };

  // Most runs and walks are under the hour, so the cursor starts on minutes.
  useEffect(() => {
    const el = initial.h > 0 ? refs.h.current : refs.m.current;
    el?.focus();
    el?.select();
    // Mount-only: re-focusing on every keystroke would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const total = () => {
    const n = (v: string) => Number.parseInt(v, 10) || 0;
    return n(parts.h) * 3600 + n(parts.m) * 60 + n(parts.s);
  };

  const field = (key: 'h' | 'm' | 's', unit: string, next?: 'm' | 's') => (
    <label className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <input
        ref={refs[key]}
        type="text"
        inputMode="numeric"
        enterKeyHint={next ? 'next' : 'done'}
        autoComplete="off"
        aria-label={unit}
        value={parts[key]}
        maxLength={2}
        onFocus={(e) => selectSoon(e.currentTarget)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          setParts((p) => ({ ...p, [key]: digits }));
          // Two digits of minutes is a complete minutes value — hop to seconds.
          if (key === 'm' && digits.length >= 2) {
            // Select now, not a frame later: the next digit may already be on its way.
            refs.s.current?.focus();
            refs.s.current?.select();
          }
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (next) refs[next].current?.focus();
          else onDone(total());
        }}
        className="tabular h-16 w-full rounded-xl text-center text-[30px] font-extrabold outline-none focus:border-[var(--accent)]"
        style={{
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border-base)',
          color: 'var(--text-primary)',
        }}
      />
      <span className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>
        {unit}
      </span>
    </label>
  );

  return createPortal(
    // Top-anchored on phones: the on-screen keyboard covers the bottom half.
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center p-5 pt-[max(64px,env(safe-area-inset-top))] sm:items-center sm:pt-5"
      style={{ background: 'rgba(6,34,77,0.45)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Enter ${label.toLowerCase()}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[360px] rounded-[24px] p-5"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
      >
        <div className="mb-4 text-[17px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
          {label}
        </div>
        <div className="flex items-start gap-2">
          {field('h', 'hours', 'm')}
          <span className="pt-4 text-[26px] font-extrabold" style={{ color: 'var(--text-muted)' }}>:</span>
          {field('m', 'min', 's')}
          <span className="pt-4 text-[26px] font-extrabold" style={{ color: 'var(--text-muted)' }}>:</span>
          {field('s', 'sec')}
        </div>
        <div className="mt-5 flex gap-2.5">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button fullWidth onClick={() => onDone(total())}>
            Done
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
