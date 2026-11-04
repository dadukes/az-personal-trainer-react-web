import { describe, expect, it } from 'vitest';

import type { DashboardDayPlan, PlanSuggestion } from '@/lib/api';
import {
  historyLine,
  markReplaced,
  replacedText,
  savedView,
  singleExerciseSwap,
  suggestionCardView,
  suggestionChips,
  weekTotalText,
} from '@/lib/planSuggestion';

const base = {
  id: 's1',
  user_id: 'u',
  session_id: 'c',
  message_id: 'm',
  base_plan_id: 'p',
  status: 'pending' as const,
  accepted_plan_id: null,
  accepted_at: null,
  created_at: '2026-11-04T10:00:00Z',
  updated_at: '2026-11-04T10:00:00Z',
};

const upperA: DashboardDayPlan = {
  is_rest_day: false,
  focus: 'Upper Body A',
  estimated_duration_minutes: 40,
  warmup: [{ name: 'Arm Circles', type: 'mobility', duration_seconds: 30 }],
  exercises: [
    { name: 'Bench Press', type: 'reps', sets: 4, reps: '8' },
    { name: 'Seated Row', type: 'reps', sets: 3, reps: '8-10' },
  ],
};
const lowerA: DashboardDayPlan = {
  is_rest_day: false,
  focus: 'Lower Body A',
  estimated_duration_minutes: 45,
  exercises: [{ name: 'Leg Press', type: 'reps', sets: 3, reps: '10' }],
};
const rest: DashboardDayPlan = { is_rest_day: true };

const week = (plan: Record<string, DashboardDayPlan>): PlanSuggestion => ({
  ...base,
  kind: 'week',
  payload: { week_start: '2026-11-02', ai_notes: null, plan },
});
const days = (
  changes: Record<string, DashboardDayPlan | null>,
  previous: Record<string, DashboardDayPlan | null>,
): PlanSuggestion => ({ ...base, kind: 'days', payload: { changes, previous } });

describe('suggestionCardView', () => {
  it('shows a week as seven rows with totals', () => {
    const view = suggestionCardView(week({ monday: upperA, tuesday: lowerA, wednesday: rest }));
    expect(view.layout).toBe('week');
    if (view.layout !== 'week') return;
    expect(view.title).toBe('Your week');
    expect(view.meta).toBe('2 workouts · 1h 25 a week');
    expect(view.rows.map((r) => [r.short, r.workout, r.time])).toEqual([
      ['Mon', 'Upper Body A', '40 min'],
      ['Tue', 'Lower Body A', '45 min'],
      ['Wed', 'Rest', ''],
      ['Thu', 'Rest', ''],
      ['Fri', 'Rest', ''],
      ['Sat', 'Rest', ''],
      ['Sun', 'Rest', ''],
    ]);
    // Main exercises only, ranges with an en dash.
    expect(view.rows[0].exercises).toEqual([
      { name: 'Bench Press', target: '4 × 8' },
      { name: 'Seated Row', target: '3 × 8–10' },
    ]);
    expect(view.acceptLabel).toBe('Accept this plan');
  });

  it('shows one changed day with its time change and what was taken out', () => {
    const shorter: DashboardDayPlan = {
      ...upperA,
      estimated_duration_minutes: 30,
      exercises: [{ name: 'Bench Press', type: 'reps', sets: 3, reps: '8' }],
    };
    const view = suggestionCardView(days({ thursday: shorter }, { thursday: upperA }));
    expect(view).toEqual({
      layout: 'day',
      day: 'thursday',
      title: 'Thursday: Upper Body A',
      meta: '30 min, down from 40',
      exercises: [{ name: 'Bench Press', target: '3 × 8' }],
      removedNote: 'Taken out: Seated Row.',
      acceptLabel: 'Accept Thursday',
    });
  });

  it('shows a new day on an empty slot with its length', () => {
    const view = suggestionCardView(days({ friday: lowerA }, { friday: null }));
    expect(view.layout === 'day' && view.meta).toBe('45 min · 1 exercise');
  });

  it('shows a single exercise change as a swap', () => {
    const swapped: DashboardDayPlan = {
      ...upperA,
      exercises: [
        { name: 'Landmine Press', type: 'reps', sets: 4, reps: '8' },
        { name: 'Seated Row', type: 'reps', sets: 3, reps: '8-10' },
      ],
    };
    const suggestion = days({ thursday: swapped }, { thursday: upperA });
    expect(suggestionCardView(suggestion)).toEqual({
      layout: 'swap',
      day: 'thursday',
      title: 'Upper Body A, Thursday',
      before: 'Bench Press · 4 × 8',
      after: 'Landmine Press · 4 × 8',
      acceptLabel: 'Use this swap',
    });
    expect(savedView(suggestion)).toEqual({
      title: 'Plan updated',
      body: 'Thursday now has Landmine Press.',
      planDay: 'thursday',
    });
  });

  it('removing a day says what it was', () => {
    const view = suggestionCardView(days({ wednesday: null }, { wednesday: lowerA }));
    expect(view).toEqual(
      expect.objectContaining({ layout: 'day', title: 'Wednesday: no workout', meta: 'Was Lower Body A' }),
    );
  });

  it('shows several changed days as rows', () => {
    const view = suggestionCardView(days({ monday: lowerA, wednesday: upperA }, { monday: upperA, wednesday: lowerA }));
    expect(view.layout).toBe('week');
    if (view.layout !== 'week') return;
    expect(view.title).toBe('Changes to your week');
    expect(view.meta).toBe('Monday and Wednesday');
    expect(view.rows.map((r) => r.workout)).toEqual(['Lower Body A', 'Upper Body A']);
    expect(view.acceptLabel).toBe('Accept changes');
  });

  it('marks a removed day in a multi-day change', () => {
    const view = suggestionCardView(days({ monday: null, tuesday: upperA }, { monday: upperA, tuesday: null }));
    expect(view.layout === 'week' && view.rows.map((r) => r.workout)).toEqual(['Removed', 'Upper Body A']);
  });
});

