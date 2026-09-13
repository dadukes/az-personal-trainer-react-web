import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

/** How long a press must last before it starts repeating, and the repeat cadence. */
const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 90;
/** After this many repeats the cadence doubles, so long runs (20 → 60 kg) stay quick. */
const ACCELERATE_AFTER = 10;

/**
 * Press-and-hold auto-repeat for ± stepper buttons.
 *
 * Steppers move in single units (1 kg, 1 min, 1 s) so any value is reachable exactly,
 * which would make big changes a lot of tapping. A tap still steps once (through the
 * ordinary click, so a scroll that happens to start on the button changes nothing);
 * holding keeps stepping. Spread the returned handlers onto the `<button>`.
 *
 * `onStep` is read through a ref, so each repeat sees the value from the latest render
 * rather than the one captured when the press began.
 */
export function useHoldRepeat(onStep: () => void) {
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
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
        stepRef.current();
        count += 1;
        timerRef.current = setTimeout(tick, count > ACCELERATE_AFTER ? REPEAT_INTERVAL_MS / 2 : REPEAT_INTERVAL_MS);
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
    stepRef.current();
  }, []);

  return {
    onPointerDown,
    onPointerLeave: stop,
    onClick,
    // Long-pressing on touch would otherwise open the context menu / text selection.
    onContextMenu: (e: MouseEvent<HTMLButtonElement>) => e.preventDefault(),
  };
}
