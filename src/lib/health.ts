/**
 * Health adapter (web).
 *
 * The mobile app reads Android Health Connect / Apple Health via a native
 * module. The browser has no equivalent, so on web this module always returns
 * realistic mock data — mirroring the mobile app's Expo-Go fallback path so the
 * Home health snapshot and Fuel calorie estimates still render.
 *
 * If a wearable/web health integration is added later, implement it here and
 * make `isNativeHealthAvailable()` report accurately.
 */

export interface HealthData {
  sleep_hours: number | null;
  resting_heart_rate: number | null;
  step_count: number | null;
  active_calories_burned: number | null;
}

export type HealthPermissionStatus = 'granted' | 'denied' | 'unavailable';

// Non-cryptographic random used only to generate mock display values.
function randomBetween(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function buildMockData(): HealthData {
  return {
    sleep_hours: randomBetween(5.0, 8.5),
    resting_heart_rate: Math.round(randomBetween(58, 78)),
    step_count: Math.round(randomBetween(2500, 12000)),
    active_calories_burned: Math.round(randomBetween(150, 600)),
  };
}

/** Reads today's health metrics. On web this is always mock data. */
export async function readTodayHealthData(): Promise<HealthData> {
  return buildMockData();
}

/** No native health provider exists in the browser. */
export function isNativeHealthAvailable(): boolean {
  return false;
}

/** Kept for API parity with the mobile app; a no-op on web. */
export async function requestHealthPermissions(): Promise<HealthPermissionStatus> {
  return 'unavailable';
}