describe('singleExerciseSwap', () => {
  it('needs the same focus and exactly one different exercise', () => {
    const two: DashboardDayPlan = {
      ...upperA,
      exercises: [
        { name: 'A', type: 'reps', sets: 3, reps: '8' },
        { name: 'B', type: 'reps', sets: 3, reps: '8' },
      ],
    };
    expect(singleExerciseSwap(upperA, two)).toBeNull();
    expect(singleExerciseSwap(upperA, { ...upperA, focus: 'Other' })).toBeNull();
    expect(singleExerciseSwap(upperA, upperA)).toBeNull();
    expect(singleExerciseSwap(null, upperA)).toBeNull();
  });
});

describe('savedView', () => {
  it('names the next workout from today', () => {
    // 2026-11-04 is a Wednesday.
    const wed = new Date(2026, 10, 4);
    expect(savedView(week({ monday: upperA, friday: lowerA }), wed).body).toBe('Your next workout is Friday.');
    expect(savedView(week({ monday: upperA }), wed).body).toBe('Your next workout is Monday.');
    expect(savedView(week({ wednesday: upperA }), wed).body).toBe('Your next workout is today.');
    expect(savedView(week({ monday: rest }), wed).body).toBe('It has no workouts yet.');
  });

  it('names a changed day', () => {
    expect(savedView(days({ friday: lowerA }, { friday: null }))).toEqual({
      title: 'Friday updated',
      body: 'It’s ready for your next workout.',
      planDay: 'friday',
    });
    expect(savedView(days({ monday: null, friday: lowerA }, {})).body).toBe('Monday and Friday changed.');
  });
});

describe('helpers', () => {
  it('formats weekly totals', () => {
    expect(weekTotalText(45)).toBe('45 min');
    expect(weekTotalText(175)).toBe('2h 55');
  });

  it('describes a replaced card', () => {
    expect(replacedText(week({ monday: upperA }))).toBe(
      'Earlier version: 1 workout · 40 min a week. Replaced by your tweak.',
    );
    expect(replacedText(days({ monday: null, friday: lowerA }, {}))).toBe(
      'Earlier version: changes to Monday and Friday. Replaced by your tweak.',
    );
    expect(replacedText(days({ friday: lowerA }, { friday: null }))).toBe(
      'Earlier version: Friday: Lower Body A. Replaced by your tweak.',
    );
  });

  it('offers chips that fit the card', () => {
    expect(suggestionChips(week({ monday: upperA }))[0]).toBe('Fewer days a week');
    expect(suggestionChips(days({ friday: lowerA }, { friday: null }))[0]).toBe('Shorter still');
  });

  it('marks only pending cards as replaced', () => {
    const accepted = { ...week({}), id: 'a', status: 'accepted' as const };
    const messages = [{ suggestion: week({}) }, { suggestion: accepted }, {}];
    const next = markReplaced(messages, ['s1', 'a']);
    expect(next[0].suggestion?.status).toBe('replaced');
    expect(next[1].suggestion?.status).toBe('accepted');
    expect(next[2]).toBe(messages[2]);
  });

  it('summarises a card for a past chat', () => {
    expect(historyLine({ ...week({ monday: upperA }), status: 'accepted' })).toBe('Suggested plan: Your week (accepted)');
    expect(historyLine(days({ monday: null, friday: lowerA }, {}))).toBe(
      'Suggested plan: Changes to Monday and Friday (not accepted)',
    );
  });
});
