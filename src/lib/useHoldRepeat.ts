import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

/** How long a press must last before it starts repeating, and the repeat cadence. */
const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 90;
/** After this many repeats the cadence doubles, so long runs (20 → 60 kg) stay quick. */
const ACCELERATE_AFTER = 10;
/**
 * After this many repeats a stepper that opted into a `bigStep` starts moving in it
 * (5 kg at a time, ~1.4 s into the hold) — single units alone make 20 → 100 kg a long wait.
 */
const BIG_STEP_AFTER = 12;
const BIG_STEP_INTERVAL_MS = 100;

interface HoldRepeatOptions {
  /** Step size once a hold has run long. Omit to keep single units for the whole hold. */
  bigStep?: number;
}

/**
 * Press-and-hold auto-repeat for ± stepper buttons.
 *
 * Steppers move in single units (1 kg, 1 min, 1 s) so any value is reachable exactly,
 * which would make big changes a lot of tapping. A tap still steps once (through the
 * ordinary click, so a scroll that happens to start on the button changes nothing);
 * holding keeps stepping, and with `bigStep` switches to that size after a while.
 * Spread the returned handlers onto the `<button>`.
 *
 * `onStep` receives the step size for this tick (1, or `bigStep`) and is read through a
 * ref, so each repeat sees the value from the latest render rather than the one captured
 * when the press began. Pair it with `stepValue` to snap big steps to round numbers.
 */
export function useHoldRepeat(onStep: (scale: number) => void, options: HoldRepeatOptions = {}) {
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const bigStepRef = useRef(options.bigStep);
  bigStepRef.current = options.bigStep;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The hold already stepped, so the click that ends it must not step again. */
  const repeatedRef = useRef(false);

  const stop = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  }, []);

  useEffect(() => stop, [stop]);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      stop();
      repeatedRef.current = false;
      let count = 0;
      const tick = () => {
        repeatedRef.current = true;
        count += 1;
        const bigStep = bigStepRef.current;
        const big = bigStep != null && bigStep > 1 && count > BIG_STEP_AFTER;
        stepRef.current(big ? bigStep : 1);
        timerRef.current = setTimeout(
          tick,
          big ? BIG_STEP_INTERVAL_MS : count > ACCELERATE_AFTER ? REPEAT_INTERVAL_MS / 2 : REPEAT_INTERVAL_MS,
        );
      };
      timerRef.current = setTimeout(tick, REPEAT_DELAY_MS);
      // Listen on the window: a button that turns disabled at its floor mid-hold stops
      // receiving pointer events, and the release must still end the repeat.
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    },
    [stop],
  );

  const onClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    // `detail === 0` is keyboard activation (Enter/Space) — never the tail of a hold.
    if (repeatedRef.current && e.detail !== 0) {
      repeatedRef.current = false;
      return;
    }
    stepRef.current(1);
  }, []);

  return {
    onPointerDown,
    onPointerLeave: stop,
    onClick,
    // Long-pressing on touch would otherwise open the context menu / text selection.
    onContextMenu: (e: MouseEvent<HTMLButtonElement>) => e.preventDefault(),
  };
}

/**
 * One stepper move from `current`. A single-unit step keeps the fraction (12.5 + 1 →
 * 13.5), so a typed half-weight survives tapping. A bigger `scale` from a long hold snaps
 * to its multiples in the direction of travel (12.5 → 15 → 20), landing on round numbers.
 */
export function stepValue(current: number, direction: 1 | -1, scale = 1, min = 0): number {
  const next =
    scale <= 1
      ? Math.round((current + direction) * 10) / 10
      : direction > 0
        ? Math.floor(current / scale + 1e-9) * scale + scale
        : Math.ceil(current / scale - 1e-9) * scale - scale;
  return Math.max(min, next);
}
