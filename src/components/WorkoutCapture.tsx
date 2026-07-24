import {
  Bike,
  Check,
  Footprints,
  Mountain,
  Pause,
  Play,
  RotateCcw,
  Sailboat,
  SkipForward,
  Square,
  Users,
  Waves,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';

import { Badge, Button, Card, Eyebrow } from '@/components/ui';
import type { CardioActivityKind } from '@/lib/api';
import { cardioKindLabel, formatDistanceKm, hrZoneHelper, hrZoneText } from '@/lib/exercise';
import { formatClock, type Block } from '@/lib/workoutSession';

/**
 * Render cases for exercises the app deliberately does **not** track live.
 *
 * A 5 km run or a spin class happens away from the screen, so the honest interaction is
 * to state the target, let the user report what they actually did, and get out of the
 * way. Intervals are the exception — they are structured enough to coach in real time,
 * so they get an auto-advancing player (with an escape hatch back to plain logging).
 */

// ─── Shared bits ──────────────────────────────────────────────────────────────

const KIND_ICONS: Record<CardioActivityKind, ComponentType<{ size?: number; color?: string }>> = {
  run: Footprints,
  cycle: Bike,
  swim: Waves,
  row: Sailboat,
  walk: Footprints,
  hike: Mountain,
  other: Footprints,
};

function TargetChips({ block }: { block: Block }) {
  const zone = hrZoneText(block.hrZone);
  const helper = hrZoneHelper(block.hrZone);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {block.targetDistanceKm ? <Badge tone="mint">{formatDistanceKm(block.targetDistanceKm)}</Badge> : null}
        {block.targetDurationMinutes ? <Badge tone="mint">{block.targetDurationMinutes} min</Badge> : null}
        {zone ? <Badge tone="neutral">{zone}</Badge> : null}
      </div>
      {helper ? (
        <p className="text-[12.5px] italic" style={{ color: 'var(--text-muted)' }}>
          &ldquo;{helper}&rdquo;
        </p>
      ) : null}
    </div>
  );
}

/** A big number field the user types into, flanked by coarse steppers. */
function CaptureField({
  label,
  unit,
  value,
  step,
  min = 0,
  decimals = 0,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  step: number;
  min?: number;
  decimals?: number;
  onChange: (next: number) => void;
}) {
  const clamp = (n: number) => Math.max(min, Math.round(n * 10 ** decimals) / 10 ** decimals);
  return (
    <div
      className="flex flex-1 flex-col items-center gap-2 rounded-[20px] px-2.5 py-4"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
    >
      <span className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(clamp(value - step))}
          aria-label={`Decrease ${label}`}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[18px] font-bold transition-transform active:scale-90"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', color: 'var(--accent-text)' }}
        >
          −
        </button>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          min={min}
          step={step}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          aria-label={`${label} in ${unit}`}
          className="tabular w-[92px] bg-transparent text-center text-[34px] font-extrabold leading-none outline-none"
          style={{ color: 'var(--text-primary)' }}
        />
        <button
          onClick={() => onChange(clamp(value + step))}
          aria-label={`Increase ${label}`}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[18px] font-bold transition-transform active:scale-90"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', color: 'var(--accent-text)' }}
        >
          +
        </button>
      </div>
      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {unit}
      </span>
    </div>
  );
}

/**
 * Wall-clock stopwatch for the "I'm doing it right now" case (treadmill, erg, bike).
 * Derives elapsed from a start timestamp so backgrounding the tab never loses time.
 */
function useStopwatch(onStop: (seconds: number) => void) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const baseRef = useRef(0);
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const startedAt = startedAtRef.current;
      if (startedAt == null) return;
      setElapsed(baseRef.current + Math.floor((Date.now() - startedAt) / 1000));
    };
    tick();
    const id = setInterval(tick, 500);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [running]);

  const toggle = useCallback(() => {
    if (running) {
      const startedAt = startedAtRef.current;
      const total = baseRef.current + (startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0);
      baseRef.current = total;
      startedAtRef.current = null;
      setElapsed(total);
      setRunning(false);
      onStopRef.current(total);
    } else {
      startedAtRef.current = Date.now();
      setRunning(true);
    }
  }, [running]);

  const reset = useCallback(() => {
    startedAtRef.current = null;
    baseRef.current = 0;
    setElapsed(0);
    setRunning(false);
  }, []);

  return { running, elapsed, toggle, reset };
}

