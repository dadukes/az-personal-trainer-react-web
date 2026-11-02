import { ArrowLeftRight, Check, ChevronDown, Maximize2, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';

import { playHoldCue } from '@/lib/alertSound';
import {
  displaySeconds,
  extendSwitch,
  heldSeconds,
  holdCue,
  holdElapsed,
  holdPosition,
  pauseHold,
  restartHold,
  resumeHold,
  startSideTwo,
  SWITCH_ADD_SECONDS,
  type HoldPosition,
  type HoldTimer,
} from '@/lib/holdTimer';
import { formatClock } from '@/lib/workoutSession';

/** Fast enough for a smooth ring and beeps on the second. */
const TICK_MS = 200;

export interface HoldControls {
  position: HoldPosition;
  toggle: () => void;
  restart: () => void;
  moreTime: () => void;
  sideTwo: () => void;
  /** Ticks the set with the time held so far. */
  doneEarly: () => void;
}

/**
 * Runs a timed hold's clock, beeps and finish. Mirrors the phone's `HoldTimerHost`; on the web
 * the screen and the bar are drawn by the caller, because the bar sits in two places.
 */
export function useHoldTimer(
  timer: HoldTimer | null,
  soundOn: boolean,
  onChange: (next: HoldTimer) => void,
  onFinish: (held: number | null) => void,
): HoldControls | null {
  const [now, setNow] = useState(() => Date.now());
  const lastElapsedRef = useRef(0);
  const finishedRef = useRef(false);
  const running = timer?.runningSince != null;

  // A new timer starts with a clean slate; any change to one shows at once.
  const startedRef = useRef<HoldTimer | null>(null);
  useEffect(() => {
    if (timer && (!startedRef.current || startedRef.current.blockKey !== timer.blockKey || startedRef.current.setIndex !== timer.setIndex)) {
      lastElapsedRef.current = holdElapsed(timer, Date.now());
      finishedRef.current = false;
    }
    startedRef.current = timer;
    setNow(Date.now());
  }, [timer]);

  useEffect(() => {
    if (!running) return;
    const sync = () => setNow(Date.now());
    const id = window.setInterval(sync, TICK_MS);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [running]);

  const position = timer ? holdPosition(timer, now) : null;
  const phase = position?.phase;

  useEffect(() => {
    if (!timer) return;
    const elapsed = holdElapsed(timer, now);
    const cue = holdCue(timer, lastElapsedRef.current, elapsed);
    lastElapsedRef.current = elapsed;
    if (cue) playHoldCue(cue, soundOn);
    if (phase === 'done' && !finishedRef.current) {
      finishedRef.current = true;
      onFinish(null);
    }
  }, [timer, now, phase, soundOn, onFinish]);

  if (!timer || !position) return null;
  return {
    position,
    toggle: () => {
      const at = Date.now();
      onChange(running ? pauseHold(timer, at) : resumeHold(timer, at));
    },
    restart: () => onChange(restartHold(timer, Date.now())),
    moreTime: () => onChange(extendSwitch(timer, Date.now())),
    sideTwo: () => onChange(startSideTwo(timer, Date.now())),
    doneEarly: () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onFinish(heldSeconds(timer, Date.now()));
    },
  };
}

export function partLabel(position: HoldPosition, perSide: boolean): string {
  if (position.phase === 'switch') return 'Switch sides';
  return perSide ? `Side ${position.side} of 2` : 'Hold';
}

interface HoldScreenProps {
  controls: HoldControls;
  name: string;
  setLabel: string;
  perSide: boolean;
  onMinimise: () => void;
  onCancel: () => void;
}

/** The hold, full screen, readable from the floor. Escape or the arrow puts it away. */
export function HoldScreen({ controls, name, setLabel, perSide, onMinimise, onCancel }: HoldScreenProps) {
  const { position } = controls;
  const switching = position.phase === 'switch';
  const paused = position.paused;
  const seconds = displaySeconds(position);
  const left = position.partMs > 0 ? Math.min(1, position.remainingMs / position.partMs) : 0;
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  // The break turns the whole screen aqua, so it's obvious from across the room.
  const ink = switching ? 'var(--on-aqua)' : 'var(--ink)';
  const ink2 = switching ? 'var(--on-aqua)' : 'var(--ink-2)';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMinimise();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onMinimise]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Timer, ${name}`}
      className="fixed inset-0 z-50 flex flex-col px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]"
      style={{ background: switching ? 'var(--aqua)' : 'var(--ground)' }}
    >
      <div className="mx-auto flex w-full max-w-[560px] items-center gap-1 pt-1">
        <button aria-label="Back to your workout, the timer keeps running" onClick={onMinimise} className="flex h-12 w-12 flex-shrink-0 items-center justify-center" style={{ color: ink }}>
          <ChevronDown size={28} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <span className="w-full truncate text-center text-[17px] font-bold" style={{ color: ink }}>{name}</span>
          <span className="text-[14px] font-semibold" style={{ color: ink2 }}>{setLabel}</span>
        </div>
        <button aria-label="Stop the timer without ticking the set" onClick={onCancel} className="flex h-12 w-12 flex-shrink-0 items-center justify-center" style={{ color: ink }}>
          <X size={24} />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <h2 className="text-[26px] font-extrabold" style={{ color: ink }}>{partLabel(position, perSide)}</h2>
        <button
          onClick={switching ? controls.sideTwo : controls.toggle}
          aria-label={
            switching
              ? `Switch sides, side 2 starts in ${seconds} seconds. Select to start it now`
              : `${formatClock(seconds)} left. ${paused ? 'Paused, select to resume' : 'Select to pause'}`
          }
          className="relative flex aspect-square items-center justify-center rounded-full"
          style={{ width: 'min(calc(100vw - 48px), 50dvh, 380px)' }}
        >
          <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden>
            <circle cx="100" cy="100" r={radius} fill="none" strokeWidth="10" stroke={switching ? 'var(--on-aqua)' : 'var(--sunken)'} strokeOpacity={switching ? 0.18 : 1} />
            {left > 0 ? (
              <circle
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                stroke={switching ? 'var(--on-aqua)' : paused ? 'var(--ink-3)' : 'var(--aqua)'}
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - left)}
                transform="rotate(-90 100 100)"
              />
            ) : null}
          </svg>
          {switching ? (
            <span className="relative flex flex-col items-center gap-1" style={{ color: ink }}>
              <ArrowLeftRight size={40} strokeWidth={2.4} />
              <span className="font-number tabular font-bold leading-none" style={{ fontSize: 'min(20vw, 11dvh, 96px)' }}>{seconds}</span>
              <span className="text-[15px] font-semibold">{paused ? 'Paused · select to start side 2' : 'Select to start side 2 now'}</span>
            </span>
          ) : (
            <span className="relative flex flex-col items-center gap-1">
              <span className="font-number tabular font-bold leading-none" style={{ fontSize: 'min(26vw, 13dvh, 116px)', color: paused ? 'var(--ink-3)' : ink }}>
                {formatClock(seconds)}
              </span>
              <span className="text-[15px] font-semibold" style={{ color: ink2 }}>{paused ? 'Paused · select to resume' : 'Select to pause'}</span>
            </span>
          )}
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-[560px] gap-2">
        {switching ? (
          <>
            <BigButton label={`+${SWITCH_ADD_SECONDS} s`} ariaLabel={`${SWITCH_ADD_SECONDS} more seconds to switch`} grow="flex-[1]" fill="var(--surface)" ink="var(--ink)" onClick={controls.moreTime} />
            <BigButton label="Start side 2" grow="flex-[1.6]" fill="var(--hero)" ink="var(--hero-ink)" onClick={controls.sideTwo} Icon={Play} />
          </>
        ) : (
          <>
            <BigButton label="Restart" ariaLabel="Restart the timer from the beginning" grow="flex-[1]" fill="var(--sunken)" ink="var(--ink)" onClick={controls.restart} Icon={RotateCcw} />
            <BigButton label="Done" ariaLabel="Done, tick the set with the time held so far" grow="flex-[1.4]" fill="var(--ink)" ink="var(--ground)" onClick={controls.doneEarly} Icon={Check} />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function BigButton({
  label,
  ariaLabel,
  grow,
  fill,
  ink,
  onClick,
  Icon,
}: {
  label: string;
  ariaLabel?: string;
  grow: string;
  fill: string;
  ink: string;
  onClick: () => void;
  Icon?: ComponentType<{ size?: number }>;
}) {
  return (
    <button
      aria-label={ariaLabel ?? label}
      onClick={onClick}
      className={`flex h-[60px] min-w-0 items-center justify-center gap-2 rounded-2xl text-[17px] font-bold active:scale-[0.98] ${grow}`}
      style={{ background: fill, color: ink }}
    >
      {Icon ? <Icon size={20} /> : null}
      {label}
    </button>
  );
}

/** The timer while you look at the list. Like the rest bar, it never covers a set. */
export function HoldBar({ controls, name, perSide, onOpen }: { controls: HoldControls; name: string; perSide: boolean; onOpen: () => void }) {
  const { position } = controls;
  const left = position.partMs > 0 ? Math.min(100, (position.remainingMs / position.partMs) * 100) : 0;
  const seconds = displaySeconds(position);
  const switching = position.phase === 'switch';
  const ink = switching ? 'var(--on-aqua)' : 'var(--ground)';
  return (
    <div role="timer" aria-label={`${name}, ${partLabel(position, perSide)}, ${seconds} seconds left`} style={{ background: switching ? 'var(--aqua)' : 'var(--ink)', color: ink }}>
      <div className="h-1" style={{ background: switching ? 'var(--on-aqua)' : 'var(--ink-3)', opacity: switching ? 0.25 : 1 }}>
        <div className="h-1" style={{ width: `${left}%`, background: switching ? 'var(--on-aqua)' : 'var(--aqua)' }} />
      </div>
      <div className="flex items-center gap-1 pl-5 pr-2">
        <button onClick={onOpen} aria-label="Open the timer" className="flex min-h-[52px] min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className="font-number tabular text-[30px] font-bold leading-none">{switching ? seconds : formatClock(seconds)}</span>
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
            {position.paused ? 'Paused' : partLabel(position, perSide)} · {name}
          </span>
        </button>
        <button aria-label={position.paused ? 'Resume the timer' : 'Pause the timer'} onClick={controls.toggle} className="flex h-12 w-12 items-center justify-center">
          {position.paused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
        </button>
        <button aria-label="Open the timer" onClick={onOpen} className="flex h-12 w-12 items-center justify-center">
          <Maximize2 size={20} />
        </button>
      </div>
    </div>
  );
}
