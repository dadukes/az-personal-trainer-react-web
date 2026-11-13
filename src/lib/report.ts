/**
 * Pure logic for the Progress reporting page (`GET /progress/report`, Phase 9): range labels,
 * the KPI lines, chart scales, the consistency grid and the table views. No React, so it is
 * tested in plain Node.
 */

import type { ProgressReport, ReportLift, ReportRange } from '@/lib/api';
import { addDaysISO, mondayOf } from '@/lib/progress';
import { formatNumber, kgToLb, type UnitSystem } from '@/lib/units';

// ─── Ranges ───────────────────────────────────────────────────────────────────

export const REPORT_RANGES: readonly { value: ReportRange; label: string }[] = [
  { value: '4w', label: '4 weeks' },
  { value: '12w', label: '12 weeks' },
  { value: '6m', label: '6 months' },
  { value: '1y', label: '1 year' },
];

export const DEFAULT_REPORT_RANGE: ReportRange = '12w';

export function isReportRange(value: unknown): value is ReportRange {
  return REPORT_RANGES.some((r) => r.value === value);
}

export function rangeLabel(range: ReportRange): string {
  return REPORT_RANGES.find((r) => r.value === range)?.label ?? range;
}

// ─── Dates and durations ──────────────────────────────────────────────────────

function daysBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);
}

/** "2 Nov" (or "2 Nov 2025" when `withYear`), from a local `YYYY-MM-DD`. */
export function dayLabel(dateISO: string, withYear = false): string {
  return new Date(`${dateISO}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

/** "45 min", "2h 05", "0 min". */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}`;
}

/** Weeks the per-week averages are taken over: from `averaged_from` to today, at least one. */
export function averagedWeeks(report: Pick<ProgressReport, 'averaged_from' | 'to'>): number {
  return Math.max(7, daysBetween(report.averaged_from, report.to) + 1) / 7;
}

// ─── KPI lines ────────────────────────────────────────────────────────────────

/** Under Sessions / week: what the average is over. */
export function sessionsSub(report: ProgressReport): string {
  const n = report.summary.sessions;
  const count = `${n} ${n === 1 ? 'session' : 'sessions'}`;
  if (report.averaged_from > report.from) return `${count} since you joined on ${dayLabel(report.averaged_from)}`;
  return `${count} in the last ${rangeLabel(report.range)}`;
}

/** Training time per week, averaged the same way as sessions. */
export function averageWeeklyMinutes(report: ProgressReport): number {
  return report.summary.training_minutes / averagedWeeks(report);
}

/** Minutes a week in zone 2 or above; null without zones. */
export function zone2PlusPerWeek(cardio: ProgressReport['cardio']): number | null {
  const zones = cardio?.zone_minutes_per_week;
  if (!zones) return null;
  return Math.round(zones.slice(1).reduce((s, m) => s + m, 0));
}

// ─── Strength table ───────────────────────────────────────────────────────────

export interface LiftRow {
  name: string;
  first: string;
  latest: string;
  /** "+3.5", "0", "−2" */
  change: string;
  direction: 'up' | 'down' | 'flat';
  measure: ReportLift['measure'];
}

/** A lift's numbers in the user's units: e1RM in kg (1 dp) or lb (whole), reps as they are. */
export function liftRow(lift: ReportLift, units: UnitSystem): LiftRow {
  const imperial = units === 'imperial' && lift.measure === 'e1rm_kg';
  const decimals = lift.measure === 'reps' || imperial ? 0 : 1;
  const conv = (v: number) => (imperial ? kgToLb(v) : v);
  const from = conv(lift.from);
  const to = conv(lift.to);
  const factor = 10 ** decimals;
  const delta = Math.round((to - from) * factor) / factor;
  const show = (v: number) => (decimals === 0 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toFixed(1));
  return {
    name: lift.name,
    first: show(from),
    latest: show(to),
    change: delta === 0 ? '0' : `${delta > 0 ? '+' : '−'}${decimals === 0 ? Math.abs(delta) : Math.abs(delta).toFixed(1)}`,
    // "Up" follows the server's noise threshold, so a 0.4 kg wobble doesn't read as a gain.
    direction: lift.improved ? 'up' : delta < 0 ? 'down' : 'flat',
    measure: lift.measure,
  };
}

/** "4 of 6 lifts up", or how many are tracked when none is up yet. */
export function strengthTitle(s: { exercises_tracked: number; exercises_improved: number }): string {
  if (s.exercises_improved > 0) return `Strength: ${s.exercises_improved} of ${s.exercises_tracked} lifts up`;
  return `Strength: ${s.exercises_tracked} ${s.exercises_tracked === 1 ? 'lift' : 'lifts'} tracked`;
}

// ─── Chart scales ─────────────────────────────────────────────────────────────

export interface Scale {
  min: number;
  max: number;
  ticks: number[];
}

function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const unit = rough / pow;
  // 1, 2, 5 only: a 2.5 step gives ticks like 80.75 that can't be written to one decimal.
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return nice * pow;
}

/**
 * Clean ticks around `[lo, hi]`, about `count` of them. With `fromZero` the scale starts at 0
 * (bars grow from one baseline). A flat series gets room above and below.
 */