// ─── Steady cardio ────────────────────────────────────────────────────────────

interface CaptureProps {
  block: Block;
  onCapture: (patch: { durationSeconds?: number; distanceKm?: number }) => void;
}

/**
 * Steady cardio: state the target, capture the actuals. Not a set tracker — the whole
 * block completes in one action.
 */
export function CardioCaptureCard({ block, onCapture }: CaptureProps) {
  const set = block.sets[0];
  const Icon = KIND_ICONS[block.activityKind ?? 'other'];
  const distanceKm = set?.distanceKm ?? 0;
  const minutes = Math.round((set?.durationSeconds ?? 0) / 60);

  const stopwatch = useStopwatch((seconds) => onCapture({ durationSeconds: seconds }));

  return (
    <Card padding="18px">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--bg-selected)' }}
          >
            <Icon size={22} color="var(--text-on-mint)" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
              {block.name}
            </div>
            <div className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              {cardioKindLabel(block.activityKind)} · log it when you&rsquo;re done
            </div>
          </div>
        </div>

        <TargetChips block={block} />

        <div className="flex gap-3">
          <CaptureField
            label="Distance"
            unit="km"
            value={distanceKm}
            step={0.5}
            decimals={1}
            onChange={(next) => onCapture({ distanceKm: next })}
          />
          <CaptureField
            label="Time"
            unit="minutes"
            value={minutes}
            step={5}
            onChange={(next) => onCapture({ durationSeconds: next * 60 })}
          />
        </div>

        {/* For treadmill/erg sessions the phone is right there — let them time it here
            rather than doing mental arithmetic afterwards. */}
        <div className="flex items-center gap-2.5">
          <Button
            variant={stopwatch.running ? 'secondary' : 'ghost'}
            size="sm"
            onClick={stopwatch.toggle}
            leftIcon={
              stopwatch.running ? (
                <Square size={13} color="var(--accent-text)" fill="var(--accent-text)" />
              ) : (
                <Play size={13} color="var(--accent-text)" fill="var(--accent-text)" />
              )
            }
          >
            {stopwatch.running ? 'Stop timer' : 'Time it now'}
          </Button>
          {stopwatch.elapsed > 0 ? (
            <>
              <span className="tabular text-[15px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
                {formatClock(stopwatch.elapsed)}
              </span>
              <button
                onClick={stopwatch.reset}
                aria-label="Reset timer"
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
              >
                <RotateCcw size={13} color="var(--text-secondary)" />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

// ─── Class ────────────────────────────────────────────────────────────────────

/** A class is attendance, not performance: one card, one duration, one tap. */
export function ClassCaptureCard({ block, onCapture }: CaptureProps) {
  const set = block.sets[0];
  const minutes = Math.round((set?.durationSeconds ?? 0) / 60);

  return (
    <Card padding="18px">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--bg-selected)' }}
          >
            <Users size={22} color="var(--text-on-mint)" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
              {block.className ?? block.name}
            </div>
            <div className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              Showing up is the whole win.
            </div>
          </div>
        </div>

        {block.targetDurationMinutes ? (
          <div className="flex flex-wrap gap-2">
            <Badge tone="mint">{block.targetDurationMinutes} min</Badge>
          </div>
        ) : null}

        <CaptureField
          label="How long"
          unit="minutes"
          value={minutes}
          step={5}
          onChange={(next) => onCapture({ durationSeconds: next * 60 })}
        />
      </div>
    </Card>
  );
}

// ─── Interval player ──────────────────────────────────────────────────────────

type IntervalStatus = 'idle' | 'running' | 'paused' | 'done';

interface IntervalPlayerProps {
  block: Block;
  /** Rounds already marked complete, so a resumed session picks up where it left off. */
  completed: boolean[];
  onCompleteRound: (roundIndex: number) => void;
  /** Bailing mid-block — the completed rounds stand and the session moves on. */
  onEndEarly: () => void;
  /** Collapse to the plain capture card — for outdoor runs where the phone is pocketed. */
  onLogInstead: () => void;
}

/**
 * Auto-advancing work/recover round player.
 *
 * The phase is carried by **colour and one huge number** rather than text, because it has
 * to be readable at arm's length mid-effort. Rounds advance themselves; the user only
 * intervenes to pause, skip a phase, or bail. Ending early is a first-class action — the
 * completed rounds log as completed sets, which is exactly how the backend reads a
 * partially-finished block.
 */
export function IntervalPlayer({
  block,
  completed,
  onCompleteRound,
  onEndEarly,
  onLogInstead,
}: IntervalPlayerProps) {
  const intervals = block.intervals;
  const rounds = block.sets.length;
  const workSeconds = intervals?.work_seconds ?? 60;
  const recoverSeconds = intervals?.recover_seconds ?? 60;

  // Resume at the first round that has not been completed.
  const firstIncomplete = completed.findIndex((c) => !c);
  const [round, setRound] = useState(firstIncomplete === -1 ? 0 : firstIncomplete);
  // Which phase we are in and whether the clock is moving are independent: pausing must
  // not lose the work/recover identity (it drives the tint, the zone, and the ring).
  const [activePhase, setActivePhase] = useState<'work' | 'recover'>('work');
  const [status, setStatus] = useState<IntervalStatus>('idle');
  const [remaining, setRemaining] = useState(workSeconds);

  const endsAtRef = useRef<number | null>(null);
  const onCompleteRoundRef = useRef(onCompleteRound);
  onCompleteRoundRef.current = onCompleteRound;
  const onEndEarlyRef = useRef(onEndEarly);
  onEndEarlyRef.current = onEndEarly;

  const isWork = activePhase === 'work';
  const phaseSeconds = isWork ? workSeconds : recoverSeconds;
  const phaseZone = isWork ? intervals?.work_hr_zone : intervals?.recover_hr_zone;

  const startPhase = useCallback((next: 'work' | 'recover', seconds: number) => {
    endsAtRef.current = Date.now() + seconds * 1000;
    setRemaining(seconds);
    setActivePhase(next);
    setStatus('running');
  }, []);

  /**
   * Moves off the current phase. `credit` is false when the user skipped out of a work
   * phase early — the round then logs as incomplete, which is the truthful record and
   * exactly how the backend reads a partially-finished block.
   */
  const advancePhase = useCallback(
    (credit: boolean) => {
      if (activePhase === 'work') {
        if (credit) onCompleteRoundRef.current(round);
        if (round + 1 >= rounds) {
          endsAtRef.current = null;
          setStatus('done');
          return;
        }
        startPhase('recover', recoverSeconds);
        return;
      }
      setRound((r) => r + 1);
      startPhase('work', workSeconds);
    },
    [activePhase, round, rounds, recoverSeconds, workSeconds, startPhase],
  );

  const advanceRef = useRef(advancePhase);
  advanceRef.current = advancePhase;

  // Wall-clock deadline, not an accumulating counter — tab throttling must not stretch
  // a 60-second work interval.
  useEffect(() => {
    if (status !== 'running') return;
    const evaluate = () => {
      const endsAt = endsAtRef.current;
      if (endsAt == null) return;
      const next = Math.max(0, (endsAt - Date.now()) / 1000);
      setRemaining(next);
      if (next <= 0) {
        endsAtRef.current = null;
        // Ran the full phase — the round is earned.
        advanceRef.current(true);
      }
    };
    const id = setInterval(evaluate, 120);
    const onVisible = () => {
      if (document.visibilityState === 'visible') evaluate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status]);

  const start = useCallback(() => startPhase('work', workSeconds), [startPhase, workSeconds]);

  const pause = useCallback(() => {
    const endsAt = endsAtRef.current;
    if (endsAt != null) setRemaining(Math.max(0, (endsAt - Date.now()) / 1000));
    endsAtRef.current = null;
    setStatus('paused');
  }, []);

  const resume = useCallback(() => {
    // Resuming keeps whatever is left on the clock, in the same phase.
    endsAtRef.current = Date.now() + remaining * 1000;
    setStatus('running');
  }, [remaining]);

  const endEarly = useCallback(() => {
    endsAtRef.current = null;
    setStatus('done');
    onEndEarlyRef.current();
  }, []);

  const running = status === 'running';
  const progress = phaseSeconds > 0 ? Math.min(1, Math.max(0, (phaseSeconds - remaining) / phaseSeconds)) : 0;
  const tint = isWork ? 'var(--effort-work)' : 'var(--effort-recover)';
  const tintBg = isWork ? 'var(--effort-work-bg)' : 'var(--effort-recover-bg)';
  const totalRemaining =
    (rounds - round) * workSeconds + Math.max(0, rounds - round - 1) * recoverSeconds;

  if (status === 'done') {
    return (
      <Card padding="18px">
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'var(--accent)' }}>
            <Check size={26} color="#06224D" strokeWidth={3} />
          </div>
          <div className="text-[17px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
            {completed.filter(Boolean).length} of {rounds} rounds
          </div>
          <p className="text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Intervals are hard. Every round you banked counts.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Card padding="0" style={{ background: running ? tintBg : 'var(--bg-surface)', overflow: 'hidden' }}>
        <div className="flex flex-col items-center gap-4 px-5 py-6 transition-colors">
          <div className="flex w-full items-center justify-between">
            <Eyebrow>
              Round {Math.min(round + 1, rounds)} of {rounds}
            </Eyebrow>
            <span className="tabular text-[12px] font-semibold" style={{ color: 'var(--text-muted)' }}>
              ~{formatClock(totalRemaining)} left
            </span>
          </div>

          <button
            onClick={running ? pause : status === 'paused' ? resume : start}
            aria-label={running ? 'Pause intervals' : 'Start intervals'}
            className="relative flex items-center justify-center transition-transform active:scale-95"
            style={{ width: 200, height: 200 }}
          >
            <svg width={200} height={200} className="absolute">
              <circle cx={100} cy={100} r={94} stroke="var(--border-base)" strokeWidth={12} fill="none" />
              {running ? (
                <circle
                  cx={100}
                  cy={100}
                  r={94}
                  stroke={tint}
                  strokeWidth={12}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 94}
                  strokeDashoffset={2 * Math.PI * 94 * (1 - progress)}
                  transform="rotate(-90 100 100)"
                />
              ) : null}
            </svg>

            {status === 'idle' ? (
              <div className="flex flex-col items-center gap-1.5">
                <Play size={42} color="var(--accent)" fill="var(--accent)" />
                <span className="text-[13px] font-extrabold tracking-[0.12em]" style={{ color: 'var(--accent-text)' }}>
                  START
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <span
                  className="tabular text-[52px] font-extrabold leading-none"
                  style={{ color: running ? tint : 'var(--text-muted)' }}
                >
                  {formatClock(Math.ceil(Math.max(0, remaining)))}
                </span>
                <span
                  className="mt-1 text-[15px] font-extrabold uppercase tracking-[0.14em]"
                  style={{ color: running ? tint : 'var(--text-muted)' }}
                >
                  {status === 'paused' ? 'PAUSED' : isWork ? 'WORK' : 'RECOVER'}
                </span>
                {running && phaseZone ? (
                  <span className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    {hrZoneText(phaseZone)}
                  </span>
                ) : null}
              </div>
            )}
          </button>

          {/* Round pips */}
          <div className="flex flex-wrap justify-center gap-1.5">
            {Array.from({ length: rounds }).map((_, i) => (
              <span
                key={i}
                className="h-2 rounded-full transition-all"
                style={{
                  width: i === round ? 22 : 8,
                  background: completed[i] ? 'var(--accent)' : i === round ? tint : 'var(--border-base)',
                }}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={running ? pause : status === 'paused' ? resume : start}
              disabled={status === 'idle'}
              leftIcon={
                running ? (
                  <Pause size={13} color="var(--accent-text)" fill="var(--accent-text)" />
                ) : (
                  <Play size={13} color="var(--accent-text)" fill="var(--accent-text)" />
                )
              }
            >
              {running ? 'Pause' : 'Resume'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => advancePhase(false)}
              disabled={!running}
              leftIcon={<SkipForward size={13} color="var(--accent-text)" />}
            >
              Skip
            </Button>
            <Button variant="ghost" size="sm" onClick={endEarly}>
              End early
            </Button>
          </div>
        </div>
      </Card>

      {/* Outdoors the phone is in a pocket and the live player is useless — always leave
          a way back to plain reporting. */}
      <button
        onClick={onLogInstead}
        className="self-center text-[12.5px] font-bold"
        style={{ color: 'var(--accent-text)' }}
      >
        I&rsquo;ll just log it afterwards →
      </button>
    </div>
  );
}
