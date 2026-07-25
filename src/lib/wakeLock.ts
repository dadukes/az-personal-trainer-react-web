import { useEffect } from 'react';

/**
 * Holds a screen wake lock while `active` — the browser's answer to the mobile app's
 * `expo-keep-awake`, so a running countdown isn't cut short by the device dimming or
 * locking mid-hold.
 *
 * Everything here is best-effort. The Screen Wake Lock API ships in Chromium and
 * Safari 16.4+ but not Firefox, it is only granted to a visible, secure-context page,
 * and the browser drops the lock whenever the tab is hidden — hence the re-request on
 * re-show. Losing it costs the user a screen tap and nothing more: every timer in the
 * session is driven off a wall-clock deadline, so it stays accurate regardless.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.wakeLock) return;

    const api = navigator.wakeLock;
    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;

    const request = async () => {
      if (cancelled || sentinel || document.visibilityState !== 'visible') return;
      try {
        const next = await api.request('screen');
        if (cancelled) {
          void next.release().catch(() => undefined);
          return;
        }
        sentinel = next;
        // The browser releases the lock on its own when the tab is hidden; clearing
        // the ref is what lets `onVisible` re-acquire it.
        next.addEventListener('release', () => {
          if (sentinel === next) sentinel = null;
        });
      } catch {
        // Denied (unsupported, battery saver, no user activation) — nothing to do.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    };
  }, [active]);
}
