/**
 * Workout preferences saved to the account. Mirrors the mobile app's `lib/workout-prefs.ts`.
 * The browser never had a rest setting of its own, so there's nothing here to copy across.
 */

/** The account's setting wins. Never chosen means off, the logbook's default. */
export function resolveRestTimer(account: boolean | null | undefined): boolean {
  return account === true;
}

export const DEFAULT_WEIGHT_STEP = 1;
export const WEIGHT_STEP_OPTIONS = [1, 2.5, 5];

export function resolveWeightStep(account: number | null | undefined): number {
  return account != null && account > 0 ? account : DEFAULT_WEIGHT_STEP;
}
