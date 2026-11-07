import { describe, expect, it } from 'vitest';

import { burnHint, burnedSoFar, eatenShare, mealsOn, mealTotals, restingKcal } from '@/lib/fuel';

const meal = (logged_at: string, kcal: number | null, protein: number | null = null) => ({
  logged_at,
  estimated_calories: kcal,
  protein_g: protein,
  carbs_g: null,
  fat_g: null,
});

describe('meals', () => {
  it("keeps today's meals and sums what they have", () => {
    const now = new Date(2026, 10, 5, 13, 0);
    const today = `2026-11-05`;
    const meals = [
      meal(new Date(2026, 10, 5, 8, 0).toISOString(), 480, 30),
      meal(new Date(2026, 10, 5, 12, 30).toISOString(), 640, null),
      meal(new Date(2026, 10, 4, 19, 0).toISOString(), 900, 50),
    ];
    const todays = mealsOn(meals, today);
    expect(todays).toHaveLength(2);
    expect(mealTotals(todays)).toEqual({ meals: 2, kcal: 1120, protein: 30, carbs: null, fat: null });
    expect(now.getDate()).toBe(5);
  });

  it('has no totals without meals', () => {
    expect(mealTotals([])).toEqual({ meals: 0, kcal: null, protein: null, carbs: null, fat: null });
  });
});

describe('restingKcal', () => {
  const base = { weightKg: 80, heightCm: 180, birthYear: 1986, year: 2026 };

  it('uses Mifflin-St Jeor', () => {
    expect(restingKcal({ ...base, sex: 'male' })).toBe(1730); // 800 + 1125 − 200 + 5
    expect(restingKcal({ ...base, sex: 'female' })).toBe(1564);
  });

  it("won't guess with anything missing", () => {
    expect(restingKcal({ ...base, sex: null })).toBeNull();
    expect(restingKcal({ ...base, weightKg: null, sex: 'male' })).toBeNull();
    expect(restingKcal({ ...base, birthYear: null, sex: 'male' })).toBeNull();
  });
});

describe('burnedSoFar', () => {
  it('counts the part of the day gone plus active calories', () => {
    expect(burnedSoFar(1800, 400, new Date(2026, 10, 5, 12, 0))).toBe(1300);
    expect(burnedSoFar(1800, null, new Date(2026, 10, 5, 6, 0))).toBe(450);
    expect(burnedSoFar(null, 400, new Date())).toBeNull();
  });
});

describe('eatenShare', () => {
  it('stays between 0 and 100', () => {
    expect(eatenShare(1640, 2310)).toBe(71);
    expect(eatenShare(3000, 2000)).toBe(100);
    expect(eatenShare(null, 2000)).toBe(0);
  });
});

describe('burnHint', () => {
  const all = { weightKg: 80, heightCm: 180, birthYear: 1985, sex: 'male' as const };
  it('names only what is missing', () => {
    expect(burnHint({ ...all, heightCm: null, birthYear: null, sex: null })).toBe(
      "Add your height, birth year and sex in Profile to see what you've burned.",
    );
    expect(burnHint({ ...all, weightKg: null })).toBe("Add a weigh-in to see what you've burned.");
    expect(burnHint({ ...all, sex: null, weightKg: null })).toBe("Add your sex in Profile, and a weigh-in to see what you've burned.");
    expect(burnHint(all)).toBeNull();
  });
});
