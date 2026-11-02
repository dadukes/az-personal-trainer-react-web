/**
 * A timed hold in the logbook: one countdown, or for a per-side hold, side one, a short
 * break to switch, then side two. Pure logic, tested in Vitest. Mirrored in the mobile
 * app's lib/hold-timer.ts.
 *
 * Everything counts from the real clock, so a sleeping phone or a throttled tab
 * loses nothing: the timer stores how long it had run before the current stretch, and
 * when that stretch began.
 */

/** The break between sides. */
export const SWITCH_SECONDS = 5;
/** One press of "+5 s" during the break. */
export const SWITCH_ADD_SECONDS = 5;
/** The last seconds of each part get a beep each. */
const COUNT_SECONDS = 3;
/** A gap longer than this means the app was asleep, so the cues it missed stay quiet. */
const STALE_MS = 1500;

export interface HoldTimer {
  blockKey: string;
  setIndex: number;
  /** For a per-side hold, the time on each side. */
  holdSeconds: number;
  perSide: boolean;
  /** The break between sides. Grows with "+5 s", and shrinks when side two starts early. */
  switchMs: number;
  /** How long it had run before the current stretch. */
  elapsedMs: number;
  /** When the current stretch began. Null while paused. */
  runningSince: number | null;
}

export type HoldPhase = 'hold' | 'switch' | 'done';

export interface HoldPosition {
  phase: HoldPhase;
  /** 1 or 2. Always 1 for a hold that isn't per side. */
  side: 1 | 2;
  /** Left in this part. */
  remainingMs: number;
  /** The length of this part. */
  partMs: number;
  paused: boolean;
}

export type HoldCue = 'count' | 'switch' | 'go' | 'done';

export function startHold(
  input: { blockKey: string; setIndex: number; holdSeconds: number; perSide: boolean },
  nowMs: number,
): HoldTimer {
  return {
    ...input,
    holdSeconds: Math.max(1, Math.round(input.holdSeconds)),
    switchMs: SWITCH_SECONDS * 1000,
    elapsedMs: 0,
    runningSince: nowMs,
  };
}

export function holdElapsed(timer: HoldTimer, nowMs: number): number {
  return timer.elapsedMs + (timer.runningSince == null ? 0 : Math.max(0, nowMs - timer.runningSince));
}

function holdMs(timer: HoldTimer): number {
  return timer.holdSeconds * 1000;
}

export function holdTotalMs(timer: HoldTimer): number {
  return timer.perSide ? holdMs(timer) * 2 + timer.switchMs : holdMs(timer);
}

export function holdPosition(timer: HoldTimer, nowMs: number): HoldPosition {
  return positionAt(timer, holdElapsed(timer, nowMs));
}

function positionAt(timer: HoldTimer, elapsed: number): HoldPosition {
  const hold = holdMs(timer);
  const paused = timer.runningSince == null;
  if (elapsed < hold) {
    return { phase: 'hold', side: 1, remainingMs: hold - elapsed, partMs: hold, paused };
  }
  if (!timer.perSide) {
    return { phase: 'done', side: 1, remainingMs: 0, partMs: hold, paused };
  }
  const switchEnd = hold + timer.switchMs;
  if (elapsed < switchEnd) {
    return { phase: 'switch', side: 2, remainingMs: switchEnd - elapsed, partMs: timer.switchMs, paused };
  }
  const end = switchEnd + hold;
  if (elapsed < end) {
    return { phase: 'hold', side: 2, remainingMs: end - elapsed, partMs: hold, paused };
  }
  return { phase: 'done', side: 2, remainingMs: 0, partMs: hold, paused };
}

/** The whole seconds left in this part, as the clock shows them. */
export function displaySeconds(position: HoldPosition): number {
  return Math.ceil(position.remainingMs / 1000);
}

export function pauseHold(timer: HoldTimer, nowMs: number): HoldTimer {
  if (timer.runningSince == null) {
    return timer;
  }
  return { ...timer, elapsedMs: holdElapsed(timer, nowMs), runningSince: null };
}

