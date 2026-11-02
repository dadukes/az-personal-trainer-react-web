import { describe, expect, it } from 'vitest';

import { formatDuration, parseDurationDraft } from '@/lib/numberEntry';

describe('parseDurationDraft', () => {
  it('reads minutes and seconds, and hours', () => {
    expect(parseDurationDraft('32:45')).toBe(1965);
    expect(parseDurationDraft(' 1:05:30 ')).toBe(3930);
    expect(parseDurationDraft('0:45')).toBe(45);
  });

  it('reads a plain number as minutes, as the field used to be', () => {
    expect(parseDurationDraft('32')).toBe(1920);
    expect(parseDurationDraft('32,5')).toBe(1950);
  });

  it('is 0 when empty, and null when it is not a time', () => {
    expect(parseDurationDraft('')).toBe(0);
    expect(parseDurationDraft('32:75')).toBeNull();
    expect(parseDurationDraft('1:75:00')).toBeNull();
    expect(parseDurationDraft('abc')).toBeNull();
    expect(parseDurationDraft('1:2:3:4')).toBeNull();
  });

  it('round-trips with formatDuration', () => {
    expect(parseDurationDraft(formatDuration(3930))).toBe(3930);
  });
});
