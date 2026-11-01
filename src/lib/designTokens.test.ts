import { describe, expect, it } from 'vitest';

import css from '../index.css?raw';

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('\n}', start));
  return Object.fromEntries(
    [...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)].map(([, name, value]) => [name, value]),
  );
}

const light = block(':root');
const themes = { light, dark: { ...light, ...block("[data-theme='dark']") } };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text (4.5:1) and the backgrounds it's allowed on. Same list as the mobile app's test. */
const TEXT_PAIRS = [
  ['ink', 'ground'],
  ['ink', 'surface'],
  ['ink', 'sunken'],
  ['ink', 'tint'],
  ['ink-2', 'ground'],
  ['ink-2', 'surface'],
  ['ink-2', 'sunken'],
  ['ink-2', 'tint'],
  ['ink-3', 'ground'],
  ['ink-3', 'surface'],
  ['ink-3', 'sunken'],
  ['teal', 'ground'],
  ['teal', 'surface'],
  ['teal', 'tint'],
  ['sky', 'ground'],
  ['sky', 'surface'],
  ['gold', 'ground'],
  ['gold', 'surface'],
  ['gold', 'sunken'],
  ['danger', 'ground'],
  ['danger', 'surface'],
  ['danger', 'danger-tint'],
  ['on-aqua', 'aqua'],
  ['on-danger', 'danger-fill'],
  ['hero-ink', 'hero'],
  ['hero-sub', 'hero'],
  ['ground', 'ink'],
] as const;

/** Icons and marks that carry meaning (3:1). */
const MARK_PAIRS = [
  ['tab-on', 'surface'],
  ['ink-3', 'surface'],
  ['aqua', 'hero'],
] as const;

describe.each(['light', 'dark'] as const)('%s theme contrast', (name) => {
  const t: Record<string, string> = themes[name];

  it.each(TEXT_PAIRS)('%s text on %s passes 4.5:1', (fg, bg) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(MARK_PAIRS)('%s mark on %s passes 3:1', (fg, bg) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(3);
  });
});