export function resumeHold(timer: HoldTimer, nowMs: number): HoldTimer {
  return timer.runningSince == null ? { ...timer, runningSince: nowMs } : timer;
}

/** Back to the start of side one, running, with the break at its usual length. */
export function restartHold(timer: HoldTimer, nowMs: number): HoldTimer {
  return { ...timer, switchMs: SWITCH_SECONDS * 1000, elapsedMs: 0, runningSince: nowMs };
}

/** "+5 s" during the break between sides. */
export function extendSwitch(timer: HoldTimer, nowMs: number): HoldTimer {
  if (holdPosition(timer, nowMs).phase !== 'switch') {
    return timer;
  }
  return { ...timer, switchMs: timer.switchMs + SWITCH_ADD_SECONDS * 1000 };
}

/** Ends the break now, so side two starts on a full clock. */
export function startSideTwo(timer: HoldTimer, nowMs: number): HoldTimer {
  if (holdPosition(timer, nowMs).phase !== 'switch') {
    return timer;
  }
  const switchMs = Math.max(0, holdElapsed(timer, nowMs) - holdMs(timer));
  return { ...timer, switchMs, runningSince: timer.runningSince ?? nowMs };
}

/** When it will finish, by the clock. Null while paused. */
export function holdEndsAt(timer: HoldTimer): number | null {
  return timer.runningSince == null ? null : timer.runningSince + holdTotalMs(timer) - timer.elapsedMs;
}

/**
 * The seconds held on the side being worked, for "Done" before the end. A break counts as
 * side one held in full.
 */
export function heldSeconds(timer: HoldTimer, nowMs: number): number {
  const position = holdPosition(timer, nowMs);
  if (position.phase !== 'hold') {
    return timer.holdSeconds;
  }
  return Math.floor((position.partMs - position.remainingMs) / 1000);
}

/**
 * The sound and buzz to play as the clock moves from `fromMs` to `toMs` of elapsed time.
 * A big change (the end of a side, the break, the finish) wins over a count beep.
 */
export function holdCue(timer: HoldTimer, fromMs: number, toMs: number): HoldCue | null {
  if (toMs <= fromMs) {
    return null;
  }
  const crossed = (at: number) => fromMs < at && toMs >= at;
  const hold = holdMs(timer);
  const total = holdTotalMs(timer);
  if (crossed(total)) {
    return 'done';
  }
  // Coming back from sleep: a missed beep or switch would only be confusing now.
  if (toMs - fromMs > STALE_MS) {
    return null;
  }
  const parts: { start: number; end: number; cue: HoldCue }[] = timer.perSide
    ? [
        { start: 0, end: hold, cue: 'switch' },
        { start: hold, end: hold + timer.switchMs, cue: 'go' },
        { start: hold + timer.switchMs, end: total, cue: 'done' },
      ]
    : [{ start: 0, end: hold, cue: 'done' }];
  for (const part of parts) {
    if (crossed(part.end)) {
      return part.cue;
    }
  }
  for (const part of parts) {
    for (let k = 1; k <= COUNT_SECONDS; k += 1) {
      const at = part.end - k * 1000;
      if (at > part.start && crossed(at)) {
        return 'count';
      }
    }
  }
  return null;
}

/**
 * The beep for a plain countdown that ends at `endsAtMs`, like rest, as the clock moves from
 * `fromMs` to `toMs`: a count for each of the last seconds, then "go". A countdown that ended
 * while the app was asleep stays quiet; its notification has already said so.
 */
export function countdownCue(endsAtMs: number, fromMs: number, toMs: number): HoldCue | null {
  if (toMs <= fromMs || toMs - fromMs > STALE_MS) {
    return null;
  }
  const crossed = (at: number) => fromMs < at && toMs >= at;
  if (crossed(endsAtMs)) {
    return 'go';
  }
  for (let k = 1; k <= COUNT_SECONDS; k += 1) {
    if (crossed(endsAtMs - k * 1000)) {
      return 'count';
    }
  }
  return null;
}
