import type { BodyMeasurementSource, BodyMetric } from '@/lib/api';
import { displayUnit, formatNumber, fromDisplay, toDisplay, type Dimension, type UnitSystem } from '@/lib/units';

/**
 * Display metadata for body metrics. Ranges mirror the backend's plausibility checks
 * (API_docs → Body measurements) in canonical units, so the sheet can reject a typo
 * before the round trip; the server still re-validates.
 */
export interface BodyMetricMeta {
  label: string;
  dimension: Dimension;
  /** Unit label for unit-less dimensions (shown as-is in every system). */
  fixedUnit?: string;
  min: number;
  max: number;
}

export const BODY_METRICS: Record<BodyMetric, BodyMetricMeta> = {
  weight_kg: { label: 'Weight', dimension: 'mass', min: 25, max: 350 },
  body_fat_pct: { label: 'Body fat', dimension: 'unitless', fixedUnit: '%', min: 2, max: 70 },
  lean_mass_kg: { label: 'Lean mass', dimension: 'mass', min: 15, max: 200 },
  waist_cm: { label: 'Waist', dimension: 'length', min: 40, max: 250 },
  hip_cm: { label: 'Hips', dimension: 'length', min: 40, max: 250 },
  chest_cm: { label: 'Chest', dimension: 'length', min: 40, max: 250 },
  arm_cm: { label: 'Arm', dimension: 'length', min: 15, max: 80 },
  thigh_cm: { label: 'Thigh', dimension: 'length', min: 25, max: 120 },
  vo2max_ml_kg_min: { label: 'VO2 max', dimension: 'unitless', fixedUnit: 'ml/kg/min', min: 10, max: 95 },
};

/** Picker order in the add sheet: the common ones first. */
export const BODY_METRIC_ORDER: BodyMetric[] = [
  'weight_kg',
  'waist_cm',
  'body_fat_pct',
  'hip_cm',
  'chest_cm',
  'arm_cm',
  'thigh_cm',
  'lean_mass_kg',
  'vo2max_ml_kg_min',
];

export function metricUnit(metric: BodyMetric, system: UnitSystem): string {
  const meta = BODY_METRICS[metric];
  return meta.fixedUnit ?? displayUnit(meta.dimension, system);
}

/** Canonical value → user-unit number. */
export function metricToDisplay(metric: BodyMetric, value: number, system: UnitSystem): number {
  return toDisplay(value, BODY_METRICS[metric].dimension, system);
}

/** User-unit number → canonical value. */
export function metricFromDisplay(metric: BodyMetric, value: number, system: UnitSystem): number {
  return fromDisplay(value, BODY_METRICS[metric].dimension, system);
}

/** e.g. `82.4 kg`, `32.5 in`, `18 %`. */
export function formatMetric(metric: BodyMetric, value: number, system: UnitSystem): string {
  const unit = metricUnit(metric, system);
  const shown = formatNumber(metricToDisplay(metric, value, system));
  return unit === '%' ? `${shown}%` : `${shown} ${unit}`;
}

/** A signed change, e.g. `−1.2 kg` / `+0.5 in`. Neutral wording — no good/bad. */
export function formatMetricChange(metric: BodyMetric, change: number, system: UnitSystem): string {
  const shown = metricToDisplay(metric, Math.abs(change), system);
  const sign = change > 0 ? '+' : change < 0 ? '−' : '±';
  const unit = metricUnit(metric, system);
  return `${sign}${formatNumber(shown)}${unit === '%' ? ' pts' : ` ${unit}`}`;
}

/** Device rows are read-only server-side — the next sync would restore them. */
export function isEditableSource(source: BodyMeasurementSource): boolean {
  return source === 'manual' || source === 'coach';
}

const SOURCE_APP_LABELS: Record<string, string> = {
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.samsung.android.app.shealth': 'Samsung Health',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.google.android.apps.healthdata': 'Health Connect',
  'com.google.android.apps.wear.companion': 'Pixel Watch',
  'com.strava': 'Strava',
  'com.withings.wiscale2': 'Withings',
  'cn.fitdays.fitdays': 'Fitdays',
  'com.ouraring.oura': 'Oura',
};

/** Friendly name for a Health Connect data origin; unknown packages read "your watch". */
export function sourceAppLabel(sourceApp: string | null): string {
  return (sourceApp && SOURCE_APP_LABELS[sourceApp]) ?? 'your watch';
}

/** Short provenance line for a history row. */
export function sourceLabel(source: BodyMeasurementSource, sourceApp: string | null): string {
  if (source === 'manual') return 'Added by you';
  if (source === 'coach') return 'From your coach chat';
  return `from ${sourceAppLabel(sourceApp)}`;
}
