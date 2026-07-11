/**
 * Health adapter (web).
 *
 * The mobile app reads Android Health Connect / Apple Health via a native
 * module. The browser has no equivalent, so on web this module always returns
 * realistic mock data — mirroring the mobile app's Expo-Go fallback path so the
 * Home health snapshot and Fuel calorie estimates still render.
 *
 * The user can also **manually capture** today's metrics from Home
 * (`POST /health/sync`). The latest capture is persisted per-user in
 * `localStorage` so reopening the dialog the same day prefills the previous
 * entry for editing (the backend has no read endpoint for health logs — see
 * backend-gaps.md #7). A same-day manual capture takes precedence over mock.
 *
 * If a wearable/web health integration is added later, implement it here and
 * make `isNativeHealthAvailable()` report accurately.
 */

import type { HealthLog } from '@/lib/api';

export interface HealthData {
  sleep_hours: number | null;
  resting_heart_rate: number | null;
  step_count: number | null;
  active_calories_burned: number | null;
}

/** A user-entered health log for a single day (mirrors `HealthSyncPayload` fields). */
export interface ManualHealthCapture {
  /** Local `YYYY-MM-DD` the values belong to. */
  logged_date: string;
  sleep_hours?: number;
  sleep_quality?: number;
  energy_level?: number;
  resting_heart_rate?: number;
  step_count?: number;
  active_calories_burned?: number;
  notes?: string;
  /** ISO timestamp of the latest edit (captures can be updated through the day). */
  captured_at: string;
}

/**
 * Converts a server health log (`GET /health/logs`) into the local capture
 * shape used by the Home snapshot and the capture dialog. `null` DB columns
 * become `undefined` (a not-captured field), and the row's `updated_at` is the
 * capture time.
 */
export function manualCaptureFromLog(log: HealthLog): ManualHealthCapture {
  return {
    logged_date: log.logged_date,
    sleep_hours: log.sleep_hours ?? undefined,
    sleep_quality: log.sleep_quality ?? undefined,
    energy_level: log.energy_level ?? undefined,
    resting_heart_rate: log.resting_heart_rate ?? undefined,
    step_count: log.step_count ?? undefined,
    active_calories_burned: log.active_calories_burned ?? undefined,
    notes: log.notes ?? undefined,
    captured_at: log.updated_at,
  };
}

const MANUAL_CAPTURE_KEY_PREFIX = 'forma:manual-health:';

/**
 * Loads the stored manual capture for a user, but only if it belongs to
 * `dateISO` (stale captures from previous days are ignored — sleep/steps are
 * per-day values, so each day starts fresh).
 */
export function loadManualCapture(userId: string, dateISO: string): ManualHealthCapture | null {
  try {
    const raw = localStorage.getItem(`${MANUAL_CAPTURE_KEY_PREFIX}${userId}`);
    if (!raw) return null;
    const capture = JSON.parse(raw) as ManualHealthCapture;
    return capture.logged_date === dateISO ? capture : null;
  } catch {
    return null;
  }
}

/** Persists the latest manual capture for a user (one capture kept — the current day's). */
export function saveManualCapture(userId: string, capture: ManualHealthCapture): void {
  try {
    localStorage.setItem(`${MANUAL_CAPTURE_KEY_PREFIX}${userId}`, JSON.stringify(capture));
  } catch {
    // ignore quota/serialization errors — the backend copy is the durable one
  }
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
