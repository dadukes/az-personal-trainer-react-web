import { patchProfile, type UserProfileData } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';

/** The browser's IANA zone ("Europe/Berlin"), or null when it can't tell. */
export function deviceTimezone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone.length > 0 ? zone : null;
  } catch {
    return null;
  }
}

let inFlight: Promise<UserProfileData | null> | null = null;

/**
 * Keeps the profile's timezone on the browser's, so the server's local days (streak, the
 * week, chat sessions, matching watch sessions to plan days) follow the user when they
 * travel. Called after the profile loads and when the tab becomes visible again. Sends only
 * when the zone changed; never throws. Resolves to the saved profile, else null. Mobile
 * twin: `lib/timezone.ts`.
 */
export function syncDeviceTimezone(accessToken: string): Promise<UserProfileData | null> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const zone = deviceTimezone();
    if (!zone || zone === useAppStore.getState().profile.timezone) return null;
    try {
      const { profile } = await patchProfile(accessToken, { timezone: zone });
      return profile;
    } catch {
      return null;
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
