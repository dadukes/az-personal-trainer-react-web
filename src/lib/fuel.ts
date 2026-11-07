/**
 * Pure logic for the Fuel tab: what today's meals add up to, and an honest estimate of
 * what was burned. No React Native imports, so it is tested in plain Node. Kept identical
 * to the mobile app's `lib/fuel.ts`.
 */

export interface MealLike {
  logged_at: string;
  estimated_calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

export interface MealTotals {
  meals: number;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

/** Local `YYYY-MM-DD` of a timestamp. */
export function localDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Meals logged on `todayISO` (the device's local day). */
export function mealsOn<T extends Pick<MealLike, 'logged_at'>>(meals: readonly T[], todayISO: string): T[] {
  return meals.filter((m) => localDate(m.logged_at) === todayISO);
}

/** Sums each value over the meals that have it; a value no meal has stays null, never 0. */
export function mealTotals(meals: readonly MealLike[]): MealTotals {
  const sum = (key: 'estimated_calories' | 'protein_g' | 'carbs_g' | 'fat_g'): number | null => {
    const values = meals.map((m) => m[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return values.length ? Math.round(values.reduce((a, b) => a + b, 0)) : null;
  };
  return { meals: meals.length, kcal: sum('estimated_calories'), protein: sum('protein_g'), carbs: sum('carbs_g'), fat: sum('fat_g') };
}

/**
 * Resting burn for a whole day (Mifflin-St Jeor). Null unless weight, height, birth year
 * and sex are all known: a guess would look like a measurement.
 */
export function restingKcal(p: {
  weightKg: number | null | undefined;
  heightCm: number | null | undefined;
  birthYear: number | null | undefined;
  sex: 'male' | 'female' | null | undefined;
  year: number;
}): number | null {
  const { weightKg, heightCm, birthYear, sex, year } = p;
  if (!weightKg || !heightCm || !birthYear || !sex) return null;
  const age = year - birthYear;
  if (age < 13 || age > 110) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + (sex === 'male' ? 5 : -161));
}

/**
 * What's missing for the resting estimate, named, so a weigh-in already made isn't asked for
 * again. Null when nothing is missing.
 */
export function burnHint(p: {
  weightKg: number | null | undefined;
  heightCm: number | null | undefined;
  birthYear: number | null | undefined;
  sex: 'male' | 'female' | null | undefined;
}): string | null {
  const profile = [!p.heightCm && 'height', !p.birthYear && 'birth year', !p.sex && 'sex'].filter(
    (x): x is string => Boolean(x),
  );
  const parts: string[] = [];
  if (profile.length) {
    const list = profile.length === 1 ? profile[0] : `${profile.slice(0, -1).join(', ')} and ${profile[profile.length - 1]}`;
    parts.push(`your ${list} in Profile`);
  }
  if (!p.weightKg) parts.push('a weigh-in');
  if (!parts.length) return null;
  return `Add ${parts.join(', and ')} to see what you've burned.`;
}

/**
 * Burned so far today: the resting burn for the part of the day that's gone, plus active
 * calories. Null without a resting estimate.
 */
export function burnedSoFar(resting: number | null, activeKcal: number | null | undefined, now: Date): number | null {
  if (resting == null) return null;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return Math.round((resting * minutes) / (24 * 60) + (activeKcal ?? 0));
}

/** The bar under Eaten and Burned: eaten as a share of burned, 0–100. */
export function eatenShare(eaten: number | null, burned: number | null): number {
  if (!eaten || !burned) return 0;
  return Math.max(0, Math.min(100, Math.round((eaten / burned) * 100)));
}
