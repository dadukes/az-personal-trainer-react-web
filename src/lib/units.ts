/**
 * Unit conversion at the edges. The backend stores and expects canonical metric
 * (kg, cm); everything the user sees or types goes through here, keyed off
 * `profile.preferred_unit_system`. Never convert anywhere else.
 */

export type UnitSystem = 'metric' | 'imperial';

const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;

export const kgToLb = (kg: number) => kg * LB_PER_KG;
export const lbToKg = (lb: number) => lb / LB_PER_KG;
export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const inToCm = (inches: number) => inches * CM_PER_IN;

/** What a canonical value measures, which decides how it converts. */
export type Dimension = 'mass' | 'length' | 'unitless';

export function displayUnit(dimension: Dimension, system: UnitSystem): string {
  if (dimension === 'mass') return system === 'imperial' ? 'lb' : 'kg';
  if (dimension === 'length') return system === 'imperial' ? 'in' : 'cm';
  return '';
}

/** Canonical (kg / cm) → the user's unit. */
export function toDisplay(value: number, dimension: Dimension, system: UnitSystem): number {
  if (system === 'metric' || dimension === 'unitless') return value;
  return dimension === 'mass' ? kgToLb(value) : cmToIn(value);
}

/** The user's unit → canonical (kg / cm). */
export function fromDisplay(value: number, dimension: Dimension, system: UnitSystem): number {
  if (system === 'metric' || dimension === 'unitless') return value;
  return dimension === 'mass' ? lbToKg(value) : inToCm(value);
}

/** Rounds for display, dropping a trailing `.0`. */
export function formatNumber(value: number, decimals = 1): string {
  const factor = 10 ** decimals;
  return String(Math.round(value * factor) / factor);
}

/** A whole-number height in feet + inches, e.g. `5′11″`. */
export function formatFeetInches(cm: number): string {
  const totalIn = Math.round(cmToIn(cm));
  return `${Math.floor(totalIn / 12)}′${totalIn % 12}″`;
}

/** Height for display in the user's system: `180 cm` or `5′11″`. */
export function formatHeight(cm: number, system: UnitSystem): string {
  return system === 'imperial' ? formatFeetInches(cm) : `${formatNumber(cm)} cm`;
}
