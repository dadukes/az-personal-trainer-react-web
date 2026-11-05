/**
 * Feature flags. A flag is off unless `VITE_FLAG_<NAME>` is "1" or "true". This browser can
 * also override it, for trying a flag on the deployed site without a new build:
 * `localStorage.setItem('forma:flag:designSystem', '1')`.
 */
export type FeatureFlag = 'designSystem';

const FLAG_VALUES: Record<FeatureFlag, string | undefined> = {
  designSystem: import.meta.env.VITE_FLAG_DESIGN_SYSTEM as string | undefined,
};

export function parseFlagValue(value: string | null | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  try {
    const override = localStorage.getItem(`forma:flag:${flag}`);
    if (override != null) return parseFlagValue(override);
  } catch {
    // Storage unavailable: the build's value stands.
  }
  return parseFlagValue(FLAG_VALUES[flag]);
}