export function niceScale(lo: number, hi: number, count = 3, fromZero = false): Scale {
  let a = fromZero ? 0 : lo;
  let b = hi;
  if (b <= a) {
    const pad = fromZero ? 1 : Math.max(Math.abs(a) * 0.02, 0.5);
    b = a + pad;
    if (!fromZero) a -= pad;
  }
  const step = niceStep((b - a) / Math.max(1, count - 1));
  const min = fromZero ? 0 : Math.floor(a / step) * step;
  const max = Math.ceil(b / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { min, max, ticks };
}

/** A tick in full, with no trailing ".0": 0, 60, 79.5. */
export function tickLabel(value: number): string {
  return formatNumber(value, 1);
}

/** Minutes on the training axis: "0", "1h", "1h 30". */
export function minutesTick(minutes: number): string {
  if (minutes === 0) return '0';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}`;
}

/**
 * Axis labels at the first date of each month in `dates` (oldest first). The first date always
 * gets one; a month starting within `minGap` positions of the previous label is skipped.
 */
export function monthTicks(dates: readonly string[], minGap = 2): { index: number; label: string }[] {
  const out: { index: number; label: string }[] = [];
  const month = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { month: 'short' });
  dates.forEach((d, i) => {
    if (i > 0 && d.slice(0, 7) === dates[i - 1].slice(0, 7)) return;
    const last = out[out.length - 1];
    if (last && i - last.index < minGap) return;
    out.push({ index: i, label: month(d) });
  });
  return out;
}

// ─── Weight ───────────────────────────────────────────────────────────────────

/** Daily means in the user's units, oldest first. */
export function weightSeries(points: readonly { date: string; kg: number }[], units: UnitSystem): { date: string; value: number }[] {
  return points.map((p) => ({ date: p.date, value: units === 'imperial' ? kgToLb(p.kg) : p.kg }));
}

/** "−0.2 kg / week over 12 weeks", or what the trend still needs. */
export function weightSub(weight: NonNullable<ProgressReport['weight']>, units: UnitSystem): string {
  const unit = units === 'imperial' ? 'lb' : 'kg';
  if (weight.trend_kg_per_week == null) return 'A few more weigh-ins and the trend shows here';
  const perWeek = units === 'imperial' ? kgToLb(weight.trend_kg_per_week) : weight.trend_kg_per_week;
  const rounded = Math.round(perWeek * 10) / 10;
  const signed = rounded === 0 ? '±0' : `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)}`;
  return `${signed} ${unit} / week over ${weight.span_days} days`;
}

// ─── Consistency grid ─────────────────────────────────────────────────────────

export type ReportMark = 'workout' | 'other' | 'none' | 'future';

export interface ReportCell {
  date: string;
  mark: ReportMark;
  today: boolean;
}

/** One column per week (oldest first), Monday to Sunday in each. */
export function reportGrid(report: Pick<ProgressReport, 'from' | 'to' | 'weeks_in_range' | 'days'>): ReportCell[][] {
  const marks = new Map(report.days.map((d) => [d.date, d.mark] as const));
  const start = mondayOf(report.from);
  return Array.from({ length: report.weeks_in_range }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDaysISO(start, w * 7 + d);
      const mark: ReportMark = date > report.to ? 'future' : (marks.get(date) ?? 'none');
      return { date, mark, today: date === report.to };
    }),
  );
}

/** Read out for screen readers. */
export function reportGridSummary(report: ProgressReport): string {
  const workouts = report.days.filter((d) => d.mark === 'workout').length;
  return `${report.days.length} active ${report.days.length === 1 ? 'day' : 'days'} in the last ${rangeLabel(report.range)}, ${workouts} with a workout`;
}

// ─── Table view ───────────────────────────────────────────────────────────────

export interface WeekRow {
  weekStart: string;
  /** "3 Nov – 9 Nov", or "This week" */
  label: string;
  sessions: number;
  minutes: number;
  distanceKm: number;
  activeDays: number;
  workoutDays: number;
  current: boolean;
}

/** The weeks as table rows, newest first: what the bars and the grid show, as numbers. */
export function weekRows(report: ProgressReport): WeekRow[] {
  const currentWeek = mondayOf(report.to);
  return report.weeks
    .map((w) => {
      const end = addDaysISO(w.week_start, 6);
      const inWeek = report.days.filter((d) => d.date >= w.week_start && d.date <= end);
      const current = w.week_start === currentWeek;
      return {
        weekStart: w.week_start,
        label: current ? 'This week' : `${dayLabel(w.week_start)} – ${dayLabel(end)}`,
        sessions: w.sessions,
        minutes: w.duration_minutes,
        distanceKm: w.distance_km,
        activeDays: inWeek.length,
        workoutDays: inWeek.filter((d) => d.mark === 'workout').length,
        current,
      };
    })
    .reverse();
}

/** True when there's nothing at all in the range: the page invites rather than charting zeros. */
export function reportIsEmpty(report: ProgressReport): boolean {
  return report.days.length === 0 && !report.strength && !report.weight;
}
